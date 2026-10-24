import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;

final class Ch42IndependentProbe {
    static void must(boolean condition, String claim) {
        if (!condition) throw new AssertionError(claim);
    }
    static Throwable failed(CompletionStage<String> stage) throws Exception {
        try { stage.toCompletableFuture().get(2, TimeUnit.SECONDS); }
        catch (ExecutionException e) { return e.getCause(); }
        throw new AssertionError("Expected failure");
    }
    static void released(Resilience.IoGate gate, int count) {
        long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (gate.permits.availablePermits() != count && System.nanoTime() < end)
            LockSupport.parkNanos(100_000);
        must(gate.permits.availablePermits() == count, "Exact permit count after worker exit");
    }
    static void prefix() {
        var progress = new Resilience.BatchProgress(13, new long[]{204,207,211,401}, 1000);
        progress.complete(13, 2);
        must(progress.safeNext().isEmpty(), "Out-of-order completion cannot skip 204");
        progress.complete(13, 0);
        must(progress.safeNext().orElseThrow() == 207, "Numeric holes are not fetched pending work");
        progress.complete(12, 1);
        progress.complete(13, 3);
        must(progress.safeNext().orElseThrow() == 207, "Stale generation cannot fill the prefix");
        progress.complete(13, 1);
        must(progress.safeNext().orElseThrow() == 1000, "Full prefix uses broker batch next, not last+1");
        progress.revoke(); progress.complete(13, 0);
        must(progress.safeNext().isEmpty(), "Revoked batch cannot produce a commit candidate");
    }
    static void realIoLifetime() throws Exception {
        var started = new CountDownLatch(2);
        var finish = new CountDownLatch(1);
        var active = new AtomicInteger();
        var maximum = new AtomicInteger();
        try (var a = new Resilience.IoGate(2); var b = new Resilience.IoGate(1)) {
            Callable<String> io = () -> {
                int n=active.incrementAndGet(); maximum.accumulateAndGet(n, Math::max);
                started.countDown();
                try { finish.await(); return "durable-or-unknown"; }
                finally { active.decrementAndGet(); }
            };
            try {
                var first=a.call(io, System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(120));
                var second=a.call(io, System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(160));
                must(started.await(1,TimeUnit.SECONDS), "Both real I/O workers started");
                must(failed(first) instanceof TimeoutException, "First caller times out");
                must(failed(second) instanceof TimeoutException, "Second caller times out");
                must(a.permits.availablePermits()==0 && active.get()==2, "Caller timeout retains active permits");
                must(failed(a.call(()->"must-not-run", System.nanoTime()+TimeUnit.SECONDS.toNanos(1)))
                        instanceof RejectedExecutionException, "Third work rejects at two active local calls");
                must(b.call(()->"optional-b", System.nanoTime()+TimeUnit.SECONDS.toNanos(1))
                        .toCompletableFuture().get().equals("optional-b"), "Independent bulkhead B progresses");
                must(maximum.get()==2, "The real local maximum remains two");
            } finally { finish.countDown(); }
            released(a,2); released(b,1);
            var starts=new AtomicInteger();
            must(failed(a.call(()->{starts.incrementAndGet();return "expired";},System.nanoTime()-1))
                    instanceof TimeoutException, "Expired call rejects before admission");
            must(starts.get()==0 && a.permits.availablePermits()==2, "Expired call neither starts I/O nor loses a permit");
        }
    }
    static void lateWorkerWhileTimerBlocked() throws Exception {
        // Block the JDK's timeout scheduler so the pending result is NOT already done.
        // This distinguishes an actual deadline check from only reply.isDone().
        var timerBlocked=new CountDownLatch(1);
        var freeTimer=new CountDownLatch(1);
        var root=new CompletableFuture<String>();
        var observer=root.whenComplete((value,error)->{
            timerBlocked.countDown();
            try { freeTimer.await(); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        });
        root.orTimeout(5,TimeUnit.MILLISECONDS);
        must(timerBlocked.await(1,TimeUnit.SECONDS), "Timeout scheduler deliberately held");
        var created=new CountDownLatch(1);
        var freeWorker=new CountDownLatch(1);
        var starts=new AtomicInteger();
        ThreadFactory delayed=task->new Thread(()->{
            created.countDown();
            try { freeWorker.await(); }
            catch (InterruptedException e) { throw new AssertionError(e); }
            task.run();
        },"ch42-independent-delayed");
        try (var gate=new Resilience.IoGate(1,delayed)) {
            try {
                long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(50);
                var reply=gate.call(()->{starts.incrementAndGet();return "unsafe-late-I/O";},deadline);
                must(created.await(1,TimeUnit.SECONDS), "Worker exists but is delayed");
                while(System.nanoTime()-deadline<=0) LockSupport.parkNanos(500_000);
                must(!reply.toCompletableFuture().isDone(), "Blocked timer has not completed the caller future");
                must(gate.permits.availablePermits()==0, "Delayed worker owns its reserved permit");
                freeWorker.countDown(); released(gate,1);
                must(failed(reply) instanceof TimeoutException, "Worker's own deadline check completes timeout");
                must(starts.get()==0, "Worker never starts expired I/O even when timeout future is pending");
            } finally { freeWorker.countDown(); freeTimer.countDown(); }
        } finally { freeTimer.countDown(); }
    }
    public static void main(String[] args) throws Exception {
        prefix(); realIoLifetime(); lateWorkerWhileTimerBlocked();
        System.out.println("PASS: independent fetched-prefix/revoke, two-active-I/O isolation, blocked-timer late-worker probes");
    }
}
