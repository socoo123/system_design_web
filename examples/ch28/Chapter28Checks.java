import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class Chapter28Checks {
    private static int assertions;
    private static final List<String> cases = new ArrayList<>();
    private static void check(boolean condition, String label) {
        assertions++; if (!condition) throw new AssertionError(label);
    }
    private static final class ClockFixture implements java.util.function.Supplier<ConfigClient.Clock> {
        long ms, era; boolean trusted = true;
        public ConfigClient.Clock get() { return new ConfigClient.Clock(ms, era, trusted); }
    }
    private static ConfigClient.View view(ConfigClient.Scope s, long g, String release, Boolean allow) {
        return new ConfigClient.View(s, g, g, release, "verified-fixture-hash-" + release, allow, 100);
    }
    private static void expect(Class<? extends Throwable> kind, Runnable task, String label) {
        try { task.run(); throw new AssertionError("missing failure: " + label); }
        catch (Throwable error) { check(kind.isInstance(error), label); }
    }
    public static void main(String[] args) throws Exception {
        var s = new ConfigClient.Scope("app/prod/main", "instance-7", "issued-context-A");
        var c = new ClockFixture(); var sdk = new ConfigClient(s, c);
        var v41 = view(s, 41, "R17", true);
        check(sdk.install(v41), "normal install");
        check(!sdk.allowDangerousAction(), "disk or fetch is not proof");
        var t = sdk.beginConfirmation(); c.ms = 1;
        check(sdk.confirmed(t, v41, true), "normal authoritative confirmation");
        check(sdk.allowDangerousAction(), "allow exact applied view");
        c.ms = 29_999; check(sdk.allowDangerousAction(), "29999ms valid");
        check(!sdk.confirmed(t, v41, true), "consumed response cannot renew");
        check(sdk.install(v41), "duplicate install accepted");
        c.ms = 30_000; check(!sdk.allowDangerousAction(), "30000ms expires from request start");
        c.ms = 1; check(!sdk.allowDangerousAction(), "expired proof cannot resurrect on clock rollback");
        cases.add("expiry, exact boundary, duplicate/replayed replies and duplicate apply");

        c.ms = 100_000; t = sdk.beginConfirmation(); c.ms = 102_000;
        check(!sdk.confirmed(t, v41, true), "2s response deadline is strict");
        check(!sdk.allowDangerousAction(), "slow response does not start new 30s");
        t = sdk.beginConfirmation(); c.ms = 102_001;
        check(!sdk.confirmed(t, view(s, 42, "R18", true), true), "mismatched current generation");
        check(!sdk.allowDangerousAction(), "newer uninstalled authority cannot qualify old allow");
        t = sdk.beginConfirmation(); check(!sdk.confirmed(t, null, true), "malformed response denied");
        cases.add("late response and current/applied mismatch");

        t = sdk.beginConfirmation(); var v42 = view(s, 42, "R18", true);
        check(sdk.install(v42), "new whole view installed");
        check(!sdk.confirmed(t, v41, true), "inflight old response invalidated by swap");
        check(!sdk.allowDangerousAction(), "new view cannot reuse old proof");
        check(!sdk.install(v41), "delayed older generation rejected");
        expect(IllegalStateException.class, () -> sdk.install(view(s, 42, "fork", true)), "same-g fork rejected");
        expect(IllegalArgumentException.class, () -> new ConfigClient.View(s, 43, 43, "bad", "h", true, 0), "schema rejects invalid staging");
        check(sdk.ordinarySnapshot().equals(v42), "failed staging retains last applied view");
        var v43 = view(s, 43, "R17", true); check(sdk.install(v43), "new generation can select old release");
        cases.add("atomic applied view, staging failure, ordering and rollback");

        t = sdk.beginConfirmation(); var altered = new ConfigClient.Ticket(t.nonce(), t.target(), t.start());
        check(!sdk.confirmed(altered, v43, true), "unbound response object ignored");
        check(sdk.confirmed(t, v43, true), "original correlated request still works");
        var oldScopeTicket = sdk.beginConfirmation();
        var sB = new ConfigClient.Scope(s.namespace(), s.instance(), "issued-context-B");
        sdk.identityChanged(sB);
        check(sdk.ordinarySnapshot() == null, "identity change clears ordinary selection");
        check(!sdk.install(v43), "same-g old context response rejected");
        var newContext = view(sB, 43, "R18", true);
        check(sdk.install(newContext), "same-g new context can reselect");
        check(!sdk.confirmed(oldScopeTicket, v43, true), "old context cannot confirm new view");
        check(!sdk.allowDangerousAction(), "new context starts unqualified");
        cases.add("identity context binding, nonce correlation and same-g reselection");

        t = sdk.beginConfirmation(); check(sdk.confirmed(t, newContext, true), "new context confirmed");
        c.era++; check(!sdk.allowDangerousAction(), "resume era invalidates old proof");
        t = sdk.beginConfirmation(); check(sdk.confirmed(t, newContext, true), "post-resume fresh confirmation");
        var paused = sdk.beginConfirmation(); sdk.invalidateProof();
        check(!sdk.confirmed(paused, newContext, true), "resume hook cancels pending request");
        check(!sdk.allowDangerousAction(), "resume hook clears same-counter proof");
        t = sdk.beginConfirmation(); check(sdk.confirmed(t, newContext, true), "reconfirm after hook");
        c.trusted = false; check(!sdk.allowDangerousAction(), "unknown clock denies");
        c.trusted = true; check(!sdk.allowDangerousAction(), "restored clock cannot revive old proof");
        t = sdk.beginConfirmation(); c.ms--; check(!sdk.confirmed(t, newContext, true), "backwards elapsed time denies");
        t = sdk.beginConfirmation(); check(!sdk.confirmed(t, newContext, false), "no authority denies");
        t = sdk.beginConfirmation(); check(sdk.confirmed(t, newContext, true), "last good proof");
        var timedOut = sdk.beginConfirmation(); sdk.timeout(timedOut);
        check(sdk.allowDangerousAction(), "timeout retains still-valid prior proof");
        check(!sdk.confirmed(timedOut, newContext, true), "late timed-out response cannot renew");
        sdk.invalidateProof(); check(!sdk.allowDangerousAction(), "definitive auth failure invalidates");
        var deny = view(sB, 44, "deny", null); sdk.install(deny);
        t = sdk.beginConfirmation(); check(sdk.confirmed(t, deny, true), "missing key view may be current");
        check(!sdk.allowDangerousAction(), "missing allow defaults deny");
        var reboot = new ConfigClient(sB, c); reboot.install(newContext);
        check(!reboot.allowDangerousAction(), "restart restores bytes without proof");
        cases.add("resume, unknown/backwards clock, auth failure, timeout, missing key and restart");

        var clockFault = new ClockFixture(); var faultSdk = new ConfigClient(s, clockFault);
        faultSdk.install(v41); var original = faultSdk.beginConfirmation();
        check(faultSdk.confirmed(original, v41, true), "clock-fault fixture qualified");
        clockFault.ms = 1_000; var beforeDistrust = faultSdk.beginConfirmation();
        clockFault.ms = 1_100; clockFault.trusted = false;
        check(!faultSdk.allowDangerousAction(), "untrusted observation denies and clears pending");
        clockFault.ms = 1_200; clockFault.trusted = true;
        check(!faultSdk.confirmed(beforeDistrust, v41, true), "pre-distrust pending cannot renew after recovery");
        check(!faultSdk.allowDangerousAction(), "recovered clock still needs new confirmation");
        check(faultSdk.ordinarySnapshot().equals(v41), "clock fault retains ordinary snapshot");
        var recovered = faultSdk.beginConfirmation();
        check(faultSdk.confirmed(recovered, v41, true) && faultSdk.allowDangerousAction(), "new post-recovery request qualifies");
        clockFault.ms = 20_000; check(faultSdk.allowDangerousAction(), "later observed time still within proof");
        var beforeRollback = faultSdk.beginConfirmation(); clockFault.ms = 1_500;
        check(!faultSdk.allowDangerousAction(), "observable rollback denies even above proof start");
        clockFault.ms = 1_600;
        check(!faultSdk.confirmed(beforeRollback, v41, true), "rollback also consumes old pending");
        var postRollback = faultSdk.beginConfirmation();
        check(faultSdk.confirmed(postRollback, v41, true), "fresh confirmation recovers after rollback");
        cases.add("independent clock P1: distrust pending, last-observed rollback and explicit requalification");

        var hub = new WatchHub(41, 41);
        var waiting = hub.watch(41); check(!waiting.isDone(), "current cursor parks");
        hub.replay(42, 41); check(waiting.get().kind() == WatchHub.Kind.CHANGED, "publish after register wakes");
        check(hub.watch(41).get().kind() == WatchHub.Kind.CHANGED, "publish before register returned by recheck");
        hub.replay(43, 42); check(hub.watch(41).get().kind() == WatchHub.Kind.RESET, "compaction gap reset");
        check(hub.watch(42).get().kind() == WatchHub.Kind.CHANGED, "floor cursor can resume after floor");
        check(hub.watch(44).get().kind() == WatchHub.Kind.SYNC_REQUIRED, "index behind caller cannot say idle");
        waiting = hub.watch(43); hub.idle(waiting);
        check(waiting.get().kind() == WatchHub.Kind.IDLE && hub.parked() == 0, "timeout removes waiter");
        var a = new WatchHub(43, 42); var b = new WatchHub(43, 42);
        var aw = a.watch(43); var bw = b.watch(43); a.replay(44, 42); b.replay(44, 42);
        check(aw.get().generation() == 44 && bw.get().generation() == 44, "broadcast reaches both owners");
        var pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 100; i++) {
                var race = new WatchHub(41, 41); var start = new CountDownLatch(1);
                var r1 = pool.submit(() -> { start.await(); return race.watch(41); });
                var r2 = pool.submit(() -> { start.await(); race.replay(42, 41); return true; });
                start.countDown(); r2.get(2, TimeUnit.SECONDS);
                check(r1.get(2, TimeUnit.SECONDS).get(2, TimeUnit.SECONDS).generation() == 42, "race closes local lost wakeup");
            }
        } finally { pool.shutdownNow(); }
        cases.add("local watch register/replay races, compaction, ahead cursor, timeout and two owners");

        int five = 0, twenty = 0;
        for (int i = 0; i < 10_000; i++) {
            var auth = new Cohort.Auth(s.namespace(), "instance-" + i, "approved", "context-1");
            var r5 = new Cohort.Rule(s.namespace(), 42, 42, "R17", "R18", 5, "s1", "approved");
            var r20 = new Cohort.Rule(s.namespace(), 43, 43, "R17", "R18", 20, "s1", "approved");
            boolean is5 = Cohort.select(auth, r5).release().equals("R18");
            boolean is20 = Cohort.select(auth, r20).release().equals("R18");
            if (is5) five++; if (is20) twenty++;
            check(!is5 || is20, "same salt retains old cohort on expansion");
            check(Cohort.select(auth, r5).equals(Cohort.select(auth, r5)), "stable selection");
        }
        var external = new Cohort.Auth(s.namespace(), "any", "unapproved", "issued");
        var full = new Cohort.Rule(s.namespace(), 44, 44, "R17", "R18", 100, "s1", "approved");
        check(Cohort.select(external, full).release().equals("R17"), "cluster eligibility AND bucket");
        var rolled = new Cohort.Rule(s.namespace(), 45, 45, "R17", null, 0, "s1", "approved");
        check(Cohort.select(external, rolled).release().equals("R17"), "rollback clears canary");
        check(Cohort.bucket("app/prod/main", "s1", "instance-7") == 25, "pinned bucket vector");
        cases.add("deterministic cohort, expansion subset, cluster binding and rollback");
        System.out.println("{\"passed\":true,\"assertions\":" + assertions + ",\"fivePercentCount\":" + five
                + ",\"twentyPercentCount\":" + twenty + ",\"bucketVector\":25,\"cases\":[\""
                + String.join("\",\"", cases) + "\"]}");
    }
}
