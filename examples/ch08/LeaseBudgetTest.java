public final class LeaseBudgetTest {
    static int checks;
    static void check(boolean b) { checks++; if (!b) throw new AssertionError(checks); }
    public static void main(String[] args) {
        long ms=1_000_000L;
        LeaseBudget a=LeaseBudget.acquired(0,100*ms,true);
        check(a.usable(100*ms)); check(!a.usable(9800*ms));
        check(!a.usable(100*ms)); // artificial time reversal cannot revive LOST
        check(!LeaseBudget.acquired(0,100*ms,false).usable(200*ms));
        check(!LeaseBudget.acquired(0,9800*ms,true).usable(9800*ms));
        LeaseBudget b=LeaseBudget.acquired(0,100*ms,true);
        check(b.beginRenewal(3000*ms)); check(!b.beginRenewal(3100*ms));
        check(b.finishRenewal(3100*ms,true));
        check(b.usable(12799*ms)); check(!b.usable(12800*ms)); // sent+9800
        LeaseBudget c=LeaseBudget.acquired(0,100*ms,true);
        check(c.beginRenewal(9000*ms)); check(!c.finishRenewal(9800*ms,true));
        check(!c.beginRenewal(9900*ms));
        LeaseBudget d=LeaseBudget.acquired(0,100*ms,true);
        check(d.beginRenewal(1000*ms)); check(!d.finishRenewal(1100*ms,false));
        check(!d.usable(1200*ms));
        LeaseBudget e=LeaseBudget.acquired(0,100*ms,true);
        check(e.beginRenewal(1000*ms)); e.abandon();
        check(!e.finishRenewal(1100*ms,true));
        System.out.println("PASS " + checks + " local-budget checks; no distributed guarantee tested.");
    }
}
