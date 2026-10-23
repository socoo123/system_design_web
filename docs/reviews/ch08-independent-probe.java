// Independent targeted probes, Java 17; compiles beside examples/ch08/LeaseBudget.java.
class Ch08IndependentProbe {
    static void demand(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        System.out.println("PASS " + label);
    }
    public static void main(String[] args) {
        long ms = 1_000_000L;
        LeaseBudget normal = LeaseBudget.acquired(0, 100*ms, true);
        demand(normal.beginRenewal(9000*ms), "renew dispatched before old deadline");
        demand(normal.finishRenewal(9799*ms,true), "timely renewal OK extends send-based budget");
        demand(normal.usable(18799*ms) && !normal.usable(18800*ms), "exact new deadline = 9000+9800");
        LeaseBudget late = LeaseBudget.acquired(0,100*ms,true);
        demand(late.beginRenewal(9000*ms), "late-reply scenario dispatched");
        demand(!late.finishRenewal(9800*ms,true), "OK at old deadline cannot revive lease");
        demand(!late.usable(9900*ms) && !late.beginRenewal(9900*ms), "LOST remains terminal");
        LeaseBudget abandoned = LeaseBudget.acquired(0,100*ms,true);
        abandoned.beginRenewal(1000*ms);abandoned.abandon();
        demand(!abandoned.finishRenewal(1100*ms,true), "abandoned pending renewal does not revive");
        long start = Long.MAX_VALUE-100*ms;
        LeaseBudget wrap = LeaseBudget.acquired(start,start+200*ms,true);
        demand(wrap.usable(start+300*ms), "nanoTime signed wrap handled by elapsed subtraction");
        demand(!wrap.usable(start+9800*ms), "wrapped exact deadline expires");
    }
}
