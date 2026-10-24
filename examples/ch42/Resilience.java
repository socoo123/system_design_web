import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Java 17, standard library only. Local lifecycle examples, not a Kafka client. */
public final class Resilience {
    // BEGIN prefix
    static final class BatchProgress {
        final long generation, batchNext;
        final long[] fetched;
        final boolean[] done;
        int prefix;
        boolean owned = true;
        BatchProgress(long generation, long[] fetched, long batchNext) {
            if (fetched.length == 0) throw new IllegalArgumentException("empty");
            this.generation = generation;
            this.fetched = fetched.clone();
            this.batchNext = batchNext;
            this.done = new boolean[fetched.length];
            for (int i = 1; i < fetched.length; i++)
                if (fetched[i] <= fetched[i - 1]) throw new IllegalArgumentException("order");
            if (batchNext <= fetched[fetched.length - 1]) throw new IllegalArgumentException("next");
        }
        void complete(long ticketGeneration, int index) {
            if (!owned || ticketGeneration != generation) return;
            done[index] = true;
            while (prefix < done.length && done[prefix]) prefix++;
        }
        OptionalLong safeNext() {
            if (!owned || prefix == 0) return OptionalLong.empty();
            return OptionalLong.of(prefix == fetched.length ? batchNext : fetched[prefix]);
        }
        void revoke() { owned = false; }
    }
    // END prefix

    static final class IoGate implements AutoCloseable {
        final Semaphore permits;
        final ThreadPoolExecutor workers;
        IoGate(int capacity) {
            this(capacity, Executors.defaultThreadFactory());
        }
        IoGate(int capacity, ThreadFactory factory) {
            permits = new Semaphore(capacity);
            workers = new ThreadPoolExecutor(capacity, capacity, 0, TimeUnit.SECONDS,
                    new SynchronousQueue<>(), factory, new ThreadPoolExecutor.AbortPolicy());
        }
        // BEGIN io
        CompletionStage<String> call(Callable<String> actualIo, long deadlineNanos) {
            if (deadlineNanos - System.nanoTime() <= 0)
                return CompletableFuture.failedFuture(new TimeoutException());
            if (!permits.tryAcquire())
                return CompletableFuture.failedFuture(new RejectedExecutionException("full"));
            var reply = new CompletableFuture<String>();
            try {
                workers.execute(() -> {
                    try {
                        if (reply.isDone() || deadlineNanos - System.nanoTime() <= 0) {
                            reply.completeExceptionally(new TimeoutException());
                            return; // scheduled too late: do not start new I/O
                        }
                        // This synchronous adapter returns only after LOCAL I/O ends.
                        reply.complete(actualIo.call());
                    } catch (Exception failure) {
                        reply.completeExceptionally(failure);
                    } finally {
                        permits.release(); // worker exit, never caller timeout
                    }
                });
            } catch (RejectedExecutionException rejected) {
                permits.release(); // no worker started
                reply.completeExceptionally(rejected);
            }
            long left = Math.max(0, deadlineNanos - System.nanoTime());
            return reply.orTimeout(left, TimeUnit.NANOSECONDS).minimalCompletionStage();
        }
        // END io
        @Override public void close() throws InterruptedException {
            workers.shutdown();
            if (!workers.awaitTermination(2, TimeUnit.SECONDS))
                throw new IllegalStateException("local I/O still active");
        }
    }

    static void check(boolean ok, String claim) {
        if (!ok) throw new AssertionError(claim);
    }
    static Throwable failure(CompletionStage<String> stage) throws Exception {
        try { stage.toCompletableFuture().get(2, TimeUnit.SECONDS); }
        catch (ExecutionException expected) { return expected.getCause(); }
        throw new AssertionError("expected failure");
    }
    static void waitUntilReleased(IoGate gate) throws Exception {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (gate.permits.availablePermits() == 0 && System.nanoTime() < end) Thread.onSpinWait();
        check(gate.permits.availablePermits() == 1, "actual termination releases exactly once");
    }
    public static void main(String[] args) throws Exception {
        var batch = new BatchProgress(7, new long[]{81, 83, 90}, 95);
        batch.complete(7, 2);
        check(batch.safeNext().isEmpty(), "90 cannot skip unfinished 81");
        batch.complete(7, 0);
        check(batch.safeNext().orElseThrow() == 83, "offset holes are not missing records");
        batch.complete(6, 1);
        check(batch.safeNext().orElseThrow() == 83, "stale assignment completion ignored");
        batch.complete(7, 1);
        check(batch.safeNext().orElseThrow() == 95, "fully done uses saved batch next");
        batch.revoke();
        check(batch.safeNext().isEmpty(), "revoked owner cannot commit locally");
        System.out.println("PREFIX: ordered fetched offsets, gaps, stale completion, revoke PASS");

        try (var gate = new IoGate(1)) {
            check(gate.call(() -> "ok", System.nanoTime() + TimeUnit.SECONDS.toNanos(1))
                    .toCompletableFuture().get().equals("ok"), "normal response");
            waitUntilReleased(gate);
        }
        try (var gate = new IoGate(1)) {
            var started = new CountDownLatch(1);
            var actualEnd = new CountDownLatch(1);
            var waiting = gate.call(() -> {
                started.countDown(); actualEnd.await(); return "late";
            }, System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(150));
            check(started.await(1, TimeUnit.SECONDS), "real worker started");
            check(failure(waiting) instanceof TimeoutException, "caller timed out");
            check(gate.permits.availablePermits() == 0, "timeout retained local I/O permit");
            check(failure(gate.call(() -> "must not run", System.nanoTime() + TimeUnit.SECONDS.toNanos(1)))
                    instanceof RejectedExecutionException, "ghost work blocks new admission");
            actualEnd.countDown(); waitUntilReleased(gate);
        }
        try (var gate = new IoGate(1)) {
            check(failure(gate.call(() -> { throw new java.io.IOException("broken"); },
                    System.nanoTime() + TimeUnit.SECONDS.toNanos(1))) instanceof java.io.IOException,
                    "real I/O exception propagated");
            waitUntilReleased(gate);
        }
        try (var gate = new IoGate(1)) {
            gate.workers.shutdown();
            check(failure(gate.call(() -> "not started", System.nanoTime() + TimeUnit.SECONDS.toNanos(1)))
                    instanceof RejectedExecutionException, "executor reject propagated");
            check(gate.permits.availablePermits() == 1, "reject returns unstarted permit");
        }
        System.out.println("I/O: normal, timeout with active work, saturation, failure, reject PASS");
        var threadStarted = new CountDownLatch(1);
        var allowWorker = new CountDownLatch(1);
        var ioStarts = new AtomicInteger();
        ThreadFactory delayed = task -> new Thread(() -> {
            threadStarted.countDown();
            try { allowWorker.await(); }
            catch (InterruptedException interrupted) { throw new AssertionError(interrupted); }
            task.run();
        });
        try (var gate = new IoGate(1, delayed)) {
            var waiting = gate.call(() -> { ioStarts.incrementAndGet(); return "late start"; },
                    System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(50));
            check(threadStarted.await(1, TimeUnit.SECONDS), "worker created but not run");
            check(failure(waiting) instanceof TimeoutException, "caller expired before worker run");
            check(gate.permits.availablePermits() == 0, "delayed worker still owns reserved permit");
            allowWorker.countDown(); waitUntilReleased(gate);
            check(ioStarts.get() == 0, "expired worker does not start I/O");
        }
        System.out.println("LATE DISPATCH: expired worker skips I/O and returns one permit PASS");
    }
}
