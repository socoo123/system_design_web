import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;

/** Java 17 local bookkeeping only. All methods run on the consumer/poll thread. */
public final class PartitionProgress {
    public enum Phase { ACTIVE, DRAINING, CLOSED }
    public static final class Ticket {
        private final PartitionProgress owner;
        private final long offset;
        private Ticket(PartitionProgress owner, long offset) {
            this.owner = owner; this.offset = offset;
        }
        public long offset() { return offset; }
    }
    private static final class Work {
        final Ticket ticket;
        boolean done;
        Work(Ticket ticket) { this.ticket = ticket; }
    }
    private final int maxBatch;
    private final ArrayDeque<Work> pending = new ArrayDeque<>();
    private Phase phase = Phase.ACTIVE;
    private long safeNext;
    private long batchNext;

    public PartitionProgress(long recoveredNext, int maxBatch) {
        if (recoveredNext < 0 || maxBatch <= 0) throw new IllegalArgumentException();
        this.safeNext = recoveredNext; this.batchNext = recoveredNext;
        this.maxBatch = maxBatch;
    }

    // BEGIN page-progress
    public List<Ticket> register(List<Long> offsets, long polledNext) {
        // Exactly one bounded batch per partition; pause it until pending is empty.
        if (phase != Phase.ACTIVE || !pending.isEmpty()) throw new IllegalStateException();
        List<Long> copy = List.copyOf(offsets);
        if (copy.size() > maxBatch || polledNext < safeNext) throw new IllegalArgumentException();
        long previous = -1;
        for (long offset : copy) {
            if (offset < safeNext || offset <= previous || offset >= polledNext)
                throw new IllegalArgumentException();
            previous = offset;
        }
        batchNext = polledNext; // from this poll's nextOffsets(), not a later position()
        var tickets = new ArrayList<Ticket>();
        for (long offset : copy) {
            Ticket ticket = new Ticket(this, offset);
            pending.addLast(new Work(ticket)); tickets.add(ticket);
        }
        safeNext = pending.isEmpty() ? batchNext : pending.getFirst().ticket.offset;
        return List.copyOf(tickets);
    }

    public boolean completed(Ticket ticket) {
        // A fresh tracker is created on assignment; old workers cannot complete it.
        if (phase == Phase.CLOSED || ticket == null || ticket.owner != this) return false;
        Work found = null;
        for (Work work : pending) if (work.ticket == ticket) { found = work; break; }
        if (found == null || found.done) return false;
        found.done = true; // only after the durable effect (or duplicate result) succeeds
        while (!pending.isEmpty() && pending.getFirst().done) pending.removeFirst();
        safeNext = pending.isEmpty() ? batchNext : pending.getFirst().ticket.offset;
        return true;
    }
    // END page-progress

    public void beginRevocation() {
        if (phase != Phase.ACTIVE) throw new IllegalStateException();
        phase = Phase.DRAINING; // allow known completions; forbid newly fetched work
    }
    public OptionalLong checkpoint() {
        return phase == Phase.CLOSED ? OptionalLong.empty() : OptionalLong.of(safeNext);
    }
    public boolean idle() { return pending.isEmpty(); }
    public Phase phase() { return phase; }
    public void close() {
        phase = Phase.CLOSED; pending.clear(); // LOST never provides a commit snapshot
    }
}
