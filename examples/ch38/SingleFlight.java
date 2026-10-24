import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

/** One process only. Callers receive dependent futures and cannot cancel the leader. */
public final class SingleFlight<T> {
    // BEGIN flight
    private final ConcurrentHashMap<String, CompletableFuture<T>> calls =
        new ConcurrentHashMap<>();
    private final Executor executor;
    public SingleFlight(Executor executor) { this.executor = executor; }

    public CompletableFuture<T> join(String key, Supplier<T> fetch) {
        var leader = new CompletableFuture<T>();
        var existing = calls.putIfAbsent(key, leader);
        var shared = existing == null ? leader : existing;
        if (existing == null) {
            try {
                executor.execute(() -> {
                    try { leader.complete(fetch.get()); }
                    catch (Throwable error) { leader.completeExceptionally(error); }
                    finally { calls.remove(key, leader); }
                });
            } catch (RuntimeException rejected) {
                leader.completeExceptionally(rejected);
                calls.remove(key, leader);
            }
        }
        return shared.thenApply(value -> value); // private waiter future
    }
    // END flight

    static int checks;
    static void check(boolean ok, String why) {
        if (!ok) throw new AssertionError(why); checks++;
    }
    public static void main(String[] args) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            var group = new SingleFlight<String>(pool);
            var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
            var n = new AtomicInteger();
            Supplier<String> fetch = () -> {
                n.incrementAndGet(); entered.countDown();
                try { release.await(); } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt(); throw new CompletionException(ex);
                }
                return "v2";
            };
            var a = group.join("sku|en", fetch); entered.await();
            var b = group.join("sku|en", fetch);
            a.orTimeout(10, TimeUnit.MILLISECONDS);
            try { a.get(); throw new AssertionError("timeout missing"); }
            catch (ExecutionException ex) { check(ex.getCause() instanceof TimeoutException,"waiter times out"); }
            check(!b.isDone(), "waiter timeout does not cancel leader");
            var peers = new java.util.ArrayList<CompletableFuture<String>>();
            for (int i=0;i<30;i++) peers.add(group.join("sku|en",fetch));
            check(n.get()==1,"one leader within Group");
            var otherProcess = new SingleFlight<String>(pool);
            var c = otherProcess.join("sku|en", () -> "separate leader");
            check(c.get().equals("separate leader"),"another Group has another leader");
            release.countDown(); check(b.get().equals("v2"),"surviving waiter succeeds");
            for(var f:peers)check(f.get().equals("v2"),"shared result");
            var failure = group.join("broken", () -> { throw new IllegalStateException("Store failed"); });
            try { failure.get();throw new AssertionError("missing failure"); }
            catch (ExecutionException ex) { check(ex.getCause() instanceof IllegalStateException,"failure propagated"); }
            var rejected = new SingleFlight<String>(r -> { throw new RejectedExecutionException(); });
            check(rejected.join("x", () -> "x").isCompletedExceptionally(),"rejection does not strand waiter");
            // Deterministic cancellation: the queued loader cannot finish first.
            var queued = new java.util.ArrayDeque<Runnable>();
            var cancellationGroup = new SingleFlight<String>(queued::add);
            var cancelled = cancellationGroup.join("cancelled", () -> "value");
            var survivor = cancellationGroup.join("cancelled", () -> "duplicate");
            check(queued.size()==1,"cancellation fixture has one pending leader");
            check(cancelled.cancel(true) && cancelled.isCancelled(),"individual cancellation");
            check(!survivor.isDone(),"cancel leaves other waiter pending");
            queued.removeFirst().run();
            check(survivor.get().equals("value"),"leader completes surviving waiter");
            System.out.println("SingleFlight: " + checks + " checks passed");
        } finally { pool.shutdownNow(); }
    }
}
