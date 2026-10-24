import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Independent inputs against the author's actual Java class, plus a separately
 * labelled JVM cancellation counterexample. Does not execute retry.pseudo. */
final class Ch44IndependentProbe {
    static int checks;
    static void need(boolean value, String label) {
        checks++;
        if (!value) throw new AssertionError(label);
    }
    static long ms(long value) { return value * 1_000_000L; }
    static void remaining(long admitted, long observed, long deadline, long expected, String label) {
        long actual = ServiceGovernance.remainingAttempt(ms(admitted), ms(observed), ms(deadline));
        need(actual == ms(expected), label + ": " + actual);
    }
    static void open(ServiceGovernance.Breaker breaker) {
        for (int i = 0; i < 3; i++) breaker.finish(breaker.tryAcquire(), ServiceGovernance.Verdict.FAILURE);
        need(breaker.state == ServiceGovernance.State.OPEN, "open after failures");
    }
    static List<ServiceGovernance.Breaker.Ticket> race(ServiceGovernance.Breaker b, int callers) throws Exception {
        CountDownLatch ready = new CountDownLatch(callers), start = new CountDownLatch(1);
        List<ServiceGovernance.Breaker.Ticket> winners = Collections.synchronizedList(new ArrayList<>());
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < callers; i++) {
            Thread t = new Thread(() -> {
                ready.countDown();
                try { start.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
                var ticket = b.tryAcquire(); if (ticket != null) winners.add(ticket);
            });
            threads.add(t); t.start();
        }
        need(ready.await(3, TimeUnit.SECONDS), "threads ready"); start.countDown();
        for (Thread thread : threads) thread.join();
        return winners;
    }
    public static void main(String[] args) throws Exception {
        // A different normal trace: local 80; attempt 1 exits at 280; backoff 39;
        // attempt 2 admitted at 319 and worker starts at 410, leaving 129.
        remaining(80, 81, 800, 219, "normal first positive scheduling delay");
        remaining(80, 170, 800, 130, "first attempt keeps its original end");
        remaining(319, 410, 800, 129, "second attempt can start after positive queue delay");
        remaining(319, 439, 800, 100, "exact useful-time boundary");
        remaining(319, 440, 800, 0, "one millisecond past useful-time boundary");
        remaining(550, 550, 800, 110, "reserve can cap below nominal 220");
        remaining(590, 590, 800, 0, "250 remaining minus 40 backoff leaves only 70 useful");
        remaining(319, 411, 650, 0, "end-to-end reserve defeats per-attempt capacity");
        need(80 + 200 + 39 + 181 + 140 == 640, "normal trace finishes before deadline");
        System.out.println("PASS independent deadline traces: positive delays, two attempts, late backoff, queue edge, finish reserve");

        AtomicLong time = new AtomicLong(ms(9000));
        var b = new ServiceGovernance.Breaker(time::get);
        var stale = b.tryAcquire();
        open(b); long firstOpened = b.openedAt;
        time.addAndGet(ms(999));
        for (int i = 0; i < 37; i++) need(b.tryAcquire() == null, "fixed cooldown rejection");
        need(b.openedAt == firstOpened, "rejected callers do not extend cooldown");
        time.addAndGet(ms(1));
        var tickets = race(b, 48);
        need(tickets.size() == 1, "one of 48 local probes");
        b.finish(stale, ServiceGovernance.Verdict.SUCCESS);
        need(b.state == ServiceGovernance.State.HALF_OPEN, "old successful completion cannot close a new probe");
        b.finish(tickets.get(0), ServiceGovernance.Verdict.SUCCESS);
        need(b.state == ServiceGovernance.State.CLOSED && b.failures == 0, "new probe closes and resets");
        b.finish(tickets.get(0), ServiceGovernance.Verdict.FAILURE);
        need(b.state == ServiceGovernance.State.CLOSED && b.failures == 0, "duplicate completion is inert");
        open(b); time.addAndGet(ms(1000));
        b.finish(b.tryAcquire(), ServiceGovernance.Verdict.IGNORED);
        need(b.state == ServiceGovernance.State.OPEN, "undispatched half-open probe does not assert health");
        need(b.tryAcquire() == null, "abandoned probe restarts cooldown");
        var independent = new ServiceGovernance.Breaker(time::get);
        open(independent); time.addAndGet(ms(1000));
        need(b.tryAcquire() != null && independent.tryAcquire() != null,
                "two processes have two probes, not one global probe");
        System.out.println("PASS independent breaker traces: 48-way half-open, stale SUCCESS, duplicate finish, abandoned probe, per-instance scope");

        // JVM counterexample, separate from the pseudocode implementation:
        // Future.cancel(true) marks the future done before interrupt-ignoring I/O exits.
        Semaphore slots = new Semaphore(1);
        CountDownLatch entered = new CountDownLatch(1), leave = new CountDownLatch(1), exited = new CountDownLatch(1);
        need(slots.tryAcquire(), "first local I/O slot");
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> future = executor.submit(() -> {
                entered.countDown();
                try {
                    for (;;) { try { leave.await(); break; } catch (InterruptedException ignored) {} }
                } finally { slots.release(); exited.countDown(); }
            });
            need(entered.await(3, TimeUnit.SECONDS), "I/O began");
            need(future.cancel(true) && future.isDone(), "caller future reports cancelled/done");
            need(!slots.tryAcquire(), "still-active local I/O retains the only slot");
            leave.countDown(); need(exited.await(3, TimeUnit.SECONDS), "I/O actually ended");
            need(slots.tryAcquire(), "slot released only on actual local termination"); slots.release();
        } finally { leave.countDown(); executor.shutdownNow(); executor.awaitTermination(3, TimeUnit.SECONDS); }
        System.out.println("PASS real JVM cancellation counterexample: Future done is not local I/O termination");
        System.out.println("INDEPENDENT JAVA CHECKS=" + checks);
    }
}
