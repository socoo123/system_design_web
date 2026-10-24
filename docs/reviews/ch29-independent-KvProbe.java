import java.util.*;
import java.util.concurrent.*;

/** Independent new-input probes against the actual authored Java class. */
class Ch29IndependentKvProbe {
  static int n=0;
  static void ok(boolean b) { n++; if(!b)throw new AssertionError("probe "+n); }
  static void rejects(Runnable r) {
    try { r.run(); throw new AssertionError("unexpected acceptance"); }
    catch(IllegalArgumentException|IllegalStateException expected) { n++; }
  }
  static KvLedger.Owner owner(String id,String boot) { return new KvLedger.Owner(id,7,boot); }
  public static void main(String[] args) throws Exception {
    var l=new KvLedger("multi",6,96);
    var a=owner("A","multi");var b=owner("B","multi");var c=owner("C","multi");
    ok(l.admit(a,16,16)&&l.admit(b,16,16)&&l.admit(c,16,16));
    ok(l.reserved()==6 && l.freeOrEvictable()==6);
    var shared=l.allocate(a);l.cacheFullBlock(a,shared);l.retainPrefix(b,shared);
    var bp=l.allocate(b);var cp=l.allocate(c);
    ok(l.refs(shared)==2&&l.refs(bp)==1&&l.refs(cp)==1);
    rejects(()->l.issue(List.of(a,b,c,b)));     // whole-batch validation, no partial pin
    ok(l.pins(shared)==0&&l.pins(bp)==0&&l.pins(cp)==0);
    var t=l.issue(List.of(a,b,c));
    ok(l.pins(shared)==2&&l.pins(bp)==1&&l.pins(cp)==1);
    ok(l.stop(a,KvLedger.Reason.CANCEL));
    ok(l.reserved()==6&&l.refs(shared)==2&&l.pins(shared)==2);
    ok(!l.admit(owner("D","multi"),1,1));   // unused physical blocks are still promised
    rejects(()->l.allocate(a));
    ok(l.complete(t,Set.of(a,b,c)));           // A keeps CANCEL; others EOS
    ok(l.reason(a)==KvLedger.Reason.CANCEL&&l.reason(b)==KvLedger.Reason.EOS);
    ok(l.reason(c)==KvLedger.Reason.EOS&&l.reserved()==0);
    ok(l.refs(shared)==0&&l.pins(shared)==0&&l.cached(shared));
    ok(l.refs(bp)==0&&l.pins(bp)==0&&l.refs(cp)==0&&l.pins(cp)==0);
    ok(!l.complete(t,Set.of(a,b,c))&&!l.stop(b,KvLedger.Reason.DEADLINE));
    var d=owner("D","multi");ok(l.admit(d,95,1));
    var newPages=new ArrayList<KvLedger.Handle>();for(int i=0;i<6;i++)newPages.add(l.allocate(d));
    rejects(()->l.refs(shared));                // slot reused with a new incarnation
    ok(!l.complete(t,Set.of(a)));              // cannot subtract D's references
    ok(newPages.stream().allMatch(p->l.refs(p)==1&&l.pins(p)==0));
    ok(l.stop(d,KvLedger.Reason.DEADLINE)&&l.reserved()==0);
    ok(!l.admit(d,95,1));                      // released same identity never reopens
    var x=owner("X","multi");ok(l.admit(x,1,16));ok(l.reserved()==2);
    var xp=l.allocate(x);var xt=l.issue(List.of(x));
    rejects(()->l.retainPrefix(x,xp));         // in-flight map cannot mutate
    var bad=owner("unknown","multi");rejects(()->l.issue(List.of(bad,x)));
    ok(l.pins(xp)==1&&l.reserved()==2);
    l.workerDied();ok(!l.complete(xt,Set.of(x))&&l.reserved()==2);
    ok(!l.admit(owner("afterdeath","multi"),1,1));
    var reboot=new KvLedger("fresh",2,48);var nx=owner("X","fresh");ok(reboot.admit(nx,1,16));
    var np=reboot.allocate(nx);var nt=reboot.issue(List.of(nx));
    ok(nt.id()==t.id());                       // deliberate numeric collision, different boot
    ok(!reboot.complete(t,Set.of(a))&&reboot.pins(np)==1);
    rejects(()->reboot.refs(xp));
    ok(reboot.complete(nt,Set.of(nx))&&reboot.reserved()==0);
    rejects(()->reboot.admit(owner("overflow","fresh"),Integer.MAX_VALUE,Integer.MAX_VALUE));
    // A two-reader cancellation/EOS race shares one sealed block and one ticket.
    for(int trial=0;trial<12;trial++) {
      var r=new KvLedger("r"+trial,4,48);var ra=owner("A","r"+trial);var rb=owner("B","r"+trial);
      ok(r.admit(ra,16,16)&&r.admit(rb,16,16));var h=r.allocate(ra);r.cacheFullBlock(ra,h);r.retainPrefix(rb,h);
      var ticket=r.issue(List.of(ra,rb));var go=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
      try {
        var f1=pool.submit(()->{await(go);r.stop(ra,KvLedger.Reason.CANCEL);r.stop(rb,KvLedger.Reason.CANCEL);});
        var f2=pool.submit(()->{await(go);r.complete(ticket,Set.of(ra,rb));});
        go.countDown();f1.get();f2.get();
      }finally{pool.shutdownNow();}
      ok(r.reserved()==0&&r.refs(h)==0&&r.pins(h)==0);
      ok(r.state(ra)==KvLedger.State.RELEASED&&r.state(rb)==KvLedger.State.RELEASED);
      ok(!r.complete(ticket,Set.of(ra,rb)));
    }
    System.out.println("{\"passed\":true,\"independentJavaAssertions\":"+n+"}");
  }
  static void await(CountDownLatch l) {try{l.await();}catch(InterruptedException e){throw new RuntimeException(e);}}
}
