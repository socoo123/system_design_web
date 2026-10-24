import java.util.*;
import java.util.concurrent.*;

public final class KvLedgerCheck {
    static int checks;
    static final List<String> scenarios = new ArrayList<>();
    static void check(boolean ok) { checks++; if (!ok) throw new AssertionError("check " + checks); }
    static KvLedger.Owner owner(String id, long gen, String boot) { return new KvLedger.Owner(id, gen, boot); }
    static void illegal(Runnable call) {
        boolean rejected = false;
        try { call.run(); } catch (IllegalArgumentException | IllegalStateException expected) { rejected = true; }
        check(rejected);
    }

    public static void main(String[] args) throws Exception {
        normalAndCreditBoundary();
        cancelWhileGpuStillUsesPage();
        sharedPrefixesAndIncarnations();
        generationAndWorkerBoot();
        eosCancelRaces();
        System.out.println("{\"passed\":true,\"assertions\":" + checks + ",\"scenarios\":[\""
                + String.join("\",\"", scenarios) + "\"]}");
    }

    static void normalAndCreditBoundary() {
        scenarios.add("normal iteration, EOS, credits and rounded lengths");
        var l = new KvLedger("w1", 4, 2560);
        var a = owner("a", 1, "w1");
        check(l.admit(a, 16, 1));             // ceil(17/16) == 2
        check(l.reserved() == 2);
        var p = l.allocate(a);
        var t = l.issue(List.of(a));
        check(l.pins(p) == 1 && l.refs(p) == 1);
        illegal(() -> l.allocate(a));         // maps cannot change during a launch
        check(l.complete(t, Set.of()));
        check(l.state(a) == KvLedger.State.RUNNING && l.reserved() == 2);
        check(l.complete(l.issue(List.of(a)), Set.of(a)));
        check(l.state(a) == KvLedger.State.RELEASED && l.reserved() == 0);
        check(l.refs(p) == 0 && l.reason(a) == KvLedger.Reason.EOS);
        illegal(() -> l.admit(owner("bad", 1, "w1"), Integer.MAX_VALUE, 1));
        illegal(() -> l.admit(owner("bad", 1, "w1"), 1, 0));
        var full = new KvLedger("full", 20480, 2560);
        for (int i = 0; i < 128; i++) check(full.admit(owner("r" + i, 1, "full"), 2048, 512));
        check(full.reserved() == 20480 && full.freeOrEvictable() == 20480);
        check(!full.admit(owner("r128", 1, "full"), 2048, 512));
    }

    static void cancelWhileGpuStillUsesPage() {
        scenarios.add("cancel before GPU retirement cannot sell credit or reuse page; duplicate completion");
        var l = new KvLedger("w1", 2, 2560);
        var a = owner("a", 1, "w1");
        var b = owner("b", 1, "w1");
        check(l.admit(a, 16, 16));
        var p = l.allocate(a);
        var t = l.issue(List.of(a));
        check(l.stop(a, KvLedger.Reason.CANCEL));
        check(l.state(a) == KvLedger.State.RETIRING && l.reserved() == 2);
        check(l.refs(p) == 1 && l.pins(p) == 1);
        check(!l.admit(b, 16, 16));            // a physically empty second page is not credit
        check(!l.stop(a, KvLedger.Reason.CANCEL));
        illegal(() -> l.issue(List.of(a)));
        check(l.complete(t, Set.of(a)));      // EOS cannot replace first CANCEL
        check(l.reason(a) == KvLedger.Reason.CANCEL && l.reserved() == 0);
        check(l.admit(b, 16, 16));
        var reused = l.allocate(b);
        check(reused.slot() == p.slot() && reused.incarnation() > p.incarnation());
        check(!l.complete(t, Set.of(a)));     // cannot decrement b's newly reused page
        check(l.refs(reused) == 1 && l.reserved() == 2);
        illegal(() -> l.refs(p));
    }

    static void sharedPrefixesAndIncarnations() {
        scenarios.add("shared full prefix, independently in-flight readers, cache eviction");
        var l = new KvLedger("w1", 4, 2560);
        var a = owner("a", 1, "w1"); var b = owner("b", 1, "w1");
        check(l.admit(a, 16, 16) && l.admit(b, 16, 16));
        var shared = l.allocate(a);
        illegal(() -> l.retainPrefix(b, shared)); // unsealed/partial sharing forbidden
        l.cacheFullBlock(a, shared); l.retainPrefix(b, shared);
        check(l.refs(shared) == 2);
        illegal(() -> l.retainPrefix(b, shared));
        var ta = l.issue(List.of(a)); var tb = l.issue(List.of(b));
        check(l.pins(shared) == 2);
        l.stop(a, KvLedger.Reason.CANCEL); l.complete(ta, Set.of());
        check(l.refs(shared) == 1 && l.pins(shared) == 1 && l.reserved() == 2);
        l.stop(b, KvLedger.Reason.DEADLINE); l.complete(tb, Set.of());
        check(l.refs(shared) == 0 && l.pins(shared) == 0 && l.cached(shared));
        var c = owner("c", 1, "w1"); check(l.admit(c, 32, 32));
        var fresh = l.allocate(c);
        check(fresh.slot() == shared.slot() && !l.cached(fresh));
        illegal(() -> l.retainPrefix(c, shared));
    }

    static void generationAndWorkerBoot() {
        scenarios.add("generation fencing and a new worker pool reject old callbacks");
        var l = new KvLedger("old", 2, 2560);
        var a1 = owner("a", 1, "old"); var a2 = owner("a", 2, "old");
        check(l.admit(a1, 16, 16)); l.allocate(a1);
        check(!l.admit(a2, 16, 16));
        var t = l.issue(List.of(a1)); l.complete(t, Set.of(a1));
        check(l.admit(a2, 16, 16)); var p = l.allocate(a2);
        check(!l.stop(a1, KvLedger.Reason.CANCEL));
        check(l.refs(p) == 1 && l.state(a2) == KvLedger.State.RUNNING);
        var pending = l.issue(List.of(a2)); l.workerDied();
        check(!l.complete(pending, Set.of(a2))); // dead pool is quarantined, not recycled
        var restarted = new KvLedger("new", 2, 2560);
        check(!restarted.admit(a2, 16, 16));
        var a3 = owner("a", 3, "new"); check(restarted.admit(a3, 16, 16));
        var np = restarted.allocate(a3); var nt = restarted.issue(List.of(a3));
        check(t.id() == nt.id());            // deliberate numeric collision across boots
        check(!restarted.complete(t, Set.of(a1)) && restarted.pins(np) == 1);
        check(!restarted.complete(pending, Set.of(a2)) && restarted.pins(np) == 1);
        check(restarted.complete(nt, Set.of(a3)) && restarted.reserved() == 0);
    }

    static void eosCancelRaces() throws Exception {
        scenarios.add("100 real CPU cancel/EOS races, all references returned once");
        for (int i = 0; i < 100; i++) {
            var l = new KvLedger("race" + i, 2, 2560);
            var a = owner("a", 1, "race" + i); check(l.admit(a, 16, 16));
            var p = l.allocate(a); var t = l.issue(List.of(a));
            var start = new CountDownLatch(1);
            var pool = Executors.newFixedThreadPool(2);
            try {
                Future<?> cancel = pool.submit(() -> { await(start); l.stop(a, KvLedger.Reason.CANCEL); });
                Future<?> eos = pool.submit(() -> { await(start); l.complete(t, Set.of(a)); });
                start.countDown(); cancel.get(); eos.get();
            } finally { pool.shutdownNow(); }
            check(l.state(a) == KvLedger.State.RELEASED && l.reserved() == 0);
            check(l.refs(p) == 0 && l.pins(p) == 0);
            check(!l.complete(t, Set.of(a)) && !l.stop(a, KvLedger.Reason.CANCEL));
        }
    }
    static void await(CountDownLatch start) {
        try { start.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
    }
}
