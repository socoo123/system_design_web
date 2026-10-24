/** Java 17, dependency-free pure validation; no storage or clock synchronization. */
public final class LocationGate {
    public record Point(long capturedAtMs, double accuracyM, double lat, double lon) {}
    public static boolean fresh(long nowMs, Point p, boolean boundedClock) {
        if (!boundedClock || p == null || nowMs < 0 || p.capturedAtMs() < 0
                || !Double.isFinite(p.accuracyM()) || p.accuracyM() < 0 || p.accuracyM() > 50
                || !Double.isFinite(p.lat()) || Math.abs(p.lat()) > 90
                || !Double.isFinite(p.lon()) || Math.abs(p.lon()) > 180) return false;
        try {
            long delta = Math.subtractExact(nowMs, p.capturedAtMs());
            // Trusted relative clock error <= 5 s. True capture-age upper bound <= 30 s.
            return delta >= -5_000 && delta <= 25_000;
        } catch (ArithmeticException invalidTime) {
            return false;
        }
    }
    public static void main(String[] args) {
        if (!fresh(100_000, new Point(75_000, 50, 31, 121), true)
                || fresh(100_000, new Point(74_999, 50, 31, 121), true)
                || fresh(100_000, new Point(105_001, 5, 31, 121), true)
                || fresh(100_000, new Point(100_000, Double.NaN, 31, 121), true)
                || fresh(100_000, new Point(100_000, 5, 31, 121), false))
            throw new AssertionError("freshness boundary failed");
        System.out.println("LocationGate: normal/stale/future/NaN/unbounded checks passed");
    }
}
