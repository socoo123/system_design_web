import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Independent new-input probes of actual teaching classes; not GPU/etcd/LLM tests. */
final class RootProbe {
  private static int checks;
  private static void ok(boolean condition, String label) {
    checks++;
    if (!condition) throw new AssertionError(label);
  }
  private static void rejected(Runnable operation, String label) {
    boolean threw = false;
    try { operation.run(); } catch (IllegalArgumentException | IllegalStateException expected) { threw = true; }
    ok(threw, label);
  }

  private static void config() throws Exception {
    var time = new AtomicReference<>(new ConfigClient.Clock(1_000, 4, true));
    var scope = new ConfigClient.Scope("billing/prod", "worker-7", "auth-11");
    var c = new ConfigClient(scope, time::get);
    var v1 = new ConfigClient.View(scope, 901, 901, "old-content", "hash1", true, 250);
    ok(c.install(v1), "first verified view installs");
    ok(!c.allowDangerousAction(), "cold view has no authority proof");
    var first = c.beginConfirmation();
    time.set(new ConfigClient.Clock(2_999, 4, true));
    ok(c.confirmed(first, v1, true), "1999ms response qualifies");
    ok(c.allowDangerousAction(), "qualified view allows");
    time.set(new ConfigClient.Clock(30_999, 4, true));
    ok(c.install(v1) && c.allowDangerousAction(), "same-view reload does not discard a valid proof");
    time.set(new ConfigClient.Clock(31_000, 4, true));
    ok(!c.allowDangerousAction(), "proof expires at original request start plus 30s");
    var pending = c.beginConfirmation();
    var v2 = new ConfigClient.View(scope, 902, 902, "older-good-content", "hash0", true, 250);
    ok(c.install(v2), "new generation can select older release");
    ok(!c.confirmed(pending, v1, true), "old response cannot qualify new generation");
    ok(!c.install(v1), "slow lower-generation GET is discarded");
    var matching = c.beginConfirmation();
    time.set(new ConfigClient.Clock(33_000, 4, true));
    ok(!c.confirmed(matching, v2, true), "exactly 2000ms response fails closed");
    var fresh = c.beginConfirmation();
    ok(c.confirmed(fresh, v2, true), "new successful confirmation qualifies");
    time.set(new ConfigClient.Clock(33_001, 5, true));
    ok(!c.allowDangerousAction(), "clock era change clears privilege");
    var other = new ConfigClient.Scope("billing/prod", "worker-7", "auth-12");
    c.identityChanged(other);
    ok(c.ordinarySnapshot() == null, "identity change clears old selected view");
    ok(!c.install(v2), "old identity response cannot install at same generation");
    var denied = new ConfigClient.View(other, 902, 902, "canary", "hash2", null, 500);
    ok(c.install(denied), "same generation in fresh identity scope is allowed");
    var denyTicket = c.beginConfirmation();
    ok(c.confirmed(denyTicket, denied, true) && !c.allowDangerousAction(), "missing critical allow stays denied despite proof");
    rejected(() -> c.install(new ConfigClient.View(other, 902, 902, "fork", "hash3", true, 500)), "same-scope same-generation fork rejected");

    var observed = new AtomicReference<>(new ConfigClient.Clock(0, 7, true));
    var c2 = new ConfigClient(scope, observed::get);
    ok(c2.install(v1) && c2.confirmed(c2.beginConfirmation(), v1, true), "fresh clock fixture establishes initial proof");
    observed.set(new ConfigClient.Clock(1_000, 7, true));
    var beforeFault = c2.beginConfirmation();
    observed.set(new ConfigClient.Clock(1_100, 7, false));
    ok(!c2.allowDangerousAction(), "observed untrusted sample denies immediately");
    observed.set(new ConfigClient.Clock(1_200, 7, true));
    ok(!c2.confirmed(beforeFault, v1, true), "clock recovery cannot revive an outstanding pre-fault confirmation");
    ok(!c2.allowDangerousAction(), "recovered clock requires a new proof");
    ok(c2.confirmed(c2.beginConfirmation(), v1, true), "new post-recovery request may establish proof");
    observed.set(new ConfigClient.Clock(20_000, 7, true));
    ok(c2.allowDangerousAction(), "forward observed time remains within original proof lifetime");
    observed.set(new ConfigClient.Clock(1_500, 7, true));
    ok(!c2.allowDangerousAction() && c2.ordinarySnapshot().equals(v1), "observed backwards sample above proof start clears privilege and keeps ordinary bytes");

    var rule = new Cohort.Rule("billing/prod", 9, 9, "S", "C", 100, "fixed-salt", "approved");
    ok(Cohort.select(new Cohort.Auth("billing/prod", "worker-7", "approved", "ctx"), rule).release().equals("C"), "approved all-canary cohort");
    ok(Cohort.select(new Cohort.Auth("billing/prod", "worker-7", "other", "ctx"), rule).release().equals("S"), "cluster filter survives 100 percent");
    var five = new Cohort.Rule("billing/prod", 9, 9, "S", "C", 5, "fixed-salt", "approved");
    var twenty = new Cohort.Rule("billing/prod", 10, 10, "S", "C", 20, "fixed-salt", "approved");
    for (int i = 0; i < 40; i++) {
      var auth = new Cohort.Auth("billing/prod", "instance-" + i, "approved", "ctx");
      var narrow = Cohort.select(auth, five);
      var wide = Cohort.select(auth, twenty);
      ok(!narrow.release().equals("C") || wide.release().equals("C"), "actual stable cohort remains eligible after widening");
    }
    var hub = new WatchHub(9, 7);
    ok(hub.watch(6).get().kind() == WatchHub.Kind.RESET, "compacted cursor resets");
    ok(hub.watch(7).get().kind() == WatchHub.Kind.CHANGED, "at-floor cursor can resume after floor");
    ok(hub.watch(10).get().kind() == WatchHub.Kind.SYNC_REQUIRED, "ahead cursor cannot park indefinitely");
    var idle = hub.watch(9);
    ok(!idle.isDone() && hub.parked() == 1, "equal cursor parks asynchronously");
    hub.idle(idle);
    ok(idle.get().kind() == WatchHub.Kind.IDLE && hub.parked() == 0, "idle removes waiter");
    ExecutorService threads = Executors.newFixedThreadPool(2);
    try {
      for (int i = 0; i < 24; i++) {
        var concurrent = new WatchHub(41, 41);
        var barrier = new CyclicBarrier(2);
        Future<CompletableFuture<WatchHub.Hint>> waiter = threads.submit(() -> { barrier.await(); return concurrent.watch(41); });
        Future<?> publisher = threads.submit(() -> { try { barrier.await(); concurrent.replay(42, 41); } catch (Exception e) { throw new RuntimeException(e); } });
        publisher.get(2, TimeUnit.SECONDS);
        ok(waiter.get(2, TimeUnit.SECONDS).get(2, TimeUnit.SECONDS).kind() == WatchHub.Kind.CHANGED, "concurrent register/replay has no lost wake");
      }
    } finally { threads.shutdownNow(); }
  }

  private static void kv() {
    var ledger = new KvLedger("boot-A", 3, 48);
    var a = new KvLedger.Owner("a", 4, "boot-A");
    var b = new KvLedger.Owner("b", 3, "boot-A");
    ok(ledger.admit(a, 16, 16) && ledger.admit(b, 8, 8), "credits admit exact pool");
    var shared = ledger.allocate(a);
    ledger.cacheFullBlock(a, shared);
    ledger.retainPrefix(b, shared);
    ok(ledger.refs(shared) == 2 && ledger.reserved() == 3, "shared prefix still counts full request promises");
    var ticket = ledger.issue(List.of(a, b));
    ok(ledger.pins(shared) == 2, "shared batch pins both accesses");
    ok(ledger.stop(a, KvLedger.Reason.CANCEL), "cancel transitions once");
    ok(!ledger.stop(a, KvLedger.Reason.EOS), "competing EOS cannot return credits twice");
    ok(ledger.reserved() == 3 && ledger.refs(shared) == 2, "cancel before fence holds references and credits");
    rejected(() -> ledger.issue(List.of(a)), "retiring owner cannot join another launch");
    ok(ledger.complete(ticket, Set.of()), "trusted fence completion retires launch");
    ok(ledger.reserved() == 1 && ledger.refs(shared) == 1 && ledger.pins(shared) == 0, "other owner keeps shared prefix alive");
    ok(ledger.state(a) == KvLedger.State.RELEASED && ledger.state(b) == KvLedger.State.RUNNING, "cancel does not retire another sequence");
    ok(!ledger.complete(ticket, Set.of(b)), "duplicate callback cannot inject EOS");
    ok(ledger.stop(b, KvLedger.Reason.EOS) && ledger.reserved() == 0, "second owner releases at its own safe boundary");
    ok(ledger.refs(shared) == 0 && ledger.cached(shared), "zero-reference cache may remain evictable");
    var c = new KvLedger.Owner("c", 1, "boot-A");
    ok(ledger.admit(c, 17, 16), "nonaligned 33-token promise rounds to three pages");
    var reused = ledger.allocate(c);
    ok(reused.slot() == shared.slot() && reused.incarnation() != shared.incarnation(), "evicted address receives a new incarnation");
    rejected(() -> ledger.refs(shared), "stale page handle cannot access reused slot");
    var oldBootTicket = new KvLedger.Ticket("boot-old", 1);
    ok(!ledger.complete(oldBootTicket, Set.of(c)), "old boot completion cannot release new pool");
    int reserved = ledger.reserved(), pins = ledger.pins(reused);
    rejected(() -> ledger.issue(List.of(c, a)), "invalid multiowner batch rejects atomically");
    ok(ledger.reserved() == reserved && ledger.pins(reused) == pins, "failed issue leaves ledger unchanged");
    ledger.workerDied();
    ok(!ledger.stop(c, KvLedger.Reason.CANCEL), "dead context is not locally recycled");
    rejected(() -> ledger.issue(List.of(c)), "dead worker cannot launch");
  }

  private static void rag() {
    var a = new RagCore.Hit("t/d/rev7/g1/A", 2);
    var duplicate = new RagCore.Hit(a.qualifiedId(), 90);
    var b = new RagCore.Hit("t/d/rev8/g1/A", 2);
    var result = RagCore.rrf(List.of(List.of(a, duplicate, b), List.of(b)), 80);
    ok(result.size() == 2 && result.get(0).qualifiedId().equals(b.qualifiedId()), "qualified revisions stay distinct and duplicates count once per lane");
    ok(Math.abs(result.get(1).score() - 1.0 / 62) < 1e-12, "lower duplicate does not add a second contribution");
    ok(RagCore.rrf(List.of(List.of(a, b)), 1).size() == 1, "shortlist cap applies after fusion");
    RagCore.Renderer renderer = new RagCore.Renderer() {
      public String evidence(List<RagCore.Span> spans) { return "headers" + spans.stream().map(RagCore.Span::text).reduce("", String::concat); }
      public String prompt(List<RagCore.Span> spans) { return "fixed" + evidence(spans); }
    };
    var first = new RagCore.Span("t", "d", 5, "g2", 0, 10, "one");
    var overlap = new RagCore.Span("t", "d", 5, "g2", 5, 15, "overlap");
    var adjacent = new RagCore.Span("t", "d", 5, "g2", 10, 20, "two");
    var pack = RagCore.pack(List.of(first, overlap, adjacent), renderer, String::length, 1_024).orElseThrow();
    ok(pack.spans().equals(List.of(first, adjacent)), "overlapping span drops, adjacent evidence remains");
    ok(pack.inputTokens() == pack.prompt().length(), "full prompt including metadata is measured");
    var huge = new RagCore.Span("t", "huge", 5, "g2", 0, 9_000, "x".repeat(9_000));
    ok(RagCore.pack(List.of(huge, first), renderer, String::length, 1_024).orElseThrow().spans().equals(List.of(first)), "oversized top span does not block smaller eligible evidence");
    ok(RagCore.pack(List.of(first), renderer, String::length, 512).isEmpty(), "output reservation cannot exceed total context");
  }

  public static void main(String[] args) throws Exception {
    config(); int configChecks = checks;
    kv(); int kvChecks = checks - configChecks;
    rag(); int ragChecks = checks - configChecks - kvChecks;
    System.out.printf("{\"passed\":true,\"checks\":%d,\"ch28\":%d,\"ch29\":%d,\"ch30\":%d}%n", checks, configChecks, kvChecks, ragChecks);
  }
}
