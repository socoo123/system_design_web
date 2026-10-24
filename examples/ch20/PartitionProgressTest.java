import java.util.List;

public final class PartitionProgressTest {
    private static int checks;
    private static void check(boolean ok, String message) {
        checks++;
        if (!ok) throw new AssertionError(message);
    }
    private static void invalid(Runnable action, Class<? extends Exception> kind) {
        try { action.run(); throw new AssertionError("expected " + kind); }
        catch (Exception e) { check(kind.isInstance(e), "wrong failure: " + e); }
    }
    public static void main(String[] args) {
        var normal = new PartitionProgress(41, 500);
        var n = normal.register(List.of(41L, 42L, 43L), 44);
        check(normal.completed(n.get(0)), "41 complete");
        check(normal.checkpoint().orElseThrow() == 42, "safe next 42");
        check(normal.completed(n.get(2)), "43 finishes early");
        check(normal.checkpoint().orElseThrow() == 42, "unfinished 42 blocks 44");
        check(normal.completed(n.get(1)), "42 completes prefix");
        check(normal.checkpoint().orElseThrow() == 44 && normal.idle(), "batch finished");
        check(!normal.completed(n.get(0)), "duplicate callback ignored");

        var gap = new PartitionProgress(41, 4);
        var g = gap.register(List.of(41L, 45L, 50L), 53);
        gap.completed(g.get(2));
        check(gap.checkpoint().orElseThrow() == 41, "50 cannot skip 41");
        gap.completed(g.get(0));
        check(gap.checkpoint().orElseThrow() == 45, "skip absent offsets, not work");
        gap.completed(g.get(1));
        check(gap.checkpoint().orElseThrow() == 53, "use poll terminal, including filtered tail");
        gap.register(List.of(), 57);
        check(gap.checkpoint().orElseThrow() == 57, "empty filtered poll advances safely");

        var old = new PartitionProgress(41, 4);
        var oldWork = old.register(List.of(41L, 42L), 43);
        old.completed(oldWork.get(1));
        old.beginRevocation();
        invalid(() -> old.register(List.of(43L), 44), IllegalStateException.class);
        check(old.checkpoint().orElseThrow() == 41, "revoke keeps unfinished prefix");
        old.completed(oldWork.get(0));
        check(old.checkpoint().orElseThrow() == 43, "controlled drain can finish");
        old.close();
        check(old.checkpoint().isEmpty(), "closed has no commit snapshot");
        var fresh = new PartitionProgress(41, 4);
        var freshWork = fresh.register(List.of(41L, 42L), 43);
        check(!fresh.completed(oldWork.get(0)), "old assignment cannot complete new work");
        check(fresh.checkpoint().orElseThrow() == 41, "new assignment unchanged");
        fresh.close();
        check(!fresh.completed(freshWork.get(0)), "lost completion ignored");
        check(fresh.checkpoint().isEmpty(), "lost cannot commit");

        var bounded = new PartitionProgress(41, 2);
        invalid(() -> bounded.register(List.of(41L, 42L, 43L), 44), IllegalArgumentException.class);
        invalid(() -> bounded.register(List.of(42L, 41L), 43), IllegalArgumentException.class);
        invalid(() -> bounded.register(List.of(41L, 41L), 42), IllegalArgumentException.class);
        invalid(() -> bounded.register(List.of(40L), 42), IllegalArgumentException.class);
        invalid(() -> bounded.register(List.of(41L), 41), IllegalArgumentException.class);
        check(bounded.checkpoint().orElseThrow() == 41 && bounded.idle(), "invalid batch atomic validation");
        bounded.register(List.of(41L), 42);
        invalid(() -> bounded.register(List.of(42L), 43), IllegalStateException.class);
        check(!bounded.completed(null), "null completion ignored");

        int[] order = {0, 1, 2, 3};
        permutations(order, 0);
        System.out.println("PartitionProgress Java 17 checks passed: " + checks);
    }
    private static void permutations(int[] order, int at) {
        if (at == order.length) {
            long[] offsets = {7, 9, 12, 18};
            var p = new PartitionProgress(5, 4);
            var tickets = p.register(List.of(7L, 9L, 12L, 18L), 23);
            boolean[] done = new boolean[4];
            for (int i : order) {
                done[i] = true; p.completed(tickets.get(i));
                int first = 0;
                while (first < 4 && done[first]) first++;
                check(p.checkpoint().orElseThrow() == (first == 4 ? 23 : offsets[first]),
                        "permutation prefix with offset gaps");
            }
            return;
        }
        for (int i = at; i < order.length; i++) {
            int tmp = order[at]; order[at] = order[i]; order[i] = tmp;
            permutations(order, at + 1);
            tmp = order[at]; order[at] = order[i]; order[i] = tmp;
        }
    }
}
