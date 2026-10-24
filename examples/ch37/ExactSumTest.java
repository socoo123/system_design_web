import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class ExactSumTest {
    private static final List<String> checks = new ArrayList<>();
    private static ExactSum.Part part(String fragment, BigInteger sum) {
        return new ExactSum.Part("q1", "snap1", "manifest1", fragment, "hash-"+fragment, sum);
    }
    private static BigInteger sum(List<ExactSum.Part> parts) {
        return ExactSum.exactSum("q1", "snap1", "manifest1", Map.of("a", "hash-a", "b", "hash-b"), parts);
    }
    private static void check(String name, boolean condition) {
        if (!condition) throw new AssertionError(name);
        checks.add(name);
    }
    private static void rejects(String name, Class<? extends RuntimeException> expected, Runnable run) {
        try { run.run(); }
        catch (RuntimeException failure) {
            if (!expected.isInstance(failure)) throw failure;
            checks.add(name); return;
        }
        throw new AssertionError(name+": accepted");
    }
    public static void main(String[] args) {
        var a=part("a", BigInteger.valueOf(100)); var b=part("b", BigInteger.valueOf(200));
        check("normal two fragment sum", sum(List.of(a,b)).equals(BigInteger.valueOf(300)));
        check("reordered replies", sum(List.of(b,a)).equals(BigInteger.valueOf(300)));
        check("identical retry deduped", sum(List.of(a,a,b,b)).equals(BigInteger.valueOf(300)));
        rejects("missing fragment incomplete", IllegalStateException.class, ()->sum(List.of(a)));
        rejects("all replies missing incomplete", IllegalStateException.class, ()->sum(List.of()));
        rejects("conflicting sum same hash", IllegalArgumentException.class, ()->sum(List.of(a,part("a",BigInteger.ONE),b)));
        rejects("unknown fragment", IllegalArgumentException.class, ()->sum(List.of(a,b,part("c",BigInteger.ONE))));
        rejects("wrong query", IllegalArgumentException.class, ()->sum(List.of(a,new ExactSum.Part("q2","snap1","manifest1","b","hash-b",BigInteger.ONE))));
        rejects("wrong snapshot", IllegalArgumentException.class, ()->sum(List.of(a,new ExactSum.Part("q1","snap2","manifest1","b","hash-b",BigInteger.ONE))));
        rejects("wrong manifest version", IllegalArgumentException.class, ()->sum(List.of(a,new ExactSum.Part("q1","snap1","manifest2","b","hash-b",BigInteger.ONE))));
        rejects("wrong fragment content hash", IllegalArgumentException.class, ()->sum(List.of(a,new ExactSum.Part("q1","snap1","manifest1","b","other",BigInteger.ONE))));
        rejects("changed manifest expected hash", IllegalArgumentException.class, ()->ExactSum.exactSum("q1","snap1","manifest1",Map.of("a","hash-a","b","new"),List.of(a,b)));
        var max=BigInteger.valueOf(Long.MAX_VALUE);
        check("no long overflow", sum(List.of(part("a",max),part("b",max))).equals(max.multiply(BigInteger.TWO)));
        check("signed amounts preserve refunds", sum(List.of(part("a",BigInteger.valueOf(-100)),b)).equals(BigInteger.valueOf(100)));
        check("verified empty dataset", ExactSum.exactSum("empty","snap1","empty-manifest",Map.of(),List.of()).equals(BigInteger.ZERO));
        rejects("null sum rejected", NullPointerException.class, ()->part("a",null));
        System.out.println("{\"passed\":true,\"checks\":"+checks.size()+",\"cases\":[\""+String.join("\",\"",checks)+"\"]}");
    }
}
