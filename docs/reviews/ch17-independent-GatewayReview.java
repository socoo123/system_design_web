import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

class GatewayIndependentReview {
  static int checks;
  static void check(boolean b, String what) { checks++; if (!b) throw new AssertionError(what); }
  static void together(int count, Runnable action) throws Exception {
    CountDownLatch start=new CountDownLatch(1);
    List<Thread> ts=new ArrayList<>();
    AtomicReference<Throwable> error=new AtomicReference<>();
    for(int i=0;i<count;i++) { Thread t=new Thread(()->{try{start.await();action.run();}catch(Throwable e){error.compareAndSet(null,e);}});ts.add(t);t.start(); }
    start.countDown();for(Thread t:ts)t.join();if(error.get()!=null)throw new AssertionError(error.get());
  }
  static void normalPolicy() throws Exception {
    GatewayPolicy.Replay get=new GatewayPolicy.Replay("GET",true,false,1,GatewayPolicy.Failure.RESET);
    Random random=new Random(170023);
    for(int n=0;n<1500;n++) {
      long start=100_000+random.nextInt(5000), policy=random.nextInt(400), now=start+random.nextInt(500), wait=random.nextInt(21);
      GatewayPolicy.Deadline d=GatewayPolicy.Deadline.afterPolicy(start,start+policy);
      long expected=Math.min(start+policy+240,start+260);
      check(d.endMs()==start+300&&d.upstreamEndMs()==expected,"fixed one-clock expiry oracle");
      check(GatewayPolicy.mayRetry(get,d,now,wait)==(expected-now-wait>=20),"remaining-time replay oracle");
    }
    GatewayPolicy.RetryBudget credit=new GatewayPolicy.RetryBudget();
    int original=0,retries=0,remainder=0,stored=0;
    for(int step=0;step<20_000;step++) {
      if(random.nextInt(10)<7) {
        credit.originalAdmitted();original++;
        if(++remainder==20){stored=Math.min(125,stored+1);remainder=0;}
      } else {
        boolean actual=credit.takeRetry(), expected=stored>0;
        check(actual==expected,"integer-credit reference model");
        if(actual){stored--;retries++;}
      }
    }
    check(retries<=original/20,"cumulative credits never become time-window allowance");
    GatewayPolicy.RetryBudget concurrent=new GatewayPolicy.RetryBudget();
    AtomicInteger os=new AtomicInteger(),rs=new AtomicInteger();
    together(12,()->{for(int i=0;i<1000;i++){concurrent.originalAdmitted();os.incrementAndGet();if(concurrent.takeRetry())rs.incrementAndGet();}});
    while(concurrent.takeRetry())rs.incrementAndGet();
    check(rs.get()<=os.get()/20,"simultaneous original earning and retry spending");
    GatewayPolicy.ActiveStreams streams=new GatewayPolicy.ActiveStreams();
    List<GatewayPolicy.StreamPermit> held=new ArrayList<>();
    for(int i=0;i<780;i++)held.add(streams.start());
    CountDownLatch contenders=new CountDownLatch(80), release=new CountDownLatch(1);
    AtomicInteger admitted=new AtomicInteger();List<Thread> workers=new ArrayList<>();
    for(int i=0;i<80;i++){Thread t=new Thread(()->{GatewayPolicy.StreamPermit p=streams.start();if(p!=null)admitted.incrementAndGet();contenders.countDown();try{release.await();}catch(InterruptedException e){throw new RuntimeException(e);}if(p!=null)p.transportTerminated();});workers.add(t);t.start();}
    contenders.await();check(admitted.get()==20,"80 real threads compete for 20 remaining stream slots");
    check(streams.start()==null,"logical caller timeout cannot release the 800 occupied transports");
    release.countDown();for(Thread t:workers)t.join();
    together(32,held.get(0)::transportTerminated);
    for(GatewayPolicy.StreamPermit p:held)p.transportTerminated();
    int recovered=0;while(streams.start()!=null)recovered++;
    check(recovered==800,"duplicate callbacks cannot leak or over-release stream permits");
    GatewayPolicy.Breaker breaker=new GatewayPolicy.Breaker();
    List<GatewayPolicy.Ticket> initial=new ArrayList<>();
    for(int i=0;i<100;i++)initial.add(breaker.enter(100));
    for(int i=0;i<100;i++)breaker.complete(initial.get(i),i<50,100+i);
    check(breaker.state==GatewayPolicy.State.OPEN,"50 percent completed-health boundary");
    AtomicInteger probes=new AtomicInteger();AtomicReference<GatewayPolicy.Ticket> winner=new AtomicReference<>();
    together(60,()->{GatewayPolicy.Ticket t=breaker.enter(5199);if(t!=null){probes.incrementAndGet();winner.set(t);}});
    check(probes.get()==1,"60 simultaneous contenders admit one local probe");
    together(32,()->breaker.complete(winner.get(),true,5200));
    check(breaker.state==GatewayPolicy.State.CLOSED,"duplicate probe completion closes exactly once");
    breaker.complete(initial.get(0),false,5201);
    check(breaker.state==GatewayPolicy.State.CLOSED,"old epoch completion cannot reopen the new state");
  }
  public static void main(String[] args) throws Exception {
    normalPolicy();
    // Independently sampled transport-completion times can reach a synchronized
    // callback out of order when the callback thread was descheduled first.
    GatewayPolicy.Breaker b=new GatewayPolicy.Breaker();
    List<GatewayPolicy.Ticket> delayed=new ArrayList<>();
    for(int i=0;i<99;i++)delayed.add(b.enter(0));
    b.complete(b.enter(10001),true,10001);  // current, in-window success
    for(GatewayPolicy.Ticket t:delayed)b.complete(t,false,0); // old completion timestamps
    String observed=b.state.toString();
    int realWindowCount=1;  // at current 10001, all 0ms samples have expired
    System.out.println("PASS "+checks+" independent normal/oracle/concurrency checks");
    System.out.println("OUT_OF_ORDER_WINDOW observed="+observed+" expected=CLOSED current=10001 samples_in_window="+realWindowCount+" retained="+b.samples.size());
    if(b.state!=GatewayPolicy.State.CLOSED)System.out.println("FINDING: callback timestamp order is an undocumented additional requirement");
  }
}
