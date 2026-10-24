import java.util.Objects;

/** Eligibility only. FreshView is a trusted, pinned engine snapshot. */
public final class ReadGate {
    public record Token(String cluster, String history, long commitPosition) {
        public Token {
            Objects.requireNonNull(cluster); Objects.requireNonNull(history);
            if (commitPosition < 0) throw new IllegalArgumentException("position");
        }
    }
    public record FreshView(String cluster, String history,
                            long visiblePrefix, boolean newlyOpened) {}
    public enum Route { REPLICA, WAIT, PRIMARY, UNAVAILABLE }

    public static boolean covers(Token token, FreshView view) {
        return view != null && view.newlyOpened()
            && token.cluster().equals(view.cluster())
            && token.history().equals(view.history())
            && view.visiblePrefix() >= token.commitPosition();
    }

    public static Route choose(Token token, FreshView replica, FreshView primary,
                               boolean waitBudgetLeft, boolean primaryAdmitted) {
        Objects.requireNonNull(token);
        if (covers(token, replica)) return Route.REPLICA;
        if (waitBudgetLeft) return Route.WAIT;
        if (primaryAdmitted && covers(token, primary)) return Route.PRIMARY;
        return Route.UNAVAILABLE;
    }
}
