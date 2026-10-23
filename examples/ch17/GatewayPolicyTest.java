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
    record Clocked(GatewayPolicy.Breaker breaker, java.util.concurrent.atomic.AtomicLong now) {}
    static Clocked clocked() {
        var now = new java.util.concurrent.atomic.AtomicLong();
        var ref = new java.util.concurrent.atomic.AtomicReference<GatewayPolicy.Breaker>();
        var b = new GatewayPolicy.Breaker(() -> {
            if (!Thread.holdsLock(ref.get())) throw new AssertionError("clock sampled outside monitor");
            return now.get();
        });
        ref.set(b);
        return new Clocked(b, now);
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
        var c = clocked(); var breaker = c.breaker;
        var old = breaker.enter();
        for (int i = 0; i < 99; i++) breaker.complete(breaker.enter(), false);
        check(breaker.state == GatewayPolicy.State.CLOSED, "sample floor 100");
        breaker.complete(breaker.enter(), false);
        check(breaker.state == GatewayPolicy.State.OPEN, "opens on hundredth failure");
        c.now.set(4999);
        check(breaker.enter() == null, "full five-second wait");
        breaker.complete(old, true);
        check(breaker.state == GatewayPolicy.State.OPEN, "stale ordinary result cannot close");
        c.now.set(5000);
        var probes = new AtomicInteger();
        var holder = new java.util.concurrent.atomic.AtomicReference<GatewayPolicy.Ticket>();
        parallel(40, () -> { var p = breaker.enter(); if (p != null) { probes.incrementAndGet(); holder.set(p); } });
        check(probes.get() == 1 && breaker.state == GatewayPolicy.State.HALF_OPEN, "one concurrent local probe");
        var probe = holder.get(); breaker.complete(probe, false);
        c.now.set(9999);
        check(breaker.state == GatewayPolicy.State.OPEN && breaker.enter() == null, "probe failure resets wait");
        breaker.complete(probe, true);
        check(breaker.state == GatewayPolicy.State.OPEN, "duplicate probe result ignored");
        c.now.set(10000); var success = breaker.enter(); breaker.complete(success, true);
        check(breaker.state == GatewayPolicy.State.CLOSED && breaker.samples.isEmpty(), "probe closes and clears history");
        breaker.complete(old, false);
        check(breaker.state == GatewayPolicy.State.CLOSED, "old epoch cannot change new state");
        var w = clocked(); var window = w.breaker;
        for (int i = 0; i < 99; i++) window.complete(window.enter(), false);
        w.now.set(10000); window.complete(window.enter(), true);
        check(window.state == GatewayPolicy.State.CLOSED && window.samples.size() == 1, "exact ten-second observation expiry");
        var near = clocked();
        for (int i = 0; i < 99; i++) near.breaker.complete(near.breaker.enter(), false);
        near.now.set(9999); near.breaker.complete(near.breaker.enter(), true);
        check(near.breaker.state == GatewayPolicy.State.OPEN, "observations one ms before expiry still count");
        var half = clocked();
        for (int i = 0; i < 100; i++) half.breaker.complete(half.breaker.enter(), i < 50);
        check(half.breaker.state == GatewayPolicy.State.OPEN, "exactly fifty percent opens");
        // Network completion at t=0 is not sampled outside the monitor anymore.
        // These callbacks are all observed at t=10001 and legitimately open it.
        var late = clocked(); var tickets = new ArrayList<GatewayPolicy.Ticket>();
        for (int i = 0; i < 100; i++) tickets.add(late.breaker.enter());
        late.now.set(10001); late.breaker.complete(tickets.get(0), true);
        for (int i = 1; i < 100; i++) late.breaker.complete(tickets.get(i), false);
        check(late.breaker.state == GatewayPolicy.State.OPEN, "delayed callbacks count at locked observation time");
        check(late.breaker.retryAt == 15001, "cooldown starts at locked observation time");
        // An enter blocked on the monitor must sample the clock after the wait.
        var waiting = clocked();
        for (int i = 0; i < 100; i++) waiting.breaker.complete(waiting.breaker.enter(), false);
        var entered = new java.util.concurrent.atomic.AtomicReference<GatewayPolicy.Ticket>();
        Thread waiter;
        synchronized (waiting.breaker) {
            waiter = new Thread(() -> entered.set(waiting.breaker.enter()));
            waiter.start();
            long stop = System.nanoTime() + 2_000_000_000L;
            while (waiter.getState() != Thread.State.BLOCKED && System.nanoTime() < stop) Thread.yield();
            check(waiter.getState() == Thread.State.BLOCKED, "probe admission actually waits on monitor");
            waiting.now.set(5000);
        }
        waiter.join();
        check(entered.get() != null && entered.get().probe, "lock wait counts toward cooldown");
        var observed = clocked();
        for (int i = 0; i < 99; i++) observed.breaker.complete(observed.breaker.enter(), false);
        var finalFailure = observed.breaker.enter();
        Thread terminal;
        synchronized (observed.breaker) {
            terminal = new Thread(() -> observed.breaker.complete(finalFailure, false));
            terminal.start();
            long stop = System.nanoTime() + 2_000_000_000L;
            while (terminal.getState() != Thread.State.BLOCKED && System.nanoTime() < stop) Thread.yield();
            check(terminal.getState() == Thread.State.BLOCKED, "terminal observation actually waits on monitor");
            observed.now.set(8000);
        }
        terminal.join();
        check(observed.breaker.state == GatewayPolicy.State.OPEN && observed.breaker.retryAt == 13000,
                "cooldown starts after blocked terminal callback is observed");
        System.out.println("PASS " + checks + " Java policy checks; local core only");
    }
}
