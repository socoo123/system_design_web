import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.LongSupplier;

class GatewayFixedReview {
  static int checks;
  static void check(boolean b,String what){checks++;if(!b)throw new AssertionError(what);}
  static final class Clock implements LongSupplier {
    final AtomicLong now=new AtomicLong();
    Object owner;
    final AtomicInteger calls=new AtomicInteger();
    public long getAsLong(){
      if(owner==null||!Thread.holdsLock(owner))throw new AssertionError("clock sampled outside breaker monitor");
      calls.incrementAndGet();return now.get();
    }
    GatewayPolicy.Breaker breaker(){var b=new GatewayPolicy.Breaker(this);owner=b;return b;}
  }
  static void blocked(Thread t) throws Exception {
    long stop=System.nanoTime()+2_000_000_000L;
    while(t.getState()!=Thread.State.BLOCKED&&System.nanoTime()<stop)Thread.sleep(1);
    check(t.getState()==Thread.State.BLOCKED,"actual callback waits on occupied monitor");
  }
  static void makeOpen(GatewayPolicy.Breaker b){for(int i=0;i<100;i++)b.complete(b.enter(),false);}
  static void clockAndWindow() throws Exception {
    Clock c=new Clock();var b=c.breaker();List<GatewayPolicy.Ticket> physicallyOld=new ArrayList<>();
    for(int i=0;i<99;i++)physicallyOld.add(b.enter());
    c.now.set(10001);b.complete(b.enter(),true);
    for(var ticket:physicallyOld)b.complete(ticket,false);
    check(b.state==GatewayPolicy.State.OPEN,"late physical completions observed now legitimately open new observation window");
    check(c.calls.get()==200,"entry and completion each sample under monitor");
    for(int edge:new int[]{9999,10000}){
      Clock t=new Clock();var w=t.breaker();for(int i=0;i<99;i++)w.complete(w.enter(),false);
      t.now.set(edge);w.complete(w.enter(),true);
      check((w.state==GatewayPolicy.State.OPEN)==(edge==9999),"exact ten-second observed-window boundary");
      if(edge==10000)check(w.samples.size()==1&&w.samples.peek().observedMs()==10000,"all old observations expire exactly at 10000");
    }
    Clock t=new Clock();var w=t.breaker();makeOpen(w);
    AtomicReference<GatewayPolicy.Ticket> probe=new AtomicReference<>();AtomicReference<Throwable> error=new AtomicReference<>();
    Thread acquire=new Thread(()->{try{probe.set(w.enter());}catch(Throwable e){error.set(e);}});
    synchronized(w){acquire.start();blocked(acquire);t.now.set(5000);}
    acquire.join();if(error.get()!=null)throw new AssertionError(error.get());
    check(probe.get()!=null&&probe.get().probe,"cooldown uses post-lock time, not pre-lock sample");
    Thread finish=new Thread(()->{try{w.complete(probe.get(),false);}catch(Throwable e){error.set(e);}});
    synchronized(w){finish.start();blocked(finish);t.now.set(6000);}
    finish.join();if(error.get()!=null)throw new AssertionError(error.get());
    check(w.retryAt==11000,"failed-probe cooldown starts when terminal callback is observed under lock");
    t.now.set(10999);check(w.enter()==null,"new cooldown excludes 10999");
    t.now.set(11000);var success=w.enter();check(success!=null&&success.probe,"new cooldown admits exact boundary");
    w.complete(success,true);long epoch=w.epoch;
    w.complete(probe.get(),false);w.complete(success,false);
    check(w.state==GatewayPolicy.State.CLOSED&&w.epoch==epoch,"late and duplicate terminal observations cannot change new epoch");
    for(var m:GatewayPolicy.Breaker.class.getDeclaredMethods()){
      if(m.getName().equals("enter"))check(m.getParameterCount()==0,"entry accepts no outside timestamp");
      if(m.getName().equals("complete"))check(Arrays.equals(m.getParameterTypes(),new Class<?>[]{GatewayPolicy.Ticket.class,boolean.class}),"completion accepts no outside timestamp");
    }
  }
  record Observation(long at,boolean success){}
  static void oracleTrace(){
    Clock c=new Clock();var actual=c.breaker();Random random=new Random(17311);
    GatewayPolicy.State expected=GatewayPolicy.State.CLOSED;long retryAt=0,now=0;List<Observation> observations=new ArrayList<>();int opens=0;
    for(int i=0;i<1800;i++){
      now+=random.nextInt(100);c.now.set(now);
      boolean admitted=expected!=GatewayPolicy.State.OPEN||now>=retryAt;
      var ticket=actual.enter();check((ticket!=null)==admitted,"admission oracle with monitored observation clock");
      if(!admitted)continue;
      boolean probe=expected==GatewayPolicy.State.OPEN;boolean success=random.nextInt(10)<4;
      if(probe){expected=success?GatewayPolicy.State.CLOSED:GatewayPolicy.State.OPEN;observations.clear();if(!success)retryAt=now+5000;}
      else{
        observations.add(new Observation(now,success));final long current=now;
        observations.removeIf(o->current-o.at>=10000);
        if(observations.size()>=100&&observations.stream().filter(o->!o.success).count()*2>=observations.size()){
          expected=GatewayPolicy.State.OPEN;retryAt=now+5000;observations.clear();opens++;
        }
      }
      actual.complete(ticket,success);check(actual.state==expected&&actual.samples.size()==observations.size(),"full-list observation-window oracle");
      actual.complete(ticket,!success);check(actual.state==expected,"duplicate observation ignored in randomized trace");
    }
    check(opens>=3,"oracle trace exercised repeated closed/open recovery cycles");
  }
  static void unchangedPolicies(){
    Random r=new Random(17);var credits=new GatewayPolicy.RetryBudget();int o=0,n=0,stored=0,part=0;
    for(int i=0;i<5000;i++){
      if(r.nextBoolean()){o++;credits.originalAdmitted();if(++part==20){part=0;stored=Math.min(125,stored+1);}}
      else{boolean got=credits.takeRetry();check(got==(stored>0),"final-source retry budget oracle");if(got){stored--;n++;}}
    }
    check(n<=o/20,"final-source cumulative bound");
    var d=GatewayPolicy.Deadline.afterPolicy(1000,1050);
    check(d.upstreamEndMs()==1260&&d.nextAttemptMs(1250,80)==10,"final-source deadline remains fixed");
    check(!GatewayPolicy.mayRetry(new GatewayPolicy.Replay("POST",true,false,1,GatewayPolicy.Failure.TIMEOUT),d,1100,0),"POST key cannot bypass conservative proxy gate");
  }
  public static void main(String[] args)throws Exception{
    clockAndWindow();oracleTrace();unchangedPolicies();
    System.out.println("PASS "+checks+" independent fixed-clock/oracle/concurrency assertions; observation-time semantics");
  }
}
