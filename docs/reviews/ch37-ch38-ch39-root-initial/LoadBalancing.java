import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;
import java.util.random.RandomGenerator;

/** Java 17 teaching model: selection snapshots and one authoritative App gate. */
public final class LoadBalancing {
    enum Phase { WARMING, READY, DRAINING, UNHEALTHY }
    enum DrainDecision { WAIT, CLEAN_EXIT, FORCE_REQUIRED }

    // healthy includes this selector's ejection policy; this is a staleable snapshot.
    record Endpoint(String id, long incarnation, Phase phase,
                    boolean healthy, int observedActive) {
        Endpoint {
            if (id == null || id.isBlank() || incarnation < 1 || observedActive < 0)
                throw new IllegalArgumentException("invalid endpoint");
        }
    }

    // BEGIN choose
    static Endpoint choose(List<Endpoint> snapshot, RandomGenerator random) {
        var available = snapshot.stream()
            .filter(e -> e.phase() == Phase.READY && e.healthy()).toList();
        int n = available.size();
        if (n == 0) return null; // explicit no-host rejection, no unhealthy fallback
        int i = random.nextInt(n);
        if (n == 1) return available.get(i);
        int j = random.nextInt(n - 1);
        if (j >= i) j++; // sample two distinct candidates
        var a = available.get(i);
        var b = available.get(j);
        return a.observedActive() <= b.observedActive() ? a : b;
    }
    // END choose

    static final class Permit {
        private final Gate owner;
        private final long incarnation, sequence;
        private Permit(Gate owner, long incarnation, long sequence) {
            this.owner = owner; this.incarnation = incarnation; this.sequence = sequence;
        }
    }

    static final class Gate {
        final ReentrantLock lock = new ReentrantLock();
        private final long incarnation;
        private final int limit;
        private final LongSupplier clock;
        private final Set<Long> active = new HashSet<>();
        private Phase phase = Phase.WARMING;
        private long sequence, drainRevision, drainUntil;
        private boolean removalAck;

        Gate(long incarnation, int limit, LongSupplier monotonicNanos) {
            if (incarnation < 1 || limit < 1) throw new IllegalArgumentException();
            this.incarnation = incarnation; this.limit = limit; this.clock = monotonicNanos;
        }

        boolean ready(long expectedIncarnation) {
            lock.lock();
            try {
                if (expectedIncarnation != incarnation || phase != Phase.WARMING) return false;
                phase = Phase.READY; return true;
            } finally { lock.unlock(); }
        }

        boolean unhealthy(long expectedIncarnation) {
            lock.lock();
            try {
                if (expectedIncarnation != incarnation ||
                    (phase != Phase.READY && phase != Phase.WARMING)) return false;
                phase = Phase.UNHEALTHY; return true;
            } finally { lock.unlock(); }
        }

        // BEGIN admit
        Permit tryAdmit(long expectedIncarnation, long deadline) {
            lock.lock();
            try {
                long now = clock.getAsLong(); // sample after acquiring the lock
                if (expectedIncarnation != incarnation || phase != Phase.READY ||
                    now - deadline >= 0 || active.size() >= limit) return null;
                long id = Math.incrementExact(sequence);
                sequence = id; active.add(id);
                return new Permit(this, incarnation, id);
            } finally { lock.unlock(); }
        }
        boolean finish(Permit permit) { // actual handler completion, not caller timeout
            lock.lock();
            try {
                return permit != null && permit.owner == this &&
                    permit.incarnation == incarnation && active.remove(permit.sequence);
            } finally { lock.unlock(); }
        }
        // END admit

        // BEGIN drain
        long beginDrain(long revision, long budgetNanos) {
            lock.lock();
            try {
                if (phase == Phase.DRAINING && revision == drainRevision) return drainUntil;
                if (phase != Phase.READY || revision < 1 || budgetNanos < 0 ||
                    budgetNanos > (1L << 62)) throw new IllegalStateException();
                long now = clock.getAsLong();
                phase = Phase.DRAINING; // close locally before publishing removal
                drainRevision = revision;
                drainUntil = now + budgetNanos;
                return drainUntil;
            } finally { lock.unlock(); }
        }
        boolean acknowledgeRemoval(long expectedIncarnation, long revision) {
            lock.lock();
            try {
                if (expectedIncarnation != incarnation || phase != Phase.DRAINING ||
                    revision != drainRevision) return false;
                removalAck = true; return true;
            } finally { lock.unlock(); }
        }
        DrainDecision pollDrain() {
            lock.lock();
            try {
                if (phase != Phase.DRAINING) throw new IllegalStateException();
                long now = clock.getAsLong();
                if (removalAck && active.isEmpty()) return DrainDecision.CLEAN_EXIT;
                return now - drainUntil >= 0 ? DrainDecision.FORCE_REQUIRED : DrainDecision.WAIT;
            } finally { lock.unlock(); }
        }
        // END drain

        int activeCount() {
            lock.lock();
            try { return active.size(); } finally { lock.unlock(); }
        }
    }
}
