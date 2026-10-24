/** Java 17: trusted evidence timestamps, not a synchronized wall clock. */
public final class AgeBudget {
    static final long SKEW_MS = 2_000, SEND_MS = 1_000;
    // BEGIN age
    record Evidence(long version, long observedAtMs, long hardExpiresMs) {
        Evidence {
            if (version < 0 || hardExpiresMs <= observedAtMs)
                throw new IllegalArgumentException("invalid evidence");
        }
        static Evidence primary(long version, long readStartMs, boolean absent) {
            long life = absent ? 5_000 : 20_000;
            return new Evidence(version, readStartMs, readStartMs + life);
        }
        long l1Expires(long nowMs) {
            return Math.min(nowMs + 5_000, hardExpiresMs - SKEW_MS);
        }
        boolean canSend(long nowMs) {
            return nowMs + SKEW_MS + SEND_MS < hardExpiresMs;
        }
        long sharedSeconds(long nowMs) {
            long remaining = hardExpiresMs - nowMs - SKEW_MS - SEND_MS;
            return Math.max(0, Math.min(10, remaining / 1_000));
        }
    }
    // END age

    private static int checks;
    static void check(boolean ok, String name) {
        if (!ok) throw new AssertionError(name);
        checks++;
    }
    public static void main(String[] args) {
        var e = Evidence.primary(1, 100_000, false);
        check(e.hardExpiresMs() == 120_000, "fixed primary start");
        check(e.sharedSeconds(101_000) == 10, "cap shared lifetime");
        check(e.sharedSeconds(114_000) == 3, "remaining budget including send");
        check(e.sharedSeconds(116_500) == 0, "fractional second floors down");
        check(e.canSend(116_500), "uncacheable but current evidence");
        check(!e.canSend(117_000), "strict boundary fails");
        check(e.l1Expires(116_000) == 118_000, "L1 cannot restart hard age");
        check(e.l1Expires(101_000) == 106_000, "L1 upper five seconds");
        check(e.hardExpiresMs() == 120_000, "copy does not alter hard expiry");
        var absent = Evidence.primary(0, 100_000, true);
        check(absent.hardExpiresMs() == 105_000, "negative hard life");
        check(absent.sharedSeconds(101_000) == 1, "negative HTTP cap");
        check(!absent.canSend(102_000), "negative boundary");
        check(absent.canSend(101_999), "negative send window ends before two seconds");
        check(!absent.canSend(102_500), "L2 reuse window need not be HTTP send-safe");
        check(e.sharedSeconds(130_000) == 0, "expired cannot share");
        check(!e.canSend(130_000), "expired cannot send");
        System.out.println("AgeBudget: " + checks + " checks passed");
    }
}
