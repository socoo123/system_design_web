import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public final class ProtocolContractsTest {
    static final long MS = 1_000_000L;
    static final long SECOND = 1_000 * MS;
    static final List<String> passed = new ArrayList<>();
    static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        passed.add(label);
    }
    static void expect(Class<? extends Throwable> type, Runnable action, String label) {
        try { action.run(); }
        catch (Throwable t) { check(type.isInstance(t), label); return; }
        throw new AssertionError("Expected " + type + ": " + label);
    }
    public static void main(String[] args) throws Exception {
        var budget = new ProtocolContracts.Budget(100 * MS, 300 * MS, 20 * MS);
        check(budget.downstreamNanos(140 * MS) == 240 * MS, "A2: 240 ms remaining");
        check(budget.downstreamNanos(240 * MS) == 140 * MS, "second attempt cannot restart 300 ms");
        check(budget.downstreamNanos(380 * MS) == 0, "reserve boundary excludes new downstream work");
        check(budget.downstreamNanos(500 * MS) == 0, "expired budget stays zero");
        check(budget.canStart(0, false, 140 * MS), "first attempt allowed without retry proof");
        check(!budget.canStart(1, false, 140 * MS), "unknown mutation is not blindly retried");
        check(budget.canStart(1, true, 240 * MS), "safe second attempt within original budget");
        check(!budget.canStart(2, true, 240 * MS), "third total attempt rejected");
        check(!budget.canStart(1, true, 380 * MS), "safe retry cannot resurrect expiry");
        expect(IllegalArgumentException.class, () -> budget.downstreamNanos(99 * MS), "clock goes backward rejected");
        expect(IllegalArgumentException.class, () -> new ProtocolContracts.Budget(0, 300, 300), "invalid reserve rejected");

        var log = new ProtocolContracts.LogView("orders:user7", "E", 43, 50);
        var cursor = new ProtocolContracts.Cursor("orders:user7", "E", 42);
        check(ProtocolContracts.resume(cursor, log, true) == ProtocolContracts.Resume.REPLAY_AFTER,
                "oldest minus one resumes with first retained event 43");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("orders:user7", "E", 50), log, true)
                == ProtocolContracts.Resume.REPLAY_AFTER, "highwater cursor tails future events");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("orders:user7", "E", 41), log, true)
                == ProtocolContracts.Resume.RESET, "pruned event 42 requires coherent snapshot");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("orders:user7", "old", 49), log, true)
                == ProtocolContracts.Resume.RESET, "epoch mismatch cannot replay");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("orders:user7", "E", 51), log, true)
                == ProtocolContracts.Resume.INVALID_CURSOR, "future cursor cannot silently skip history");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("orders:user7", "E", -1), log, true)
                == ProtocolContracts.Resume.INVALID_CURSOR, "negative cursor rejected");
        expect(SecurityException.class, () -> ProtocolContracts.resume(cursor, log, false), "reauthorize reconnect");
        expect(SecurityException.class, () -> ProtocolContracts.resume(
                new ProtocolContracts.Cursor("orders:other", "E", 42), log, true), "cross-scope cursor rejected");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("s", "E", 0),
                new ProtocolContracts.LogView("s", "E", 1, 0), true) == ProtocolContracts.Resume.REPLAY_AFTER,
                "empty new log tails from zero");

        var writer = new ProtocolContracts.BoundedWriter(65_536, 2 * SECOND);
        check(writer.tick(100 * SECOND), "empty connection has no stalled-data timeout");
        check(writer.offer(new byte[] {1, 2, 3, 4}, 100 * SECOND), "first payload starts progress timer");
        List<Integer> emitted = new ArrayList<>();
        check(writer.flush(src -> { emitted.add((int) src.get()); emitted.add((int) src.get()); return 2; }, 101 * SECOND),
                "partial write makes progress");
        check(writer.pendingBytes() == 2, "partial remainder remains owned and counted");
        check(writer.flush(src -> 0, 102 * SECOND), "zero write does not reset timer");
        check(writer.tick(103 * SECOND - 1), "positive write reset stall origin");
        check(!writer.tick(103 * SECOND) && writer.pendingBytes() == 0, "exact two seconds stalled aborts and clears");
        check(!writer.offer(new byte[] {9}, 104 * SECOND), "closed stream cannot resume implicitly");

        var ordered = new ProtocolContracts.BoundedWriter(8, 2 * SECOND);
        ordered.offer(new byte[] {1, 2}, 0);
        ordered.offer(new byte[] {3}, SECOND);
        List<Integer> bytes = new ArrayList<>();
        while (ordered.pendingBytes() > 0) ordered.flush(src -> {
            int n = src.remaining(); while (src.hasRemaining()) bytes.add((int) src.get()); return n;
        }, SECOND);
        check(bytes.equals(List.of(1, 2, 3)), "queued events preserve byte order");
        check(ordered.tick(100 * SECOND), "drained connection does not time out");
        var full = new ProtocolContracts.BoundedWriter(65_536, 2 * SECOND);
        check(full.offer(new byte[65_536], 0), "exact cap accepted");
        check(!full.offer(new byte[1], SECOND) && full.closed() && full.pendingBytes() == 0,
                "overflow closes instead of silently dropping durable bytes");
        var slow = new ProtocolContracts.BoundedWriter(8, 2 * SECOND);
        slow.offer(new byte[] {1}, 0);
        slow.offer(new byte[] {2}, SECOND);
        check(!slow.tick(2 * SECOND), "new queued bytes cannot renew stalled writer");
        var failure = new ProtocolContracts.BoundedWriter(8, 2 * SECOND);
        failure.offer(new byte[] {1}, 0);
        try { failure.flush(src -> { throw new IOException("peer closed"); }, SECOND); }
        catch (IOException expected) { check(failure.closed() && failure.pendingBytes() == 0, "I/O failure aborts local queue"); }
        var invalid = new ProtocolContracts.BoundedWriter(8, 2 * SECOND);
        invalid.offer(new byte[] {1}, 0);
        expect(IllegalStateException.class, () -> {
            try { invalid.flush(src -> 1, SECOND); } catch (IOException impossible) { throw new AssertionError(impossible); }
        }, "sink return must match consumed ByteBuffer bytes");

        check(2_000 * (1 - 0.8) > 399.999 && 2_000 * (1 - 0.8) < 400.001, "A1: 400 origin requests per second");
        check(20_000L * 65_536 == 1_310_720_000L, "A4: exact WS payload bytes");
        check(100 * 300 == 30_000 && 30_000 * 200 == 6_000_000, "A6: retained raw payload");
        check(40 + 20 + 500 + 40 == 600 && (400 - 1) / 50.0 == 7.98, "A7/A8: first event and remaining intervals");
        check(200L * 65_536 == 12.5 * 1_048_576, "A9: 12.5 MiB queued payload");
        System.out.println("{\"java\":\"17\",\"passed\":" + passed.size() + ",\"checks\":[");
        for (int i = 0; i < passed.size(); i++) {
            System.out.println("  \"" + passed.get(i) + "\"" + (i + 1 < passed.size() ? "," : ""));
        }
        System.out.println("]}");
    }
}
