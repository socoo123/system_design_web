public final class ReadGateProbe {
    private static void expect(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        var token = new ReadGate.Token("orders", "T", 1042);
        var caughtUp = new ReadGate.FreshView("orders", "T", 1042, true);
        var stale = new ReadGate.FreshView("orders", "T", 1041, true);
        var fork = new ReadGate.FreshView("orders", "U", 9999, true);
        var oldSnapshot = new ReadGate.FreshView("orders", "T", 1020, false);
        expect(ReadGate.choose(token, caughtUp, null, true, false) == ReadGate.Route.REPLICA,
                "normal fresh view includes the commit");
        expect(ReadGate.choose(token, stale, caughtUp, true, true) == ReadGate.Route.WAIT,
                "receive/flush do not advance snapshot visibility");
        expect(ReadGate.choose(token, oldSnapshot, caughtUp, false, true) == ReadGate.Route.PRIMARY,
                "old Repeatable Read snapshot does not refresh");
        expect(ReadGate.choose(token, fork, fork, false, true) == ReadGate.Route.UNAVAILABLE,
                "larger position in a fork is ineligible, including a new primary");
        expect(ReadGate.choose(token, stale, caughtUp, false, false) == ReadGate.Route.UNAVAILABLE,
                "fallback still requires admission");
        expect(!ReadGate.covers(token, new ReadGate.FreshView("billing", "T", 9999, true)),
                "different cluster cannot satisfy the token");
        expect(!ReadGate.covers(token, new ReadGate.FreshView("orders", "T", 1042, false)),
                "the conservative contract rejects reuse of an old transaction");
        System.out.println("ReadGate: fresh view, stale/fork, snapshot and admission checks passed");
    }
}
