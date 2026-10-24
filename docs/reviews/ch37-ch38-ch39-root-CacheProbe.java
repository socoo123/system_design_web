import java.util.ArrayDeque;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

// New deterministic schedules against the actual Ch38 classes. No HTTP server.
class CacheProbe {
    static int checks;
    static void require(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    public static void main(String[] args) {
        var value = AgeBudget.Evidence.primary(28, 800_000, false);
        require(value.hardExpiresMs() == 820_000, "positive hard deadline");
        require(value.sharedSeconds(806_001) == 10, "cap at ten");
        require(value.sharedSeconds(815_001) == 1, "floor fractional remaining time");
        require(value.sharedSeconds(816_999) == 0, "no positive shared lifetime");
        require(value.canSend(816_999), "direct send can still fit its safety margin");
        require(!value.canSend(817_000), "strict send equality rejects");
        require(value.l1Expires(816_000) == 818_000, "L1 copies original hard expiry");
        require(value.l1Expires(802_000) == 807_000, "L1 five second cap");
        require(value.hardExpiresMs() == 820_000, "neither copy renews proof");
        var absent = AgeBudget.Evidence.primary(29, 800_000, true);
        require(absent.hardExpiresMs() == 805_000, "negative deadline");
        require(absent.sharedSeconds(800_500) == 1, "negative life carries safety margins");
        require(!absent.canSend(802_000), "negative send equality rejects");
        require(!value.canSend(900_000) && value.sharedSeconds(900_000) == 0, "expired evidence cannot be revived");

        var jobs = new ArrayDeque<Runnable>();
        var calls = new AtomicInteger();
        var group = new SingleFlight<String>(jobs::add);
        var cancelled = group.join("t1|item|en|gzip", () -> { calls.incrementAndGet(); return "first"; });
        var timedOut = group.join("t1|item|en|gzip", () -> { throw new AssertionError("second loader ran"); });
        var survivor = group.join("t1|item|en|gzip", () -> { throw new AssertionError("third loader ran"); });
        cancelled.cancel(true);
        timedOut.orTimeout(10, TimeUnit.MILLISECONDS);
        try { timedOut.join(); throw new AssertionError("waiter did not time out"); }
        catch (CompletionException e) { require(e.getCause() instanceof TimeoutException, "one waiter deadline"); }
        require(!survivor.isDone(), "waiter cancellation and timeout preserve shared work");
        require(jobs.size() == 1, "single actual task remains queued");
        var laterWaiter = group.join("t1|item|en|gzip", () -> { throw new AssertionError("new leader while old task queued"); });
        var french = group.join("t1|item|fr|gzip", () -> "fr");
        require(jobs.size() == 2, "representation is part of key");
        jobs.remove().run(); jobs.remove().run();
        require(calls.get() == 1 && survivor.join().equals("first"), "exactly one original loader");
        require(laterWaiter.join().equals("first") && french.join().equals("fr"), "independent waiter and representation results");
        var next = group.join("t1|item|en|gzip", () -> "next");
        require(jobs.size() == 1, "completed task removed"); jobs.remove().run();
        require(next.join().equals("next"), "next miss can start new work");
        var failed = group.join("broken", () -> { throw new IllegalArgumentException("unavailable"); });
        var failedPeer = group.join("broken", () -> "must not run"); jobs.remove().run();
        require(failed.isCompletedExceptionally() && failedPeer.isCompletedExceptionally(), "failure fans out");
        var recovered = group.join("broken", () -> "recovered"); jobs.remove().run();
        require(recovered.join().equals("recovered"), "failed work does not strand future requests");
        var reject = new AtomicBoolean(true);
        Executor executor = job -> { if (reject.get()) throw new RejectedExecutionException(); jobs.add(job); };
        var bounded = new SingleFlight<String>(executor);
        require(bounded.join("q", () -> "x").isCompletedExceptionally(), "executor rejection returned");
        reject.set(false);
        var accepted = bounded.join("q", () -> "accepted"); jobs.remove().run();
        require(accepted.join().equals("accepted"), "rejection cleans registration");
        require(jobs.isEmpty(), "all scheduled work physically finished");
        System.out.println("CacheProbe: " + checks + " independent checks passed");
    }
}
