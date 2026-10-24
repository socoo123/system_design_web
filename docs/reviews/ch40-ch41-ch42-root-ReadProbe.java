/** New inputs for the actual Ch41 routing policy. No replica is simulated. */
class RootReadProbe {
    private static int checks;
    private static void check(boolean ok, String claim) {
        checks++;
        if (!ok) throw new AssertionError(claim);
    }
    public static void main(String[] args) {
        var token = new ReadGate.Token("inventory-B", "history-22", 701);
        var ready = new ReadGate.FreshView("inventory-B", "history-22", 701, true);
        var behind = new ReadGate.FreshView("inventory-B", "history-22", 700, true);
        var wrongCluster = new ReadGate.FreshView("inventory-A", "history-22", 9999, true);
        var wrongHistory = new ReadGate.FreshView("inventory-B", "history-23", 9999, true);
        var old = new ReadGate.FreshView("inventory-B", "history-22", 9999, false);
        check(ReadGate.covers(token, ready), "exact prefix includes commit");
        check(!ReadGate.covers(token, behind), "one-position lag is not visible");
        check(!ReadGate.covers(token, wrongCluster), "cross-cluster numeric position meaningless");
        check(!ReadGate.covers(token, wrongHistory), "fork's larger number is not inclusion");
        check(!ReadGate.covers(token, old), "newly opened pinned snapshot required");
        check(ReadGate.choose(token, behind, ready, true, true) == ReadGate.Route.WAIT,
              "positive wait budget preserves selected read contract");
        check(ReadGate.choose(token, behind, ready, false, true) == ReadGate.Route.PRIMARY,
              "eligible admitted primary after wait budget");
        check(ReadGate.choose(token, behind, ready, false, false) == ReadGate.Route.UNAVAILABLE,
              "primary fallback cannot bypass admission");
        check(ReadGate.choose(token, wrongHistory, wrongHistory, false, true) == ReadGate.Route.UNAVAILABLE,
              "timeout does not permit cross-history reads");
        check(ReadGate.choose(token, old, old, false, true) == ReadGate.Route.UNAVAILABLE,
              "both old snapshots remain ineligible");
        check(ReadGate.choose(token, null, ready, false, true) == ReadGate.Route.PRIMARY,
              "missing replica uses eligible primary");
        check(ReadGate.choose(token, null, null, false, true) == ReadGate.Route.UNAVAILABLE,
              "missing all views returns explicit unavailable");
        System.out.println("RootReadProbe PASS " + checks + " independent assertions; eligibility only.");
    }
}
