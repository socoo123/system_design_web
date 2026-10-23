import java.math.BigInteger;

/** Java 17+, standard library only. Arithmetic model, not a load test. */
public final class CapacityEstimate {
    // BEGIN PAGE
    // dailyWork is cost-normalized work units, not arbitrary mixed QPS.
    static int instances(long dailyWork, int peakFactor, long unitQps,
                         int utilizationPercent, int failures) {
        if (dailyWork < 0 || peakFactor < 1 || unitQps <= 0
                || utilizationPercent < 1 || utilizationPercent > 100
                || failures < 0) {
            throw new IllegalArgumentException("invalid capacity assumption");
        }
        if (dailyWork == 0) return 0; // no minimum warm pool in this model
        BigInteger numerator = BigInteger.valueOf(dailyWork)
                .multiply(BigInteger.valueOf(peakFactor))
                .multiply(BigInteger.valueOf(100));
        BigInteger denominator = BigInteger.valueOf(86_400)
                .multiply(BigInteger.valueOf(unitQps))
                .multiply(BigInteger.valueOf(utilizationPercent));
        BigInteger[] qr = numerator.divideAndRemainder(denominator);
        BigInteger survivors = qr[0].add(qr[1].signum() == 0
                ? BigInteger.ZERO : BigInteger.ONE); // exact ceiling
        return survivors.add(BigInteger.valueOf(failures)).intValueExact();
    }
    // END PAGE

    static void expect(int expected, int actual) {
        if (expected != actual) throw new AssertionError(expected + " != " + actual);
    }
    static void rejects(Class<? extends RuntimeException> type, Runnable action) {
        try { action.run(); } catch (RuntimeException e) {
            if (type.isInstance(e)) return;
            throw e;
        }
        throw new AssertionError("expected " + type.getSimpleName());
    }
    public static void main(String[] args) {
        long daily = Math.addExact(200_000_000L, 10_000_000L); // equal cost
        expect(13, instances(daily, 3, 1_000, 60, 0));
        expect(14, instances(daily, 3, 1_000, 60, 1));
        expect(12, instances(200_000_000, 3, 1_000, 60, 0));
        expect(13, instances(200_000_000, 3, 1_000, 60, 1));
        expect(10, instances(172_800_000, 3, 1_000, 60, 0)); // exactly 6,000/s
        expect(11, instances(172_800_001, 3, 1_000, 60, 0)); // just over boundary
        expect(11, instances(172_800_000, 3, 1_000, 60, 1));
        expect(20, instances(100_000_000, 10, 1_000, 60, 0));
        expect(21, instances(100_000_000, 10, 1_000, 60, 1));
        expect(0, instances(0, 3, 1_000, 60, 1));
        rejects(IllegalArgumentException.class, () -> instances(-1, 3, 1000, 60, 1));
        rejects(IllegalArgumentException.class, () -> instances(1, 0, 1000, 60, 1));
        rejects(IllegalArgumentException.class, () -> instances(1, 3, 0, 60, 1));
        rejects(IllegalArgumentException.class, () -> instances(1, 3, 1000, 0, 1));
        rejects(IllegalArgumentException.class, () -> instances(1, 3, 1000, 101, 1));
        rejects(IllegalArgumentException.class, () -> instances(1, 3, 1000, 60, -1));
        rejects(ArithmeticException.class, () -> instances(Long.MAX_VALUE, Integer.MAX_VALUE, 1, 1, 1));
        double peak = daily * 3.0 / 86_400;
        if (12 * 600 >= peak || 13 * 600 < peak) throw new AssertionError("N-1 counterexample");
        System.out.println("PASS: 10 valid cases, 7 rejected inputs, N-1 counterexample");
        System.out.printf("Feed peak=%.6f; normal=13; N-1=14; 13 deployed after failure=7200 < peak%n", peak);
    }
}
