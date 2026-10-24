import java.math.BigInteger;
import java.util.List;
import java.util.Map;

class SumProbe {
    static int checks;
    static void require(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    static boolean rejects(Class<? extends RuntimeException> type, Runnable task) {
        try { task.run(); return false; }
        catch (RuntimeException ex) { return type.isInstance(ex); }
    }
    static ExactSum.Part part(String query, String snapshot, String manifest, String fragment, String hash, BigInteger sum) {
        return new ExactSum.Part(query, snapshot, manifest, fragment, hash, sum);
    }
    public static void main(String[] args) {
        var manifest = Map.of("west", "sha-west", "east", "sha-east");
        var huge = BigInteger.valueOf(Long.MAX_VALUE).multiply(BigInteger.valueOf(3));
        var west = part("q-83", "snapshot-42", "manifest-9", "west", "sha-west", huge);
        var east = part("q-83", "snapshot-42", "manifest-9", "east", "sha-east", BigInteger.valueOf(-17));
        var expected = huge.subtract(BigInteger.valueOf(17));
        require(ExactSum.exactSum("q-83", "snapshot-42", "manifest-9", manifest, List.of(east, west)).equals(expected), "order-independent exact big integer sum");
        require(ExactSum.exactSum("q-83", "snapshot-42", "manifest-9", manifest, List.of(west, east, west)).equals(expected), "identical retries counted once");
        require(rejects(IllegalStateException.class, () -> ExactSum.exactSum("q-83", "snapshot-42", "manifest-9", manifest, List.of(west))), "missing east is INCOMPLETE");
        var conflict = part("q-83", "snapshot-42", "manifest-9", "west", "sha-west", huge.add(BigInteger.ONE));
        require(rejects(IllegalArgumentException.class, () -> ExactSum.exactSum("q-83", "snapshot-42", "manifest-9", manifest, List.of(west, east, conflict))), "same fragment with different sum rejected");
        for (var bad : List.of(
            part("other-query", "snapshot-42", "manifest-9", "east", "sha-east", BigInteger.ONE),
            part("q-83", "old-snapshot", "manifest-9", "east", "sha-east", BigInteger.ONE),
            part("q-83", "snapshot-42", "old-manifest", "east", "sha-east", BigInteger.ONE),
            part("q-83", "snapshot-42", "manifest-9", "east", "wrong-hash", BigInteger.ONE),
            part("q-83", "snapshot-42", "manifest-9", "unknown", "sha-east", BigInteger.ONE))) {
            require(rejects(IllegalArgumentException.class, () -> ExactSum.exactSum("q-83", "snapshot-42", "manifest-9", manifest, List.of(west, bad))), "identity mismatch rejected");
        }
        require(ExactSum.exactSum("empty-query", "snapshot-42", "manifest-10", Map.of(), List.of()).equals(BigInteger.ZERO), "trusted empty manifest has exact zero");
        System.out.println("SumProbe: " + checks + " independent checks passed");
    }
}
