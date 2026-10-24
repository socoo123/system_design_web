import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;

/** One namespace on one service node. Durable relay, auth and HTTP live outside. */
public final class WatchHub {
    public enum Kind { CHANGED, RESET, SYNC_REQUIRED, IDLE }
    public record Hint(Kind kind, long generation) {}
    private record Waiter(long cursor, CompletableFuture<Hint> answer) {}
    private final ArrayList<Waiter> waiters = new ArrayList<>();
    private long generation, compactedThrough;
    public WatchHub(long generation, long compactedThrough) {
        if (compactedThrough < 0 || generation < compactedThrough)
            throw new IllegalArgumentException();
        this.generation = generation; this.compactedThrough = compactedThrough;
    }

    // BEGIN page:watch
    public synchronized CompletableFuture<Hint> watch(long cursor) {
        if (cursor < 0) throw new IllegalArgumentException("negative cursor");
        var answer = new CompletableFuture<Hint>();
        waiters.add(new Waiter(cursor, answer)); // register before recheck
        recheck();                              // same monitor as relay updates
        return answer;                          // HTTP adapter awaits asynchronously
    }

    public synchronized void replay(long latest, long floor) {
        if (latest < generation || floor < compactedThrough || floor > latest)
            throw new IllegalArgumentException("replay cannot move backwards");
        generation = latest; compactedThrough = floor;
        recheck();                              // all local connection owners see it
    }

    private void recheck() {
        var ready = new ArrayList<Waiter>();
        for (Waiter w : waiters) {
            Kind kind = w.cursor() > generation ? Kind.SYNC_REQUIRED
                    : w.cursor() < compactedThrough ? Kind.RESET
                    : w.cursor() < generation ? Kind.CHANGED : null;
            if (kind != null) ready.add(w);
        }
        waiters.removeAll(ready);                // remove before completing callbacks
        for (Waiter w : ready) {
            Kind k = w.cursor() > generation ? Kind.SYNC_REQUIRED
                    : w.cursor() < compactedThrough ? Kind.RESET : Kind.CHANGED;
            w.answer().complete(new Hint(k, generation));
        }
    }
    // END page:watch

    public synchronized void idle(CompletableFuture<Hint> answer) {
        waiters.removeIf(w -> w.answer() == answer);
        answer.complete(new Hint(Kind.IDLE, generation));
    }
    public synchronized int parked() { return waiters.size(); }
}
