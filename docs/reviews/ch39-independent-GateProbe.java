import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Supplier;

class Ch39IndependentGateProbe {
    static final List<String> checks=new ArrayList<>();
    static void ok(boolean yes,String label){if(!yes)throw new AssertionError(label);checks.add(label);}
    static LoadBalancing.Gate ready(long id,int slots,AtomicLong now){
        var g=new LoadBalancing.Gate(id,slots,now::get);if(!g.ready(id))throw new AssertionError();return g;
    }
    static void rejects(Runnable action,String label){boolean thrown=false;try{action.run();}catch(IllegalStateException e){thrown=true;}ok(thrown,label);}
    static <T> T afterLock(LoadBalancing.Gate g, AtomicLong now,long moved,Supplier<T> action)throws Exception{
        var answer=new AtomicReference<T>();var error=new AtomicReference<Throwable>();
        Thread worker=new Thread(()->{try{answer.set(action.get());}catch(Throwable e){error.set(e);}});
        g.lock.lock();try{worker.start();long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(2);
            while(!g.lock.hasQueuedThread(worker)){if(System.nanoTime()-until>=0)throw new AssertionError("not queued");Thread.onSpinWait();}
            now.set(moved);
        }finally{g.lock.unlock();}
        worker.join(2000);if(worker.isAlive()||error.get()!=null)throw new AssertionError(error.get());return answer.get();
    }
    static class PlannedRandom extends Random{
        int at;final int[] values;final List<Integer> bounds=new ArrayList<>();
        PlannedRandom(int...values){this.values=values;}
        public int nextInt(int bound){bounds.add(bound);return values[at++];}
    }
    static LoadBalancing.Endpoint ep(String id,long inc,LoadBalancing.Phase p,boolean healthy,int active){return new LoadBalancing.Endpoint(id,inc,p,healthy,active);}
    public static void main(String[] args)throws Exception{
        var a=ep("a",41,LoadBalancing.Phase.READY,true,20);
        var b=ep("b",42,LoadBalancing.Phase.READY,true,3);
        var c=ep("c",43,LoadBalancing.Phase.READY,true,8);
        var cold=ep("warm",44,LoadBalancing.Phase.WARMING,true,0);
        var gone=ep("drain",45,LoadBalancing.Phase.DRAINING,true,0);
        var sick=ep("sick",46,LoadBalancing.Phase.READY,false,0);
        var failed=ep("failed",47,LoadBalancing.Phase.UNHEALTHY,true,0);
        var rnd=new PlannedRandom(2,0);
        ok(LoadBalancing.choose(List.of(cold,a,gone,b,sick,c,failed),rnd)==c,"P2C compares only two sampled eligible endpoints");
        ok(rnd.bounds.equals(List.of(3,2)),"filter precedes sampling; second sample excludes first");
        ok(LoadBalancing.choose(List.of(cold,gone,sick,failed),new Random(8))==null,"no READY+healthy target fails closed");
        var tie=ep("tie",48,LoadBalancing.Phase.READY,true,3);
        ok(LoadBalancing.choose(List.of(b,tie),new PlannedRandom(1,0))==tie,"tie remains within selected ready pair");
        var now=new AtomicLong(5000);
        var fresh=ready(102,2,now);var p=fresh.tryAdmit(102,6000);
        rejects(()->fresh.beginDrain(101,900,100),"archived stale-drain P1: old incarnation cannot close fresh READY gate");
        ok(fresh.tryAdmit(102,6000)!=null,"current incarnation still admits after stale command");
        ok(!fresh.unhealthy(101)&&!fresh.acknowledgeRemoval(101,900)&&!fresh.ready(101),"old unhealthy/ACK/ready callbacks do not mutate fresh gate");
        ok(fresh.activeCount()==2,"old callbacks preserve both current permits");
        var separate=ready(103,2,now);ok(!separate.finish(p),"foreign completion cannot free a fresh incarnation");
        ok(fresh.finish(p)&&!fresh.finish(p),"first finish succeeds once, duplicate does not release another slot");
        ok(fresh.activeCount()==1,"double finish preserves other active work");
        var d=ready(201,1,now);var held=d.tryAdmit(201,6000);long cutoff=d.beginDrain(201,73,80);
        rejects(()->d.beginDrain(200,73,100000),"stale-inc command also rejects on same drain revision before idempotent return");
        now.set(5030);ok(d.beginDrain(201,73,100000)==cutoff,"same-revision repeat cannot extend cutoff");
        rejects(()->d.beginDrain(201,74,80),"new revision cannot restart an existing drain");
        ok(d.tryAdmit(201,6000)==null,"stale selector cannot acquire work after local close");
        ok(!d.ready(201)&&!d.unhealthy(200),"late health success cannot reopen draining gate");
        ok(!d.acknowledgeRemoval(201,72)&&!d.acknowledgeRemoval(200,73),"wrong ACK revision/incarnation is rejected");
        ok(d.pollDrain()==LoadBalancing.DrainDecision.WAIT,"active work without ACK waits before cutoff");
        ok(d.acknowledgeRemoval(201,73),"exact trusted withdrawal ACK recorded");
        now.set(cutoff);ok(d.pollDrain()==LoadBalancing.DrainDecision.FORCE_REQUIRED,"at exact cutoff active work needs forced path");
        ok(d.activeCount()==1,"FORCE_REQUIRED does not invent physical completion");
        ok(d.finish(held)&&d.activeCount()==0,"physical completion frees original permit");
        ok(d.pollDrain()==LoadBalancing.DrainDecision.CLEAN_EXIT,"exact ACK plus actual zero permits clean exit");
        var idle=ready(202,1,now);idle.beginDrain(202,75,20);
        ok(idle.pollDrain()==LoadBalancing.DrainDecision.WAIT,"zero work without all-ingress evidence is not clean exit");
        now.addAndGet(20);ok(idle.pollDrain()==LoadBalancing.DrainDecision.FORCE_REQUIRED,"missing ACK retains bounded forced path even idle");
        var dead=ready(203,1,now);var prior=dead.tryAdmit(203,6000);
        ok(dead.unhealthy(203)&&!dead.ready(203),"UNHEALTHY cannot be revived in the old incarnation");
        ok(dead.activeCount()==1&&dead.tryAdmit(203,6000)==null,"health loss closes admission without clearing work");
        ok(dead.finish(prior)&&!dead.finish(prior),"old unhealthy work still completes exactly once");
        var pending=new LoadBalancing.Gate(204,1,now::get);
        rejects(()->pending.beginDrain(204,76,20),"cannot drain before WARMING has passed external readiness checks");
        ok(pending.ready(204),"invalid early drain leaves WARMING intact");
        // Every one of twenty stale ingress views can select the same App, only three get permits.
        var race=ready(301,3,now);var go=new CountDownLatch(1);var done=new CountDownLatch(20);
        var winners=new ConcurrentLinkedQueue<LoadBalancing.Permit>();var threads=new ArrayList<Thread>();
        for(int i=0;i<20;i++){var th=new Thread(()->{try{go.await();var ticket=race.tryAdmit(301,6000);if(ticket!=null)winners.add(ticket);}catch(InterruptedException e){throw new RuntimeException(e);}finally{done.countDown();}});threads.add(th);th.start();}
        go.countDown();ok(done.await(3,TimeUnit.SECONDS),"twenty ingress contenders finish");
        ok(winners.size()==3&&race.activeCount()==3,"twenty stale ingress snapshots cannot exceed authoritative three slots");
        for(var ticket:winners)race.finish(ticket);ok(race.activeCount()==0,"all actual winners finish without leakage");
        // Real handler remains alive while the caller has abandoned waiting.
        var actual=ready(302,1,now);var entered=new CountDownLatch(1);var physicalEnd=new CountDownLatch(1);
        Thread handler=new Thread(()->{var ticket=actual.tryAdmit(302,6000);if(ticket==null)throw new AssertionError();entered.countDown();try{physicalEnd.await();}catch(InterruptedException e){throw new RuntimeException(e);}finally{actual.finish(ticket);}});
        handler.start();ok(entered.await(2,TimeUnit.SECONDS),"physical handler has acquired its permit");
        ok(handler.isAlive()&&actual.activeCount()==1&&actual.tryAdmit(302,6000)==null,"caller abandonment cannot release live handler capacity");
        physicalEnd.countDown();handler.join(2000);ok(!handler.isAlive()&&actual.activeCount()==0,"only physical handler completion releases capacity");
        // Lock-contention observations use independent, non-author test inputs.
        now.set(10000);var locked=ready(401,1,now);
        ok(afterLock(locked,now,10012,()->locked.tryAdmit(401,10012))==null,"admission expires while blocked on implementation lock");
        ok(locked.activeCount()==0,"expired lock waiter adds no active record");
        now.set(11000);var drainLocked=ready(402,1,now);
        long delayedCutoff=afterLock(drainLocked,now,11070,()->drainLocked.beginDrain(402,85,15));
        ok(delayedCutoff==11085,"drain relative budget starts from lock-after observation");
        ok(afterLock(drainLocked,now,11085,drainLocked::pollDrain)==LoadBalancing.DrainDecision.FORCE_REQUIRED,"poll observes cutoff crossed during lock wait");
        // Valid clock-domain differences remain within 2^62 as specified by the adapter.
        long[] starts={-4000,-1,0,Long.MAX_VALUE-12,Long.MIN_VALUE+12};
        for(int i=0;i<starts.length;i++){
            var tick=new AtomicLong(starts[i]);var wrap=ready(500+i,1,tick);long end=tick.get()+25;
            var ticket=wrap.tryAdmit(500+i,end);ok(ticket!=null,"valid relative deadline accepts across signed ticks "+i);
            wrap.finish(ticket);tick.set(end);ok(wrap.tryAdmit(500+i,end)==null,"exact relative deadline rejects across signed ticks "+i);
        }
        now.set(1);var invalid=ready(601,1,now);
        rejects(()->invalid.beginDrain(601,1,-1),"negative drain budget rejected");
        rejects(()->invalid.beginDrain(601,1,1L<<62),"ambiguous half-range drain budget rejected");
        ok(invalid.tryAdmit(601,10)!=null,"invalid drain budget leaves current gate open");
        System.out.println("PASS "+checks.size()+" independent assertions");for(String label:checks)System.out.println(label);
    }
}
