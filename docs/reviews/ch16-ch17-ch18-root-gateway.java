// Root integration probes against the actual Java policy core; local semantics only.
class RootGatewayProbe {
  static int checks;
  static void check(boolean v, String s) { checks++; if (!v) throw new AssertionError(s); }
  public static void main(String[] args) {
    var deadline=GatewayPolicy.Deadline.afterPolicy(1000,1020);
    check(deadline.nextAttemptMs(1260,80)==0,"no fresh budget at the old upstream deadline");
    check(deadline.nextAttemptMs(1259,80)==1,"only one remaining millisecond");
    var latePolicy=GatewayPolicy.Deadline.afterPolicy(1000,1090);
    check(latePolicy.nextAttemptMs(1200,80)==60,"policy delay consumes end-to-end budget");
    for (String method: new String[]{"GET","HEAD","POST","PUT","DELETE"}) {
      var request=new GatewayPolicy.Replay(method,true,false,1,GatewayPolicy.Failure.RESET);
      check(GatewayPolicy.mayRetry(request,deadline,1120,20)==(method.equals("GET")||method.equals("HEAD")),"conservative method policy");
    }
    check(!GatewayPolicy.mayRetry(new GatewayPolicy.Replay("GET",true,true,1,GatewayPolicy.Failure.RESET),deadline,1100,0),"no replay after client output");
    check(!GatewayPolicy.mayRetry(new GatewayPolicy.Replay("GET",true,false,2,GatewayPolicy.Failure.RESET),deadline,1100,0),"no third attempt");
    var credits=new GatewayPolicy.RetryBudget();
    check(!credits.takeRetry(),"empty at startup");
    for(int n=0;n<2500;n++) credits.originalAdmitted();
    int burst=0; while(credits.takeRetry()) burst++;
    check(burst==125,"saved credit burst is explicit, not a one-second rate");
    check(burst>5,"5 percent cumulative credit cannot claim a per-second ratio");
    var streams=new GatewayPolicy.ActiveStreams();
    GatewayPolicy.StreamPermit first=null;
    for(int n=0;n<800;n++) { var permit=streams.start();check(permit!=null,"admitted within bound");if(n==0)first=permit; }
    check(streams.start()==null,"full before actual transport termination");
    first.transportTerminated(); first.transportTerminated();
    check(streams.start()!=null&&streams.start()==null,"one slot released once");
    var clock=new java.util.concurrent.atomic.AtomicLong();
    var observed=new java.util.concurrent.atomic.AtomicInteger();
    var reference=new java.util.concurrent.atomic.AtomicReference<GatewayPolicy.Breaker>();
    var breaker=new GatewayPolicy.Breaker(() -> {
      if(reference.get()!=null) check(Thread.holdsLock(reference.get()),"breaker samples its clock while holding its monitor");
      observed.incrementAndGet(); return clock.get();
    });
    reference.set(breaker);
    var stale=breaker.enter();
    for(int n=0;n<100;n++) { clock.set(n); breaker.complete(breaker.enter(),false); }
    check(breaker.state==GatewayPolicy.State.OPEN,"minimum failed observed sample opens");
    clock.set(5098);check(breaker.enter()==null,"wait the full five seconds");
    clock.set(5099);var probe=breaker.enter();
    check(probe!=null&&probe.probe&&breaker.enter()==null,"one probe only");
    clock.set(5100);breaker.complete(stale,true);
    check(breaker.state==GatewayPolicy.State.HALF_OPEN,"old ordinary completion cannot close half-open");
    clock.set(5101);breaker.complete(probe,false);
    clock.set(10100);check(breaker.state==GatewayPolicy.State.OPEN&&breaker.enter()==null,"failed probe starts a new wait");
    clock.set(10101);var next=breaker.enter();clock.set(10102);breaker.complete(next,true);
    check(breaker.state==GatewayPolicy.State.CLOSED,"new generation successful probe closes");
    clock.set(10103);breaker.complete(probe,true);
    check(breaker.state==GatewayPolicy.State.CLOSED,"duplicate old probe result ignored");
    check(observed.get()>100,"real policy uses injected observed clock");
    clock.set(20000);
    var window=new GatewayPolicy.Breaker(clock::get);
    var delayed=new java.util.ArrayList<GatewayPolicy.Ticket>();
    for(int n=0;n<99;n++) delayed.add(window.enter());
    clock.set(30001);
    for(var ticket:delayed) window.complete(ticket,false);
    check(window.samples.size()==99&&window.state==GatewayPolicy.State.CLOSED,
      "late callbacks are dated at observation, not at ticket creation");
    clock.set(40001);window.complete(window.enter(),true);
    check(window.samples.size()==1&&window.state==GatewayPolicy.State.CLOSED,
      "samples observed exactly ten seconds ago expire together");
    System.out.println("RootGatewayProbe: "+checks+" checks passed (Java17 local policy only)");
  }
}
