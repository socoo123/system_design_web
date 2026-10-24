import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.Deque;

/** Java 17, standard library only. Policy examples; not an HTTP/gRPC server. */
public final class ProtocolContracts {
    private ProtocolContracts() {}

    // BEGIN budget
    record Budget(long startedNanos, long totalNanos, long returnReserveNanos) {
        Budget {
            if (totalNanos <= 0 || returnReserveNanos < 0
                    || returnReserveNanos >= totalNanos) {
                throw new IllegalArgumentException("invalid budget");
            }
        }
        long downstreamNanos(long nowNanos) {
            long elapsed = nowNanos - startedNanos;
            if (elapsed < 0) throw new IllegalArgumentException("non-monotonic clock");
            long usable = totalNanos - returnReserveNanos;
            return elapsed >= usable ? 0 : usable - elapsed;
        }
        boolean canStart(int attemptsStarted, boolean retrySafe, long nowNanos) {
            return attemptsStarted >= 0 && attemptsStarted < 2
                    && (attemptsStarted == 0 || retrySafe)
                    && downstreamNanos(nowNanos) > 0;
        }
    }
    // END budget

    // BEGIN resume
    record Cursor(String scope, String epoch, long seq) {}
    // LogView is a coherent view: all [oldest, high] entries are retained.
    // Empty log: oldest = high + 1. Values are nonnegative, below Long.MAX_VALUE.
    record LogView(String scope, String epoch, long oldest, long high) {}
    enum Resume { REPLAY_AFTER, RESET, INVALID_CURSOR }
    static Resume resume(Cursor applied, LogView log, boolean authorized) {
        if (!authorized || !log.scope().equals(applied.scope())) {
            throw new SecurityException("scope not authorized");
        }
        if (log.high() < 0 || log.high() == Long.MAX_VALUE
                || log.oldest() < 1 || log.oldest() > log.high() + 1) {
            throw new IllegalArgumentException("invalid retained range");
        }
        if (applied.seq() < 0) return Resume.INVALID_CURSOR;
        if (!log.epoch().equals(applied.epoch())) return Resume.RESET;
        if (applied.seq() > log.high()) return Resume.INVALID_CURSOR;
        if (applied.seq() < log.oldest() - 1) return Resume.RESET;
        return Resume.REPLAY_AFTER; // Read seq > applied.seq(), then tail SAME log.
    }
    // END resume

    // Sink MUST be nonblocking, advance src by exactly its return value,
    // and have no unbounded application/framework queue behind it.
    interface NonBlockingSink { int write(ByteBuffer src) throws IOException; }

    static final class BoundedWriter {
        private final int capacity;
        private final long stallNanos;
        private final Deque<ByteBuffer> queue = new ArrayDeque<>();
        private int pending;
        private long progressedAt;
        private boolean closed;

        BoundedWriter(int capacity, long stallNanos) {
            if (capacity <= 0 || stallNanos <= 0) throw new IllegalArgumentException();
            this.capacity = capacity;
            this.stallNanos = stallNanos;
        }

        // BEGIN writer
        boolean offer(byte[] owned, long now) {
            if (!tick(now)) return false;
            if (owned.length > capacity - pending) { abort(); return false; }
            if (owned.length == 0) return true;
            if (pending == 0) progressedAt = now;
            queue.add(ByteBuffer.wrap(owned)); // Success transfers exclusive ownership.
            pending += owned.length;
            return true;
        }
        boolean flush(NonBlockingSink sink, long now) throws IOException {
            if (!tick(now)) return false;
            if (pending == 0) return true;
            ByteBuffer head = queue.peek();
            int before = head.remaining();
            try {
                int n = sink.write(head); // One nonblocking write; zero is no progress.
                if (n < 0 || n > before || before - head.remaining() != n) {
                    abort(); throw new IllegalStateException("sink contract violated");
                }
                if (n > 0) {
                    pending -= n;
                    progressedAt = now;
                    if (!head.hasRemaining()) queue.remove();
                }
                return true;
            } catch (IOException failure) { abort(); throw failure; }
        }
        boolean tick(long now) { // Run even when the socket is not writable.
            if (!closed && pending > 0 && now - progressedAt >= stallNanos) abort();
            return !closed;
        }
        void abort() { closed = true; queue.clear(); pending = 0; }
        // END writer

        int pendingBytes() { return pending; }
        boolean closed() { return closed; }
    }
}
