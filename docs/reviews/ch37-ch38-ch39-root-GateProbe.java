import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

class GateProbe {
    static int checks;
    static void require(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    static boolean rejects(Runnable task) {
        try { task.run(); return false; }
        catch (IllegalStateException ex) { return true; }
    }
    public static void main(String[] args) throws Exception {
        var ready = new LoadBalancing.Endpoint("ready", 14, LoadBalancing.Phase.READY, true, 4);
        var lower = new LoadBalancing.Endpoint("lower", 15, LoadBalancing.Phase.READY, true, 1);
        var draining = new LoadBalancing.Endpoint("draining", 13, LoadBalancing.Phase.DRAINING, true, 0);
        var failed = new LoadBalancing.Endpoint("failed", 12, LoadBalancing.Phase.READY, false, 0);
        require(LoadBalancing.choose(List.of(), new Random(1)) == null, "empty target set rejects");
        require(LoadBalancing.choose(List.of(draining, failed), new Random(1)) == null, "no fallback to unhealthy or draining targets");
        require(LoadBalancing.choose(List.of(draining, ready, failed), new Random(1)).equals(ready), "only available target selected");
        require(LoadBalancing.choose(List.of(ready, lower), new Random(1)).equals(lower), "two candidates choose fewer active attempts");

        var now = new AtomicLong(100);
        var gate = new LoadBalancing.Gate(14, 1, now::get);
        require(!gate.ready(13) && gate.ready(14), "old readiness cannot open fresh incarnation");
        require(rejects(() -> gate.beginDrain(13, 7, 30)), "old drain rejected before closing new gate");
        require(gate.tryAdmit(14, 100) == null, "deadline equality rejects");
        var permit = gate.tryAdmit(14, 1000);
        require(permit != null, "current work remains admissible after old drain");
        require(gate.tryAdmit(14, 1000) == null && gate.activeCount() == 1, "full slot rejects additional work");
        require(gate.tryAdmit(13, 1000) == null && !gate.unhealthy(13), "stale routing and health generation rejected");
        var different = new LoadBalancing.Gate(15, 1, now::get);
        require(!different.finish(permit), "permit cannot release another incarnation");
        long cutoff = gate.beginDrain(14, 9, 30);
        require(cutoff == 130, "initial drain cutoff");
        now.set(120);
        require(gate.beginDrain(14, 9, 9000) == 130, "repeated drain does not extend cutoff");
        require(rejects(() -> gate.beginDrain(13, 9, 30)), "old incarnation cannot pass duplicate-drain fast path");
        require(gate.tryAdmit(14, 1000) == null && !gate.ready(14), "local drain gate cannot reopen");
        require(!gate.acknowledgeRemoval(13, 9) && !gate.acknowledgeRemoval(14, 8), "wrong incarnation or revision ACK rejected");
        require(gate.pollDrain() == LoadBalancing.DrainDecision.WAIT, "not removed and still active");
        require(gate.acknowledgeRemoval(14, 9), "current removal barrier accepted");
        require(gate.pollDrain() == LoadBalancing.DrainDecision.WAIT, "barrier does not finish active work");
        now.set(130);
        require(gate.pollDrain() == LoadBalancing.DrainDecision.FORCE_REQUIRED && gate.activeCount() == 1, "cutoff does not release real handler");
        require(gate.finish(permit) && !gate.finish(permit), "physical completion releases exactly once");
        require(gate.pollDrain() == LoadBalancing.DrainDecision.CLEAN_EXIT, "clean exit requires observed zero active and barrier");
        require(!different.ready(14) && different.ready(15), "replacement gate uses its own incarnation");

        var racing = new LoadBalancing.Gate(20, 1, () -> 10L);
        racing.ready(20);
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(8);
        try {
            var futures = new ArrayList<Future<LoadBalancing.Permit>>();
            for (int i = 0; i < 8; i++) futures.add(pool.submit(() -> { start.await(); return racing.tryAdmit(20, 100); }));
            start.countDown();
            var admitted = new ArrayList<LoadBalancing.Permit>();
            for (var future : futures) { var p = future.get(5, TimeUnit.SECONDS); if (p != null) admitted.add(p); }
            require(admitted.size() == 1 && racing.activeCount() == 1, "eight actual ingress threads cannot oversubscribe last slot");
            require(racing.finish(admitted.get(0)) && racing.activeCount() == 0, "last slot released by actual completion");
        } finally { pool.shutdownNow(); }

        var observed = new AtomicLong(500);
        var samples = new AtomicInteger();
        var crossed = new LoadBalancing.Gate(30, 1, () -> { samples.incrementAndGet(); return observed.get(); });
        crossed.ready(30);
        var entered = new CountDownLatch(1);
        var result = new AtomicInteger(-1);
        crossed.lock.lock();
        Thread worker = new Thread(() -> { entered.countDown(); result.set(crossed.tryAdmit(30, 501) == null ? 0 : 1); });
        try {
            worker.start(); entered.await(5, TimeUnit.SECONDS);
            Thread.sleep(30);
            require(samples.get() == 0, "clock is not sampled before admission lock");
            observed.set(501);
        } finally { crossed.lock.unlock(); }
        worker.join(5000);
        require(!worker.isAlive() && result.get() == 0 && samples.get() == 1, "lock wait crosses deadline and admission rejects");
        require(crossed.activeCount() == 0, "expired queued call did not acquire permit");
        System.out.println("GateProbe: " + checks + " independent checks passed");
    }
}
