/** Java 17 teaching helper. Single event-loop caller; no Redis/network client.
 * All times use one System.nanoTime() clock, durations stay below 2^63 ns.
 * A local budget limits dispatch, never proves remote ownership or rollback. */
public final class LeaseBudget {
    private static final long WINDOW = 9_800_000_000L; // 10 s TTL - 200 ms margin
    private long sent, renewalSent;
    private boolean held, pending;
    private LeaseBudget(long sent, long now, boolean ok) {
        this.sent = sent;
        held = ok && now - sent >= 0 && now - sent < WINDOW;
    }
    public static LeaseBudget acquired(long sent, long now, boolean ok) {
        return new LeaseBudget(sent, now, ok); // timeout/error/busy => ok=false
    }
    // BEGIN PAGE
    public boolean usable(long now) {
        if (now - sent < 0 || now - sent >= WINDOW) held = false;
        return held;                          // LOST is terminal for this object
    }
    public boolean beginRenewal(long now) {
        if (pending || !usable(now)) return false;
        renewalSent = now; pending = true;    // at most one renewal in flight
        return true;
    }
    public boolean finishRenewal(long now, boolean ok) {
        if (!pending) throw new IllegalStateException("no pending renewal");
        pending = false;
        // First check the OLD lease: a late OK must never resurrect it.
        if (!ok || !usable(now) || now - renewalSent < 0
                || now - renewalSent >= WINDOW) {
            held = false;
            return false;
        }
        sent = renewalSent;                   // budget from SEND, not reply
        return true;
    }
    public void abandon() { held = false; }  // cancellation/unknown renewal
    // END PAGE
}
