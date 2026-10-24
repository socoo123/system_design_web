import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Java 17, standard library only. Immutable candidates, not a persistence layer. */
public final class DomainModel {
    enum State { DRAFT, PENDING_PAY, PAID, CLOSED }
    enum Outcome { ACCEPTED, ALREADY_ACCEPTED, REFUND_REQUIRED }

    record Money(long minor, String currency) {
        Money {
            if (minor < 0 || currency == null || !currency.matches("[A-Z]{3}"))
                throw new IllegalArgumentException("MONEY");
        }
        Money plus(Money other) {
            if (!currency.equals(other.currency)) throw new IllegalArgumentException("CURRENCY");
            return new Money(Math.addExact(minor, other.minor), currency);
        }
        Money times(int quantity) {
            if (quantity <= 0) throw new IllegalArgumentException("QUANTITY");
            return new Money(Math.multiplyExact(minor, quantity), currency);
        }
    }
    record Line(String sku, int quantity, Money unitPrice) {
        Line {
            text(sku); Objects.requireNonNull(unitPrice);
            if (quantity <= 0) throw new IllegalArgumentException("QUANTITY");
            unitPrice.times(quantity);
        }
    }
    record Capture(String tenant, String orderId, String paymentId, String attempt, Money amount) {
        Capture {
            text(tenant); text(orderId); text(paymentId); text(attempt);
            Objects.requireNonNull(amount);
        }
    }
    sealed interface DomainEvent permits OrderPaid, RefundRequired {}
    record OrderPaid(String tenant, String orderId, String paymentId, long version) implements DomainEvent {}
    record RefundRequired(String tenant, String orderId, String paymentId, Money amount, String reason) implements DomainEvent {}
    record Decision(Order next, Outcome outcome, List<DomainEvent> events) {
        Decision { Objects.requireNonNull(next); events = List.copyOf(events); }
    }

    record Order(String tenant, String id, long version, State state, List<Line> lines,
                 Money total, String attempt, String acceptedPayment) {
        Order {
            text(tenant); text(id); Objects.requireNonNull(state); Objects.requireNonNull(total);
            if (version < 0) throw new IllegalArgumentException("VERSION");
            lines = List.copyOf(lines);
            if (lines.isEmpty() || lines.stream().map(Line::sku).distinct().count() != lines.size())
                throw new IllegalArgumentException("LINES");
            if (!sum(lines, total.currency).equals(total)) throw new IllegalArgumentException("TOTAL");
            if (state != State.DRAFT) text(attempt);
            if (state == State.DRAFT && attempt != null) throw new IllegalArgumentException("ATTEMPT");
            if (state == State.PAID) text(acceptedPayment);
            if (state != State.PAID && acceptedPayment != null) throw new IllegalArgumentException("PAYMENT");
        }
        // BEGIN edit
        Order editQuantity(String sku, int quantity) {
            if (state != State.DRAFT) throw new IllegalStateException("FROZEN");
            if (quantity <= 0) throw new IllegalArgumentException("QUANTITY");
            List<Line> changed = new ArrayList<>(lines);
            int index = -1;
            for (int i = 0; i < lines.size(); i++)
                if (lines.get(i).sku.equals(sku)) index = i;
            if (index < 0) throw new IllegalArgumentException("SKU");
            Line old = lines.get(index);
            changed.set(index, new Line(old.sku, quantity, old.unitPrice));
            Money nextTotal = sum(changed, total.currency); // exact integer arithmetic
            return new Order(tenant, id, Math.incrementExact(version), State.DRAFT,
                    changed, nextTotal, null, null); // candidate, not a committed result
        }
        // END edit
        Order checkout(String nextAttempt) {
            if (state != State.DRAFT) throw new IllegalStateException("STATE");
            text(nextAttempt);
            return new Order(tenant, id, Math.incrementExact(version), State.PENDING_PAY,
                    lines, total, nextAttempt, null);
        }
        Order expire() {
            if (state != State.PENDING_PAY) throw new IllegalStateException("STATE");
            return new Order(tenant, id, Math.incrementExact(version), State.CLOSED,
                    lines, total, attempt, null);
        }
        // BEGIN capture
        Decision capture(Capture fact) {
            // Adapter already authenticated source and verified Pay's attempt binding.
            if (!tenant.equals(fact.tenant) || !id.equals(fact.orderId)
                    || !Objects.equals(attempt, fact.attempt) || !total.equals(fact.amount))
                throw new IllegalArgumentException("CAPTURE_CONTRACT");
            if (state == State.DRAFT) throw new IllegalStateException("NOT_CHECKED_OUT");
            if (state == State.PAID && acceptedPayment.equals(fact.paymentId))
                return new Decision(this, Outcome.ALREADY_ACCEPTED, List.of());
            if (state == State.CLOSED || state == State.PAID) {
                var event = new RefundRequired(tenant, id, fact.paymentId, fact.amount,
                        state == State.CLOSED ? "LATE_CAPTURE" : "EXTRA_CAPTURE");
                return new Decision(this, Outcome.REFUND_REQUIRED, List.of(event));
            }
            Order paid = new Order(tenant, id, Math.incrementExact(version), State.PAID,
                    lines, total, attempt, fact.paymentId);
            return new Decision(paid, Outcome.ACCEPTED,
                    List.of(new OrderPaid(tenant, id, fact.paymentId, paid.version)));
        }
        // END capture
    }
    static Money sum(List<Line> lines, String currency) {
        Money result = new Money(0, currency);
        for (Line line : lines) result = result.plus(line.unitPrice.times(line.quantity));
        return result;
    }
    static void text(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("IDENTITY");
    }
    static Order draft() {
        return new Order("t1", "o42", 7, State.DRAFT,
                List.of(new Line("sku1", 2, new Money(2999, "USD")),
                        new Line("sku2", 1, new Money(2002, "USD"))),
                new Money(8000, "USD"), null, null);
    }
    static int checks;
    static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
    static void rejects(Class<? extends Throwable> type, Runnable action, String label) {
        try { action.run(); } catch (Throwable failure) {
            check(type.isInstance(failure), label + ": " + failure);
            return;
        }
        throw new AssertionError("Expected rejection: " + label);
    }
    public static void main(String[] args) {
        Order original = draft(), edited = original.editQuantity("sku1", 3);
        check(original.total.minor == 8000 && original.version == 7, "original unchanged");
        check(edited.total.minor == 10999 && edited.version == 8, "exact edit and version");
        check(original.lines.get(0).quantity == 2, "snapshot remains immutable");
        rejects(IllegalArgumentException.class, () -> original.editQuantity("sku1", 0), "zero quantity");
        rejects(IllegalArgumentException.class, () -> original.editQuantity("sku1", -1), "negative quantity");
        rejects(IllegalArgumentException.class, () -> original.editQuantity("missing", 3), "unknown SKU");
        rejects(UnsupportedOperationException.class, () -> edited.lines.clear(), "lines cannot escape");
        rejects(IllegalArgumentException.class, () -> new Money(-1, "USD"), "negative money");
        rejects(IllegalArgumentException.class, () -> new Money(1, "usd"), "currency format");
        rejects(IllegalArgumentException.class, () -> new Money(1, "USD").plus(new Money(1, "EUR")), "currency mismatch");
        rejects(ArithmeticException.class, () -> new Money(Long.MAX_VALUE, "USD").times(2), "multiply overflow");
        rejects(ArithmeticException.class, () -> new Money(Long.MAX_VALUE, "USD").plus(new Money(1, "USD")), "sum overflow");
        rejects(IllegalArgumentException.class, () -> new Order("t1", "o42", 7, State.DRAFT,
                original.lines, new Money(8001, "USD"), null, null), "invalid stored total");
        rejects(IllegalArgumentException.class, () -> new Order("t1", "o42", 7, State.DRAFT,
                List.of(original.lines.get(0), original.lines.get(0)), new Money(11996, "USD"), null, null), "duplicate SKU");
        Order large = new Order("t1", "o-max", 7, State.DRAFT,
                List.of(new Line("sku", 1, new Money(Long.MAX_VALUE, "USD"))),
                new Money(Long.MAX_VALUE, "USD"), null, null);
        rejects(ArithmeticException.class, () -> large.editQuantity("sku", 2), "failed edit leaves no partial change");
        check(large.lines.get(0).quantity == 1 && large.total.minor == Long.MAX_VALUE, "overflow original intact");
        Order pending = edited.checkout("a9");
        check(pending.version == 9 && pending.state == State.PENDING_PAY, "checkout freezes v9");
        rejects(IllegalStateException.class, () -> pending.editQuantity("sku1", 4), "edit frozen order");
        rejects(IllegalStateException.class, () -> pending.checkout("a10"), "double checkout");
        Capture fact = new Capture("t1", "o42", "p9", "a9", new Money(10999, "USD"));
        Decision accepted = pending.capture(fact);
        check(accepted.outcome == Outcome.ACCEPTED && accepted.next.version == 10, "capture accepted");
        check(accepted.next.state == State.PAID && accepted.next.acceptedPayment.equals("p9"), "payment recorded");
        check(accepted.events.size() == 1 && accepted.events.get(0) instanceof OrderPaid, "domain event candidate");
        check(pending.state == State.PENDING_PAY, "decision is immutable");
        Decision duplicate = accepted.next.capture(fact);
        check(duplicate.outcome == Outcome.ALREADY_ACCEPTED && duplicate.events.isEmpty(), "same accepted payment");
        rejects(IllegalStateException.class, () -> accepted.next.expire(), "cannot expire accepted order");
        Order closed = pending.expire();
        Decision late = closed.capture(fact);
        check(closed.state == State.CLOSED && closed.version == 10, "expiry winner");
        check(late.next == closed && late.outcome == Outcome.REFUND_REQUIRED, "no resurrection");
        check(late.events.get(0) instanceof RefundRequired r && r.reason.equals("LATE_CAPTURE"), "late refund candidate");
        Decision extra = accepted.next.capture(new Capture("t1", "o42", "p10", "a9", fact.amount));
        check(extra.next == accepted.next && extra.events.get(0) instanceof RefundRequired r
                && r.reason.equals("EXTRA_CAPTURE"), "extra capture refund candidate");
        for (Capture bad : List.of(new Capture("t2", "o42", "p9", "a9", fact.amount),
                new Capture("t1", "other", "p9", "a9", fact.amount),
                new Capture("t1", "o42", "p9", "old", fact.amount),
                new Capture("t1", "o42", "p9", "a9", new Money(10998, "USD")),
                new Capture("t1", "o42", "p9", "a9", new Money(10999, "EUR"))))
            rejects(IllegalArgumentException.class, () -> pending.capture(bad), "capture contract");
        check(pending.version == 9 && pending.state == State.PENDING_PAY, "failed decisions leave candidate intact");
        rejects(ArithmeticException.class, () -> new Order("t1", "o42", Long.MAX_VALUE,
                State.DRAFT, original.lines, original.total, null, null).editQuantity("sku1", 3), "version overflow");
        System.out.println("{\"passed\":true,\"checks\":" + checks + ",\"initial\":8000,\"edited\":10999,\"pendingVersion\":9}");
    }
}
