import java.util.Objects;
import java.util.function.Supplier;

/** Local SDK transition model, not an authenticated HTTP client. */
public final class ConfigClient {
    public record Scope(String namespace, String instance, String identityContext) {}
    public record View(Scope scope, long generation, long ruleRevision, String release,
                       String checksum, Boolean allow, int timeoutMs) {
        public View {
            Objects.requireNonNull(scope); Objects.requireNonNull(release);
            Objects.requireNonNull(checksum);
            if (generation < 0 || ruleRevision < 0 || timeoutMs < 1 || timeoutMs > 60_000)
                throw new IllegalArgumentException("invalid validated view");
        }
    }
    // Clock must include suspension, or change era before any post-resume action.
    public record Clock(long elapsedMs, long era, boolean trusted) {
        public Clock {
            if (elapsedMs < 0 || era < 0) throw new IllegalArgumentException("clock origin");
        }
    }
    public record Ticket(long nonce, View target, Clock start) {}
    private record Applied(View view, Ticket proof) {}
    private final Supplier<Clock> clock;
    private Scope scope;
    private volatile Applied state;
    private Ticket pending;
    private Clock lastClock;
    private long nextNonce;
    private static final long REQUEST_MS = 2_000, PROOF_MS = 30_000;

    public ConfigClient(Scope scope, Supplier<Clock> clock) {
        this.scope = Objects.requireNonNull(scope); this.clock = Objects.requireNonNull(clock);
    }

    // BEGIN page:install
    public synchronized boolean install(View verifiedAndPrepared) {
        View next = verifiedAndPrepared; // adapter verified bytes, schema and resources
        if (!scope.equals(next.scope())) return false; // delayed old-identity reply
        Applied old = state;
        if (old != null && next.generation() < old.view().generation()) return false;
        if (old != null && next.generation() == old.view().generation()) {
            if (!next.equals(old.view())) throw new IllegalStateException("same-g fork");
            return true; // identical retry does not reset proof time
        }
        state = new Applied(next, null); // bytes + applied generation + cleared proof
        pending = null;                 // old confirmation cannot qualify new view
        return true;
    }

    public synchronized void identityChanged(Scope issuedScope) {
        scope = Objects.requireNonNull(issuedScope);
        state = null; pending = null;   // same g may now select another release
    }
    // END page:install

    // BEGIN page:proof
    private Clock observeClock() { // callers hold this SDK monitor
        Clock now = clock.get();
        if (!now.trusted() || (lastClock != null && (now.era() != lastClock.era()
                || now.elapsedMs() < lastClock.elapsedMs())))
            invalidateProof();    // clears BOTH proof and pending; keeps ordinary view
        lastClock = now;
        return now;
    }

    public synchronized Ticket beginConfirmation() {
        Clock now = observeClock();
        if (state == null || !now.trusted()) throw new IllegalStateException("unready");
        if (pending != null) throw new IllegalStateException("single flight");
        return pending = new Ticket(++nextNonce, state.view(), now);
    }

    public synchronized boolean confirmed(Ticket request, View selected, boolean authority) {
        Clock now = observeClock(); // a broken clock invalidates even this in-flight reply
        if (request == null || pending != request) return false; // transport binds nonce
        pending = null;                       // consume once, including failed replies
        Applied applied = state;
        boolean valid = authority && applied != null && Objects.equals(selected, request.target())
                && applied.view().equals(request.target())
                && fresh(now, request.start(), REQUEST_MS);
        if (applied != null) state = new Applied(applied.view(), valid ? request : null);
        return valid;                         // mismatch never renews the old allow
    }

    public synchronized boolean allowDangerousAction() {
        Clock now = observeClock();
        Applied applied = state;              // same local protection as install
        boolean proofFresh = applied != null && applied.proof() != null
                && fresh(now, applied.proof().start(), PROOF_MS);
        if (applied != null && applied.proof() != null && !proofFresh)
            state = new Applied(applied.view(), null); // no resurrection after clock fault
        return applied != null && Boolean.TRUE.equals(applied.view().allow())
                && proofFresh;
    }

    private static boolean fresh(Clock now, Clock start, long limitMs) {
        return now.trusted() && start.trusted() && now.era() == start.era()
                && now.elapsedMs() >= start.elapsedMs()
                && now.elapsedMs() - start.elapsedMs() < limitMs;
    }
    // END page:proof

    /** Timeout is unknown, not a new proof; retain any still-valid previous proof. */
    public synchronized void timeout(Ticket request) { if (pending == request) pending = null; }
    /** Called before post-resume actions or on definitive auth failure. */
    public synchronized void invalidateProof() {
        if (state != null) state = new Applied(state.view(), null);
        pending = null;
    }
    /** Immutable value capture for an ordinary operation. No remote read. */
    public View ordinarySnapshot() { Applied captured = state; return captured == null ? null : captured.view(); }
}
