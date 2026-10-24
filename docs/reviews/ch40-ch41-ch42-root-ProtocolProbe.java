import java.io.IOException;
import java.util.Arrays;

/** Independent boundary inputs for the actual Ch40 policy classes. */
class ProtocolProbe {
    private static int checks;
    private static void check(boolean value, String label) {
        checks++;
        if (!value) throw new AssertionError(label);
    }
    private static void denied(Runnable action, String label) {
        try { action.run(); throw new AssertionError(label); }
        catch (SecurityException expected) { checks++; }
    }
    public static void main(String[] args) throws Exception {
        var b = new ProtocolContracts.Budget(1000, 80, 11);
        check(b.downstreamNanos(1013) == 56, "original remaining budget");
        check(b.downstreamNanos(1069) == 0, "exact exhaustion");
        check(!b.canStart(1, false, 1010), "unsafe repeat refused");
        check(!b.canStart(2, true, 1010), "third total attempt refused");
        check(b.canStart(1, true, 1068), "positive remaining duration");
        var wrapped = new ProtocolContracts.Budget(Long.MAX_VALUE - 10, 100, 10);
        check(wrapped.downstreamNanos(Long.MIN_VALUE + 9) == 70, "nanoTime wrap within interval");

        var log = new ProtocolContracts.LogView("tenant-B/feed", "epoch-19", 101, 120);
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), log.epoch(), 100), log, true)
              == ProtocolContracts.Resume.REPLAY_AFTER, "oldest minus one includes oldest");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), log.epoch(), 99), log, true)
              == ProtocolContracts.Resume.RESET, "one event missing requires reset");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), log.epoch(), 120), log, true)
              == ProtocolContracts.Resume.REPLAY_AFTER, "highwater resumes tail");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), log.epoch(), 121), log, true)
              == ProtocolContracts.Resume.INVALID_CURSOR, "future cursor cannot skip events");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), "old", 0), log, true)
              == ProtocolContracts.Resume.RESET, "epoch change needs coherent snapshot");
        denied(() -> ProtocolContracts.resume(new ProtocolContracts.Cursor("other", log.epoch(), 120), log, true),
               "cursor scope cannot substitute authenticated scope");
        denied(() -> ProtocolContracts.resume(new ProtocolContracts.Cursor(log.scope(), log.epoch(), 120), log, false),
               "new authorization required");
        var empty = new ProtocolContracts.LogView("s", "e", 501, 500);
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("s", "e", 500), empty, true)
              == ProtocolContracts.Resume.REPLAY_AFTER, "empty retained tail");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("s", "e", 499), empty, true)
              == ProtocolContracts.Resume.RESET, "empty log cannot supply old history");

        var writer = new ProtocolContracts.BoundedWriter(6, 10);
        check(writer.offer(new byte[]{1, 2, 3}, 100), "initial chunk admitted");
        check(writer.offer(new byte[]{4, 5, 6}, 109), "exact payload bound");
        check(!writer.tick(110) && writer.pendingBytes() == 0, "new input cannot prolong stalled writes");
        var partial = new ProtocolContracts.BoundedWriter(6, 10);
        partial.offer(new byte[]{7, 8, 9}, 0);
        byte[] output = new byte[3];
        check(partial.flush(src -> { output[0] = src.get(); return 1; }, 9), "partial first write");
        check(partial.pendingBytes() == 2 && partial.tick(18), "positive write resets stall timer");
        check(partial.flush(src -> { output[1] = src.get(); output[2] = src.get(); return 2; }, 18), "ordered remainder");
        check(Arrays.equals(output, new byte[]{7, 8, 9}) && partial.pendingBytes() == 0, "stream order preserved");
        check(partial.tick(1000), "empty queue has no stale stall timeout");
        check(partial.offer(new byte[]{1}, 1000) && !partial.tick(1010), "new busy period has new origin");
        var overflow = new ProtocolContracts.BoundedWriter(3, 10);
        overflow.offer(new byte[]{1, 2}, 0);
        check(!overflow.offer(new byte[]{3, 4}, 1) && overflow.closed(), "overflow closes durable stream");
        var broken = new ProtocolContracts.BoundedWriter(3, 10);
        broken.offer(new byte[]{1}, 0);
        try { broken.flush(src -> { throw new IOException("fixture"); }, 1); throw new AssertionError("missing IOException"); }
        catch (IOException expected) { check(broken.closed() && broken.pendingBytes() == 0, "I/O failure clears queue"); }
        System.out.println("ProtocolProbe PASS " + checks + " independent assertions; deterministic policy inputs only.");
    }
}
