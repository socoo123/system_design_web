import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

class Ch38IndependentProbe {
    static final List<String> cases=new ArrayList<>();
    static void check(String name,boolean ok){if(!ok)throw new AssertionError(name);cases.add(name);}
    static void fails(String name,Class<? extends Throwable> expected,CompletableFuture<?> f)throws Exception{
        try{f.get(3,TimeUnit.SECONDS);throw new AssertionError(name+": accepted");}
        catch(ExecutionException e){check(name,expected.isInstance(e.getCause()));}
    }
    public static void main(String[] args)throws Exception{
        long base=1_799_999_000_000L;
        var e=AgeBudget.Evidence.primary(83,base,false);
        var absent=AgeBudget.Evidence.primary(84,base,true);
        check("positive and negative hard lifetimes",e.hardExpiresMs()==base+20_000&&absent.hardExpiresMs()==base+5_000);
        check("HTTP cap at early age",e.sharedSeconds(base+1_900)==10);
        check("last fractional lifetime floors to zero",e.sharedSeconds(base+16_999)==0&&e.canSend(base+16_999));
        check("zero n does not bypass hard send check",e.sharedSeconds(base+17_000)==0&&!e.canSend(base+17_000));
        check("late response cannot send",!e.canSend(base+40_000)&&e.sharedSeconds(base+40_000)==0);
        check("L1 remaining hard deadline",e.l1Expires(base+17_500)==base+18_000);
        check("negative HTTP remainder",absent.sharedSeconds(base+1_001)==0&&absent.canSend(base+1_001));
        check("negative strict send boundary",!absent.canSend(base+2_000));
        boolean fixed=true;
        for(long offset:new long[]{0,1_000,8_000,16_000,17_999})fixed&=e.l1Expires(base+offset)<=base+18_000&&e.hardExpiresMs()==base+20_000;
        check("repeated copies cannot renew hard age",fixed);
        int safeCases=0;
        for(long sourceSkew:new long[]{-1_000,0,1_000})for(long appSkew:new long[]{-1_000,0,1_000})for(long elapsed:new long[]{0,5_000,15_000,17_500,20_000}){
            var proof=AgeBudget.Evidence.primary(1,base+sourceSkew,false);
            long now=base+elapsed+appSkew;
            if(proof.canSend(now)){
                long n=proof.sharedSeconds(now);
                if(n<0||n>10||base+elapsed+1_000+n*1_000>base+20_000)throw new AssertionError("physical age envelope");
                safeCases++;
            }
        }
        check("clock corner and final-send grid",safeCases>20);
        try{new AgeBudget.Evidence(-1,base,base+20_000);throw new AssertionError("negative revision");}
        catch(IllegalArgumentException expected){cases.add("negative version constructor rejected");}

        var pool=Executors.newFixedThreadPool(4);
        var ended=new LinkedBlockingQueue<Boolean>();
        Executor tracking=task->pool.execute(()->{try{task.run();}finally{ended.offer(true);}});
        var release=new CountDownLatch(1);var entered=new CountDownLatch(1);
        try{
            var starts=new AtomicInteger();var physical=new AtomicInteger();
            Supplier<String> load=()->{
                starts.incrementAndGet();physical.incrementAndGet();entered.countDown();
                try{if(!release.await(5,TimeUnit.SECONDS))throw new AssertionError("release deadline");return "v83";}
                catch(InterruptedException ex){Thread.currentThread().interrupt();throw new CompletionException(ex);}
                finally{physical.decrementAndGet();}
            };
            var group=new SingleFlight<String>(tracking);
            var first=group.join("tenant9|ja|gzip",load);check("loader actually starts",entered.await(3,TimeUnit.SECONDS));
            var follower=group.join("tenant9|ja|gzip",load);
            var timeout=group.join("tenant9|ja|gzip",load).orTimeout(25,TimeUnit.MILLISECONDS);
            var cancelled=group.join("tenant9|ja|gzip",load);check("private waiter cancellation",cancelled.cancel(true));
            check("private waiter completion isolated",first.complete("caller-owned-result")&&first.get().equals("caller-owned-result"));
            fails("waiter timeout propagated",TimeoutException.class,timeout);
            check("timeouts and cancellation retain actual work",starts.get()==1&&physical.get()==1&&!follower.isDone());
            var late=group.join("tenant9|ja|gzip",load);check("later arrival still shares active loader",starts.get()==1&&!late.isDone());
            release.countDown();check("other waiter receives actual result",follower.get(3,TimeUnit.SECONDS).equals("v83"));
            check("late waiter receives same actual result",late.get(3,TimeUnit.SECONDS).equals("v83"));
            check("loader physically ended before fresh run",ended.poll(3,TimeUnit.SECONDS)!=null&&physical.get()==0);
            check("same key may reload after physical completion",group.join("tenant9|ja|gzip",()->"v84").get(3,TimeUnit.SECONDS).equals("v84"));ended.poll(3,TimeUnit.SECONDS);
            var broken=group.join("failure",()->{throw new IllegalStateException("origin failed");});
            fails("loader exception reaches waiter",IllegalStateException.class,broken);ended.poll(3,TimeUnit.SECONDS);
            check("failed same key can retry after actual end",group.join("failure",()->"recovered").get(3,TimeUnit.SECONDS).equals("recovered"));ended.poll(3,TimeUnit.SECONDS);
            var attempts=new AtomicInteger();
            var rejectOnce=new SingleFlight<String>(task->{if(attempts.getAndIncrement()==0)throw new RejectedExecutionException("full");tracking.execute(task);});
            fails("executor rejection completes waiter",RejectedExecutionException.class,rejectOnce.join("a",()->"ignored"));
            check("executor rejection does not strand key",rejectOnce.join("a",()->"accepted").get(3,TimeUnit.SECONDS).equals("accepted"));ended.poll(3,TimeUnit.SECONDS);
            var other=new SingleFlight<String>(tracking);
            check("another Group has independent leader",other.join("tenant9|ja|gzip",()->"other-process-model").get(3,TimeUnit.SECONDS).equals("other-process-model"));ended.poll(3,TimeUnit.SECONDS);
            var direct=new SingleFlight<String>(Runnable::run);var calls=new AtomicInteger();
            check("synchronous executor removes completed call",direct.join("same",()->"v"+calls.incrementAndGet()).join().equals("v1")&&direct.join("same",()->"v"+calls.incrementAndGet()).join().equals("v2"));
        }finally{release.countDown();pool.shutdownNow();pool.awaitTermination(3,TimeUnit.SECONDS);}
        System.out.println("{\"passed\":true,\"checks\":"+cases.size()+",\"safeClockGridCases\":"+safeCases+",\"cases\":[\""+String.join("\",\"",cases)+"\"]}");
    }
}
