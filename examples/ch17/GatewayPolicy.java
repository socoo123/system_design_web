import java.util.ArrayDeque;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;

/** Java 17 local policy core. No HTTP server, JWT verifier or Redis client. */
public final class GatewayPolicy {
    private GatewayPolicy() {}

    // BEGIN PAGE deadline
    record Deadline(long endMs, long upstreamEndMs) {
        static Deadline afterPolicy(long receivedMs, long nowMs) {
            long end = receivedMs + 300;
            return new Deadline(end, Math.min(nowMs + 240, end - 40));
        }
        long nextAttemptMs(long nowMs, long perTryMs) {
            return Math.max(0, Math.min(perTryMs, upstreamEndMs - nowMs));
        }
    }
    enum Failure { RESET, CONNECT, TIMEOUT, HTTP_STATUS, CLIENT_CANCEL }
    record Replay(String method, boolean bufferedBody, boolean responseStarted,
                  int attempts, Failure failure) {}
    static boolean mayRetry(Replay r, Deadline d, long nowMs, long delayMs) {
        // This gateway chooses the conservative GET/HEAD subset.
        boolean methodOk = r.method.equals("GET") || r.method.equals("HEAD");
        boolean transientFailure = r.failure == Failure.RESET
                || r.failure == Failure.CONNECT || r.failure == Failure.TIMEOUT;
        return methodOk && r.bufferedBody && !r.responseStarted
                && r.attempts == 1 && transientFailure && delayMs >= 0
                && d.nextAttemptMs(nowMs + delayMs, 80) >= 20;
    }
    // END PAGE deadline

    // BEGIN PAGE retry-budget
    static final class RetryBudget {
        private int remainder, credits;       // EMPTY on process start
        synchronized void originalAdmitted() { // exactly once, never for a retry
            if (++remainder == 20) {
                credits = Math.min(125, credits + 1);
                remainder = 0;
            }
        }
        synchronized boolean takeRetry() {
            if (credits == 0) return false;
            credits--;
            return true;                       // never refund consumed credit
        }
    }
    static final class ActiveStreams {
        private final Semaphore slots = new Semaphore(800);
        StreamPermit start() {              // no hidden queue
            return slots.tryAcquire() ? new StreamPermit(slots) : null;
        }
    }
    static final class StreamPermit {
        final Semaphore slots;
        final AtomicBoolean released = new AtomicBoolean();
        StreamPermit(Semaphore slots) { this.slots = slots; }
        void transportTerminated() {
            if (released.compareAndSet(false, true)) slots.release();
        }                                    // timer expiry alone is not terminal
    }
    // END PAGE retry-budget

    enum State { CLOSED, OPEN, HALF_OPEN }
    static final class Ticket {
        final long epoch;
        final boolean probe;
        boolean done;
        Ticket(long epoch, boolean probe) { this.epoch = epoch; this.probe = probe; }
    }
    record Sample(long observedMs, boolean success) {}
    static LongSupplier elapsedClock() {
        final long origin = System.nanoTime();
        return () -> (System.nanoTime() - origin) / 1_000_000;
    }
    static final class Breaker {
        State state = State.CLOSED;
        long epoch, retryAt;
        boolean probeActive;
        final ArrayDeque<Sample> samples = new ArrayDeque<>();
        // BEGIN PAGE breaker
        final LongSupplier clock;
        Breaker() { this(elapsedClock()); }
        Breaker(LongSupplier monotonicMs) { this.clock = monotonicMs; }

        synchronized Ticket enter() {
            long nowMs = clock.getAsLong();  // observe time AFTER acquiring monitor
            if (state == State.OPEN) {
                if (nowMs < retryAt) return null;
                state = State.HALF_OPEN; epoch++;
            }
            if (state == State.HALF_OPEN) {
                if (probeActive) return null;
                probeActive = true;
                return new Ticket(epoch, true);
            }
            return new Ticket(epoch, false);
        }
        synchronized void complete(Ticket t, boolean ok) {
            long nowMs = clock.getAsLong();  // terminal observation, not event time
            if (t.done) return;
            t.done = true;
            if (t.epoch != epoch) return;       // ignore a stale completion
            if (t.probe) {
                probeActive = false; epoch++; samples.clear();
                state = ok ? State.CLOSED : State.OPEN;
                if (!ok) retryAt = nowMs + 5000;
            } else if (state == State.CLOSED) {
                samples.addLast(new Sample(nowMs, ok));
                while (!samples.isEmpty() && nowMs - samples.peekFirst().observedMs >= 10000)
                    samples.removeFirst();
                long failed = samples.stream().filter(s -> !s.success).count();
                if (samples.size() >= 100 && failed * 2 >= samples.size()) {
                    state = State.OPEN; retryAt = nowMs + 5000; epoch++;
                    samples.clear();
                }
            }
        }
        // END PAGE breaker
    }
}
