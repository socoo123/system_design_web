class Ch41IndependentReadGate {
    private static int checks;
    private static void expect(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    public static void main(String[] args) {
        var token = new ReadGate.Token("billing-east", "branch-44", 987654);
        var ready = new ReadGate.FreshView("billing-east", "branch-44", 987654, true);
        var behind = new ReadGate.FreshView("billing-east", "branch-44", 987653, true);
        var fakeFresh = new ReadGate.FreshView("billing-east", "branch-44", Long.MAX_VALUE, false);
        var other = new ReadGate.FreshView("billing-west", "branch-44", Long.MAX_VALUE, true);
        var fork = new ReadGate.FreshView("billing-east", "branch-45", Long.MAX_VALUE, true);
        expect(ReadGate.choose(token, ready, null, false, false) == ReadGate.Route.REPLICA,
               "eligible exact-prefix replica does not need primary admission");
        expect(ReadGate.choose(token, behind, ready, true, true) == ReadGate.Route.WAIT,
               "remaining replica budget retains WAIT even with a ready primary");
        expect(ReadGate.choose(token, fakeFresh, ready, false, true) == ReadGate.Route.PRIMARY,
               "old transaction with huge position cannot pass as a new snapshot");
        expect(ReadGate.choose(token, fork, fork, false, true) == ReadGate.Route.UNAVAILABLE,
               "promoted fork does not recover a lost acknowledged token by numeric magnitude");
        expect(ReadGate.choose(token, other, ready, false, false) == ReadGate.Route.UNAVAILABLE,
               "different cluster plus denied primary cannot produce a stale success");
        expect(ReadGate.choose(token, null, ready, false, true) == ReadGate.Route.PRIMARY,
               "missing replica falls back only to a covering admitted primary");
        expect(ReadGate.choose(token, null, behind, false, true) == ReadGate.Route.UNAVAILABLE,
               "primary role alone does not prove inclusion");
        var max = new ReadGate.Token("c", "h", Long.MAX_VALUE);
        expect(ReadGate.covers(max, new ReadGate.FreshView("c", "h", Long.MAX_VALUE, true)),
               "long boundary compares directly without subtract-overflow");
        expect(!ReadGate.covers(max, new ReadGate.FreshView("c", "h", Long.MAX_VALUE - 1, true)),
               "one position short at long boundary remains ineligible");
        expect(ReadGate.covers(new ReadGate.Token("c", "h", 0), new ReadGate.FreshView("c", "h", 0, true)),
               "zero position is a valid initial prefix");
        System.out.println("Independent ReadGate: " + checks + " new fixture assertions passed");
    }
}
