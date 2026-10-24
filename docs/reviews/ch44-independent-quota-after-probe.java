import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** New inputs call the actual repaired guardedBody/Breaker/remainingAttempt.
 * The chapter still has no real quota RPC; delayed-I/O fixtures are JVM models. */
final class Ch44QuotaAfterProbe {
    static int checks;
    static void need(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    static final class Fixture {
        final AtomicLong time = new AtomicLong(4_000_000_000L);
        final ServiceGovernance.Breaker breaker = new ServiceGovernance.Breaker(time::get);
        final Semaphore slot = new Semaphore(1);
        final ServiceGovernance.Breaker.Ticket ticket;
        Fixture(boolean halfOpen) throws InterruptedException {
            if (halfOpen) {
                for (int i = 0; i < 3; i++) breaker.finish(breaker.tryAcquire(), ServiceGovernance.Verdict.FAILURE);
                time.addAndGet(1_000_000_000L);
            }
            ticket = breaker.tryAcquire(); slot.acquire();
        }
        ServiceGovernance.Verdict run(Callable<ServiceGovernance.Verdict> body) {
            return ServiceGovernance.guardedBody(breaker, ticket, slot, body);
        }
        void terminal() {
            need(slot.availablePermits() == 1, "slot released exactly once");
            need(ticket.done, "ticket finished");
        }
    }
    public static void main(String[] args) throws Exception {
        Fixture closed = new Fixture(false);
        need(closed.run(() -> { throw new IllegalStateException("quota decode error"); }) == ServiceGovernance.Verdict.IGNORED,
                "reachable second-attempt CLOSED quota exception is local");
        closed.terminal(); need(closed.breaker.failures == 0, "quota error is not dependency failure");
        Fixture half = new Fixture(true);
        half.run(() -> { throw new IllegalArgumentException("quota SDK exception"); }); half.terminal();
        need(half.breaker.state == ServiceGovernance.State.OPEN, "generic abandoned half-open fixture cools again");
        need(half.breaker.tryAcquire() == null, "cooldown remains enforced");
        half.time.addAndGet(1_000_000_000L);
        var next = half.breaker.tryAcquire(); need(next != null, "next cooldown admits another probe");
        half.breaker.finish(next, ServiceGovernance.Verdict.SUCCESS);
        need(half.breaker.state == ServiceGovernance.State.CLOSED, "next successful probe recovers");
        // Fixed 800ms/1s policy normally makes a second-attempt new half-open
        // unreachable; this fixture verifies the general resource bracket only.
        for (Boolean permission : new Boolean[] { false, null }) {
            Fixture denied = new Fixture(false); AtomicInteger starts = new AtomicInteger();
            denied.run(() -> {
                if (!Boolean.TRUE.equals(permission)) return ServiceGovernance.Verdict.IGNORED;
                starts.incrementAndGet(); return ServiceGovernance.Verdict.SUCCESS;
            });
            denied.terminal(); need(starts.get() == 0, "DENIED/UNKNOWN starts no inventory I/O");
        }
        Fixture late = new Fixture(false); AtomicInteger lateStarts = new AtomicInteger();
        late.run(() -> {
            // Grant returned earlier, then scheduling resumes at t=441 for a
            // t=319 admission. Its original attempt end is 539, only 98ms left.
            if (ServiceGovernance.remainingAttempt(319_000_000L, 441_000_000L, 800_000_000L) == 0)
                return ServiceGovernance.Verdict.IGNORED;
            lateStarts.incrementAndGet(); return ServiceGovernance.Verdict.SUCCESS;
        });
        late.terminal(); need(lateStarts.get() == 0, "post-quota late resume refuses dispatch");
        Fixture transportLocalError = new Fixture(false);
        transportLocalError.run(() -> { throw new RuntimeException("transport callback parse error"); });
        transportLocalError.terminal();
        Fixture dependency = new Fixture(false);
        dependency.run(() -> ServiceGovernance.Verdict.FAILURE); dependency.terminal();
        need(dependency.breaker.failures == 1, "finally fallback does not overwrite attributed failure");
        Fixture normal = new Fixture(true);
        need(normal.run(() -> ServiceGovernance.Verdict.SUCCESS) == ServiceGovernance.Verdict.SUCCESS,
                "normal result preserved");
        normal.terminal(); need(normal.breaker.state == ServiceGovernance.State.CLOSED,
                "finally fallback does not downgrade normal probe success");
        Fixture seriousError = new Fixture(false);
        try { seriousError.run(() -> { throw new AssertionError("local fatal fixture"); }); }
        catch (AssertionError expected) { }
        seriousError.terminal();

        Fixture liveQuota = new Fixture(false);
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), exited = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> future = executor.submit(() -> {
                try {
                    liveQuota.run(() -> {
                        entered.countDown();
                        for (;;) { try { release.await(); break; } catch (InterruptedException ignored) {} }
                        return ServiceGovernance.Verdict.IGNORED;
                    });
                } finally { exited.countDown(); }
            });
            need(entered.await(3, TimeUnit.SECONDS), "quota fixture entered");
            need(future.cancel(true), "caller cancels future");
            need(liveQuota.slot.availablePermits() == 0, "still-live local quota I/O retains slot");
            release.countDown(); need(exited.await(3, TimeUnit.SECONDS), "quota fixture really exits");
            liveQuota.terminal();
        } finally { release.countDown(); executor.shutdownNow(); executor.awaitTermination(3, TimeUnit.SECONDS); }
        System.out.println("PASS repaired actual Java resource bracket: CLOSED/HALF_OPEN quota exception, next cooldown recovery, DENIED/UNKNOWN, late resume, transport error, attributed failure, success, Error/finally, live quota cancellation");
        System.out.println("INDEPENDENT QUOTA FIX CHECKS=" + checks);
    }
}
