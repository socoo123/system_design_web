import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public final class GatewayPolicyTest {
    static int checks;
    static void check(boolean ok, String name) {
        checks++;
        if (!ok) throw new AssertionError(name);
    }
    static GatewayPolicy.Replay replay(String method, boolean body, boolean response,
                                       int attempts, GatewayPolicy.Failure failure) {
        return new GatewayPolicy.Replay(method, body, response, attempts, failure);
    }
    static void parallel(int count, Runnable action) throws Exception {
        var start = new CountDownLatch(1);
        var errors = new AtomicInteger();
        var threads = new ArrayList<Thread>();
        for (int i = 0; i < count; i++) {
            var t = new Thread(() -> {
                try { start.await(); action.run(); }
                catch (Throwable e) { errors.incrementAndGet(); }
            });
            threads.add(t); t.start();
        }
        start.countDown();
        for (var t : threads) t.join();
        check(errors.get() == 0, "parallel actions completed");
    }
    public static void main(String[] args) throws Exception {
        var d = GatewayPolicy.Deadline.afterPolicy(1000, 1020);
        check(d.endMs() == 1300 && d.upstreamEndMs() == 1260, "fixed policy budget");
        check(d.nextAttemptMs(1030, 80) == 80, "normal 80ms allocation");
        check(d.nextAttemptMs(1250, 80) == 10, "deadline clips the final attempt");
        check(d.nextAttemptMs(1260, 80) == 0 && d.nextAttemptMs(1300, 80) == 0, "expired never resets");
        check(GatewayPolicy.Deadline.afterPolicy(1000, 1070).upstreamEndMs() == 1260, "slow policy loses 50ms");
        check(GatewayPolicy.Deadline.afterPolicy(1000, 1005).upstreamEndMs() == 1245, "upstream max remains 240ms");
        var r = replay("GET", true, false, 1, GatewayPolicy.Failure.RESET);
        check(GatewayPolicy.mayRetry(r, d, 1100, 20), "GET first transport failure");
        check(GatewayPolicy.mayRetry(replay("HEAD", true, false, 1, GatewayPolicy.Failure.TIMEOUT), d, 1100, 20), "HEAD timeout");
        for (String method : new String[]{"POST", "PUT", "DELETE", "PATCH"})
            check(!GatewayPolicy.mayRetry(replay(method, true, false, 1, GatewayPolicy.Failure.RESET), d, 1100, 20), "conservative method gate " + method);
        check(!GatewayPolicy.mayRetry(replay("GET", false, false, 1, GatewayPolicy.Failure.RESET), d, 1100, 20), "body cannot replay");
        check(!GatewayPolicy.mayRetry(replay("GET", true, true, 1, GatewayPolicy.Failure.RESET), d, 1100, 20), "response already started");
        check(!GatewayPolicy.mayRetry(replay("GET", true, false, 2, GatewayPolicy.Failure.RESET), d, 1100, 20), "only one retry");
        check(!GatewayPolicy.mayRetry(replay("GET", true, false, 1, GatewayPolicy.Failure.HTTP_STATUS), d, 1100, 20), "HTTP errors not auto retried");
        check(!GatewayPolicy.mayRetry(replay("GET", true, false, 1, GatewayPolicy.Failure.CLIENT_CANCEL), d, 1100, 20), "cancel not retried");
        check(GatewayPolicy.mayRetry(r, d, 1220, 20), "exact 20ms minimum");
        check(!GatewayPolicy.mayRetry(r, d, 1221, 20), "insufficient post-backoff time");
        check(!GatewayPolicy.mayRetry(r, d, 1100, -1), "negative delay rejected");
        var credit = new GatewayPolicy.RetryBudget();
        check(!credit.takeRetry(), "empty start");
        for (int i = 0; i < 19; i++) credit.originalAdmitted();
        check(!credit.takeRetry(), "nineteen earn none");
        credit.originalAdmitted();
        check(credit.takeRetry() && !credit.takeRetry(), "twenty earn exactly one");
        for (int i = 0; i < 10000; i++) credit.originalAdmitted();
        int burst = 0; while (credit.takeRetry()) burst++;
        check(burst == 125, "burst cap is 125 despite 500 earned");
        var concurrent = new GatewayPolicy.RetryBudget();
        for (int i = 0; i < 140; i++) concurrent.originalAdmitted();
        var taken = new AtomicInteger();
        parallel(80, () -> { if (concurrent.takeRetry()) taken.incrementAndGet(); });
        check(taken.get() == 7, "atomic credit consumption");
        var streams = new GatewayPolicy.ActiveStreams();
        var permits = new ArrayList<GatewayPolicy.StreamPermit>();
        for (int i = 0; i < 800; i++) permits.add(streams.start());
        check(permits.stream().allMatch(p -> p != null) && streams.start() == null, "800 active stream cap");
        // Returning 504 alone does not invoke terminal completion or release capacity.
        check(streams.start() == null, "logical timeout leaves resource occupied");
        parallel(20, permits.get(0)::transportTerminated);
        var replacement = streams.start();
        check(replacement != null && streams.start() == null, "duplicate termination releases exactly once");
        replacement.transportTerminated();
        for (var p : permits) p.transportTerminated();
        int free = 0; while (streams.start() != null) free++;
        check(free == 800, "all terminal callbacks restore exactly cap");
        var breaker = new GatewayPolicy.Breaker();
        var old = breaker.enter(0);
        for (int i = 0; i < 99; i++) breaker.complete(breaker.enter(i), false, i);
        check(breaker.state == GatewayPolicy.State.CLOSED, "sample floor 100");
        breaker.complete(breaker.enter(99), false, 99);
        check(breaker.state == GatewayPolicy.State.OPEN && breaker.enter(5098) == null, "opens for five seconds");
        breaker.complete(old, true, 200);
        check(breaker.state == GatewayPolicy.State.OPEN, "stale ordinary result cannot close");
        var probes = new AtomicInteger();
        var holder = new java.util.concurrent.atomic.AtomicReference<GatewayPolicy.Ticket>();
        parallel(40, () -> { var p = breaker.enter(5099); if (p != null) { probes.incrementAndGet(); holder.set(p); } });
        check(probes.get() == 1 && breaker.state == GatewayPolicy.State.HALF_OPEN, "exactly one concurrent local probe");
        var probe = holder.get();
        breaker.complete(probe, false, 5100);
        check(breaker.state == GatewayPolicy.State.OPEN && breaker.enter(10099) == null, "probe failure resets wait");
        breaker.complete(probe, true, 5200);
        check(breaker.state == GatewayPolicy.State.OPEN, "duplicate probe completion ignored");
        var success = breaker.enter(10100);
        breaker.complete(success, true, 10101);
        check(breaker.state == GatewayPolicy.State.CLOSED && breaker.samples.isEmpty(), "successful probe closes and clears history");
        breaker.complete(old, false, 10102);
        check(breaker.state == GatewayPolicy.State.CLOSED, "old epoch never changes new state");
        var window = new GatewayPolicy.Breaker();
        for (int i = 0; i < 99; i++) window.complete(window.enter(i), false, i);
        window.complete(window.enter(10100), true, 10100);
        check(window.state == GatewayPolicy.State.CLOSED && window.samples.size() == 1, "ten-second sample expiry");
        var half = new GatewayPolicy.Breaker();
        for (int i = 0; i < 100; i++) half.complete(half.enter(i), i < 50, i);
        check(half.state == GatewayPolicy.State.OPEN, "exactly fifty percent opens");
        System.out.println("PASS " + checks + " Java policy checks; local core only");
    }
}
