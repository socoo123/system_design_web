import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;

/** Models only the current retry.pseudo worker's control flow using the actual
 * chapter Breaker. No retry executor/RPC implementation exists to run directly. */
final class Ch44QuotaProbe {
    interface Quota { boolean trySpend(); }
    static void workerPrefix(Quota quota, Semaphore slots,
                             ServiceGovernance.Breaker breaker,
                             ServiceGovernance.Breaker.Ticket ticket) {
        // attempt=2, not cancelled, enough remaining time; matches the source.
        if (!quota.trySpend()) {
            breaker.finish(ticket, ServiceGovernance.Verdict.IGNORED);
            slots.release();
        } else {
            try {
                breaker.finish(ticket, ServiceGovernance.Verdict.SUCCESS);
            } catch (RuntimeException unexpectedLocalError) {
                breaker.finish(ticket, ServiceGovernance.Verdict.IGNORED);
            } finally {
                slots.release();
            }
        }
    }
    public static void main(String[] args) throws Exception {
        AtomicLong clock = new AtomicLong();
        var breaker = new ServiceGovernance.Breaker(clock::get);
        for (int i = 0; i < 3; i++) breaker.finish(breaker.tryAcquire(), ServiceGovernance.Verdict.FAILURE);
        clock.set(1_000_000_000L);
        var probe = breaker.tryAcquire();
        Semaphore slots = new Semaphore(1);
        if (!slots.tryAcquire()) throw new AssertionError();
        try {
            workerPrefix(() -> { throw new IllegalStateException("local quota response decode failed"); },
                    slots, breaker, probe);
            throw new AssertionError("injected exception expected");
        } catch (IllegalStateException expected) {
            if (slots.availablePermits() != 0 || breaker.state != ServiceGovernance.State.HALF_OPEN)
                throw new AssertionError("counterexample did not reproduce");
            System.out.println("REPRODUCED: quota exception outside try/finally leaks one slot and leaves actual Breaker HALF_OPEN");
        }
    }
}
