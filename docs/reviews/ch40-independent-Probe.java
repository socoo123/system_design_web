import java.io.*;
import java.util.*;

/** Independent new-input review. Invokes the real chapter policy class. */
public final class Ch40IndependentProbe {
    static final long MS = 1_000_000L, SECOND = 1_000_000_000L;
    static final List<String> passed = new ArrayList<>();
    static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        passed.add(label);
    }
    static void expect(Class<? extends Throwable> type, Runnable action, String label) {
        try { action.run(); }
        catch (Throwable failure) { check(type.isInstance(failure), label); return; }
        throw new AssertionError(label + ": no failure");
    }
    public static void main(String[] args) throws Exception {
        var budget = new ProtocolContracts.Budget(700 * MS, 411 * MS, 31 * MS);
        check(budget.downstreamNanos(795 * MS) == 285 * MS, "new budget: 411-95-31=285ms");
        check(budget.canStart(1, true, 1000 * MS)
                && budget.downstreamNanos(1000 * MS) == 80 * MS, "second attempt keeps original duration");
        check(!budget.canStart(1, false, 1000 * MS), "unknown unsafe effect cannot get a second attempt");
        check(!budget.canStart(2, true, 1000 * MS), "two previous attempts reject further work");
        check(!budget.canStart(0, true, 1080 * MS), "exact return-reserve boundary blocks dispatch");
        long start = Long.MAX_VALUE - 20;
        var wrap = new ProtocolContracts.Budget(start, 90, 7);
        check(wrap.downstreamNanos(start + 40) == 43, "monotonic signed wrap for short elapsed interval");

        var log = new ProtocolContracts.LogView("events:t9", "v4", 71, 91);
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 70), log, true)
                == ProtocolContracts.Resume.REPLAY_AFTER, "oldest-1 includes first retained 71");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 69), log, true)
                == ProtocolContracts.Resume.RESET, "missing retained event 70 requires RESET");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 91), log, true)
                == ProtocolContracts.Resume.REPLAY_AFTER, "current high tails without replay");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 92), log, true)
                == ProtocolContracts.Resume.INVALID_CURSOR, "future cursor rejected");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v3", 999), log, true)
                == ProtocolContracts.Resume.RESET, "old epoch has incomparable sequence; fetch coherent snapshot");
        expect(SecurityException.class, () -> ProtocolContracts.resume(
                new ProtocolContracts.Cursor("events:t8", "v4", 70), log, true), "scope mismatch rejected despite auth boolean");
        expect(SecurityException.class, () -> ProtocolContracts.resume(
                new ProtocolContracts.Cursor("events:t9", "v4", 70), log, false), "fresh authorization required");
        var empty = new ProtocolContracts.LogView("events:t9", "v4", 18, 17);
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 17), empty, true)
                == ProtocolContracts.Resume.REPLAY_AFTER, "fully pruned log accepts last applied high");
        check(ProtocolContracts.resume(new ProtocolContracts.Cursor("events:t9", "v4", 16), empty, true)
                == ProtocolContracts.Resume.RESET, "fully pruned log cannot supply missing last event");
        expect(IllegalArgumentException.class, () -> ProtocolContracts.resume(
                new ProtocolContracts.Cursor("events:t9", "v4", 70),
                new ProtocolContracts.LogView("events:t9", "v4", 94, 91), true), "incoherent retained bounds rejected");

        var writer = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        check(writer.offer(new byte[]{1,2,3,4,5}, 30 * SECOND)
                && writer.offer(new byte[]{6,7,8}, 30 * SECOND), "new byte sequence accepted under cap");
        var bytes = new ArrayList<Byte>();
        writer.flush(src -> { for (int i=0;i<3;i++) bytes.add(src.get()); return 3; }, 31 * SECOND);
        check(writer.pendingBytes() == 5, "partial write retains exact remainder");
        writer.flush(src -> 0, 32 * SECOND);
        check(writer.tick(33 * SECOND - 1), "zero write leaves prior positive progress origin");
        check(!writer.tick(33 * SECOND) && writer.pendingBytes() == 0, "exact no-progress limit closes and clears");
        check(!writer.offer(new byte[]{9}, 34 * SECOND), "closed writer cannot be revived");

        var ordered = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        ordered.offer(new byte[]{9,8,7,6,5}, 0);
        ordered.offer(new byte[]{4,3,2,1}, 0);
        var actual = new ArrayList<Integer>();
        while (ordered.pendingBytes() != 0) ordered.flush(src -> {
            int n = Math.min(2, src.remaining());
            for (int i=0;i<n;i++) actual.add(Byte.toUnsignedInt(src.get()));
            return n;
        }, SECOND);
        check(actual.equals(List.of(9,8,7,6,5,4,3,2,1)), "two-byte partial drain preserves queue byte order");
        check(ordered.tick(500 * SECOND), "empty queue has no stale-data timer");
        ordered.offer(new byte[]{99}, 500 * SECOND);
        check(ordered.tick(502 * SECOND - 1) && !ordered.tick(502 * SECOND), "newly nonempty queue starts a fresh stall interval");
        var full = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        check(full.offer(new byte[13], 0), "exact new cap accepted");
        check(!full.offer(new byte[]{1}, SECOND) && full.closed(), "one byte overflow aborts rather than dropping silently");

        var trickle = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        trickle.offer(new byte[13], 0);
        for (int i = 1; i <= 8; i++) trickle.flush(src -> { src.get(); return 1; }, i * 1_900_000_000L);
        check(!trickle.closed() && trickle.pendingBytes() == 5,
                "15.2s one-byte trickle remains open: stall is not an overall deadline");
        check(!trickle.tick(8 * 1_900_000_000L + 2 * SECOND), "trickle stops: exact next stall boundary aborts");
        var broken = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        broken.offer(new byte[]{4,5}, 0);
        try { broken.flush(src -> { src.get(); throw new IOException("failed after partial acceptance"); }, SECOND); }
        catch (IOException expected) { check(broken.closed() && broken.pendingBytes() == 0, "I/O exception after movement aborts all pending bytes"); }
        var lying = new ProtocolContracts.BoundedWriter(13, 2 * SECOND);
        lying.offer(new byte[]{1,2}, 0);
        expect(IllegalStateException.class, () -> {
            try { lying.flush(src -> { src.get(); return 2; }, SECOND); }
            catch (IOException impossible) { throw new AssertionError(impossible); }
        }, "reported bytes differ from movement: invalid sink rejected");
        check(lying.closed(), "sink contract failure closes writer");
        System.out.println("{\"passed\":true,\"claims\":[");
        for (int i=0;i<passed.size();i++)
            System.out.println("  \""+passed.get(i)+"\""+(i+1<passed.size()?",":""));
        System.out.println("]}");
    }
}
