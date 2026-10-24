import java.math.BigInteger;
import java.util.*;

class Ch37IndependentExactSumProbe {
    static final List<String> checks = new ArrayList<>();
    static final Map<String,String> manifest = Map.of("west-17","hash-west-v5","east-24","hash-east-v6","returns-9","hash-returns-v2");
    static ExactSum.Part part(String f, BigInteger n) {
        return new ExactSum.Part("sales-net:USD:v3","close-2026-10-24T05","manifest-87",f,manifest.get(f),n);
    }
    static BigInteger total(List<ExactSum.Part> parts) {
        return ExactSum.exactSum("sales-net:USD:v3","close-2026-10-24T05","manifest-87",manifest,parts);
    }
    static void check(String label, boolean ok) { if(!ok)throw new AssertionError(label);checks.add(label); }
    static void rejects(String label, Class<? extends RuntimeException> kind, Runnable r) {
        try {r.run();}catch(RuntimeException e){if(!kind.isInstance(e))throw e;checks.add(label);return;}throw new AssertionError(label);
    }
    public static void main(String[] args) {
        var huge=new BigInteger("90000000000000000000000000000000000000");
        var a=part("west-17",huge);var b=part("east-24",huge.add(BigInteger.valueOf(73)));var c=part("returns-9",BigInteger.valueOf(-107));
        var expected=huge.multiply(BigInteger.TWO).subtract(BigInteger.valueOf(34));
        check("three signed fragments beyond 64-bit",total(List.of(a,b,c)).equals(expected));
        check("out-of-order duplicate retries not double counted",total(List.of(c,a,c,b,a,b)).equals(expected));
        rejects("only two of three is incomplete",IllegalStateException.class,()->total(List.of(a,b)));
        rejects("no replies for nonempty manifest is incomplete",IllegalStateException.class,()->total(List.of()));
        rejects("changed duplicate sum at same content hash",IllegalArgumentException.class,()->total(List.of(a,b,c,part("west-17",BigInteger.ZERO))));
        String[] values={"other-query","other-snapshot","other-manifest","other-fragment","other-hash"};
        for(int i=0;i<values.length;i++) {
            final int field=i;final String changed=values[i];
            var p=new ExactSum.Part(field==0?changed:c.query(),field==1?changed:c.snapshot(),field==2?changed:c.manifestVersion(),field==3?changed:c.fragment(),field==4?changed:c.contentHash(),c.sum());
            rejects("reject changed binding field "+i,IllegalArgumentException.class,()->total(List.of(a,b,p)));
        }
        rejects("unexpected extra fragment cannot hide completeness",IllegalArgumentException.class,()->total(List.of(a,b,c,new ExactSum.Part(a.query(),a.snapshot(),a.manifestVersion(),"extra","hash-extra",BigInteger.ONE))));
        check("verified empty manifest exact zero",ExactSum.exactSum("empty","immutable-empty","manifest-empty",Map.of(),List.of()).equals(BigInteger.ZERO));
        rejects("empty manifest still rejects unsolicited contribution",IllegalArgumentException.class,()->ExactSum.exactSum(a.query(),a.snapshot(),a.manifestVersion(),Map.of(),List.of(a)));
        rejects("null manifest hash rejected",NullPointerException.class,()->{var broken=new HashMap<String,String>();broken.put("x",null);ExactSum.exactSum("q","s","m",broken,List.of());});
        // Deliberately violate external trust to document the coordinator's actual limit.
        var dishonest=part("west-17",BigInteger.ZERO);
        check("boundary: a hash does not prove worker arithmetic",total(List.of(dishonest,b,c)).equals(huge.subtract(BigInteger.valueOf(34))));
        check("boundary: an incomplete trusted manifest cannot be discovered locally",ExactSum.exactSum(a.query(),a.snapshot(),a.manifestVersion(),Map.of(a.fragment(),a.contentHash()),List.of(a)).equals(huge));
        System.out.println("{\"passed\":true,\"checks\":"+checks.size()+",\"cases\":[\""+String.join("\",\"",checks)+"\"]}");
    }
}
