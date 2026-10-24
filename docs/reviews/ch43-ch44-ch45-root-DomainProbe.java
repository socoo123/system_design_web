import java.util.*;

class RootDomainProbe {
    static int checks;
    static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    static void rejects(Runnable action) {
        try { action.run(); } catch (IllegalArgumentException | IllegalStateException expected) {
            checks++; return;
        }
        throw new AssertionError("expected contract rejection");
    }
    public static void main(String[] args) {
        var lines = new ArrayList<>(List.of(
                new DomainModel.Line("book", 4, new DomainModel.Money(127, "EUR")),
                new DomainModel.Line("pen", 2, new DomainModel.Money(19, "EUR"))));
        var draft = new DomainModel.Order("tenant-extra", "order-extra", 42,
                DomainModel.State.DRAFT, lines, new DomainModel.Money(546, "EUR"), null, null);
        lines.clear();
        check(draft.lines().size() == 2, "constructor defensively copies lines");
        var edited = draft.editQuantity("pen", 7);
        check(edited.total().minor() == 641 && edited.version() == 43, "different amount and version");
        check(draft.total().minor() == 546, "prior aggregate intact");
        var pending = edited.checkout("attempt-extra");
        var fact = new DomainModel.Capture("tenant-extra", "order-extra", "pay-extra", "attempt-extra", pending.total());
        var accepted = pending.capture(fact);
        check(accepted.next().version() == 45 && accepted.events().size() == 1, "new accepted event candidate");
        check(accepted.next().capture(fact).events().isEmpty(), "same payment produces no second event");
        var closed = pending.expire();
        var late = closed.capture(fact);
        check(late.next() == closed && late.events().get(0) instanceof DomainModel.RefundRequired,
                "late capture preserves closed and proposes refund");
        var extra = accepted.next().capture(new DomainModel.Capture("tenant-extra", "order-extra", "pay-other",
                "attempt-extra", pending.total()));
        check(extra.next() == accepted.next() && extra.events().get(0) instanceof DomainModel.RefundRequired,
                "extra payment does not fulfill again");
        rejects(() -> pending.capture(new DomainModel.Capture("tenant-extra", "order-extra", "pay-extra",
                "attempt-extra", new DomainModel.Money(641, "USD"))));
        rejects(() -> pending.capture(new DomainModel.Capture("other-tenant", "order-extra", "pay-extra",
                "attempt-extra", pending.total())));
        rejects(() -> pending.capture(new DomainModel.Capture("tenant-extra", "order-extra", "pay-extra",
                "stale-attempt", pending.total())));
        rejects(() -> accepted.next().editQuantity("pen", 2));
        check(pending.state() == DomainModel.State.PENDING_PAY && pending.version() == 44,
                "failed and competing decisions do not mutate the loaded snapshot");
        System.out.println("PASS root domain probe: " + checks + " new-input invariants; persistence intentionally separate");
    }
}
