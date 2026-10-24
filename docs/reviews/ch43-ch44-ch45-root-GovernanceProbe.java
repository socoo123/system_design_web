import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

class RootGovernanceProbe {
    static int checks;
    static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    public static void main(String[] args) throws Exception {
        AtomicLong now = new AtomicLong(100);
        var breaker = new ServiceGovernance.Breaker(now::get);
        var oldSuccess = breaker.tryAcquire();
        for (int i = 0; i < 3; i++) breaker.finish(breaker.tryAcquire(), ServiceGovernance.Verdict.FAILURE);
        breaker.finish(oldSuccess, ServiceGovernance.Verdict.SUCCESS);
        check(breaker.state == ServiceGovernance.State.OPEN, "stale success cannot heal newer open generation");
        now.addAndGet(1_000_000_000L);
        var probe = breaker.tryAcquire();
        var foreign = new ServiceGovernance.Breaker(now::get);
        foreign.finish(probe, ServiceGovernance.Verdict.SUCCESS);
        check(foreign.state == ServiceGovernance.State.CLOSED && breaker.state == ServiceGovernance.State.HALF_OPEN,
                "foreign completion cannot complete the owned probe");
        breaker.finish(probe, ServiceGovernance.Verdict.SUCCESS);
        check(breaker.state == ServiceGovernance.State.CLOSED, "owner can still finish after foreign attempt");
        var one = breaker.tryAcquire();
        CountDownLatch start = new CountDownLatch(1);
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 32; i++) {
            Thread t = new Thread(() -> {
                try { start.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
                breaker.finish(one, ServiceGovernance.Verdict.FAILURE);
            });
            threads.add(t); t.start();
        }
        start.countDown();
        for (Thread thread : threads) thread.join();
        check(breaker.failures == 1, "32 racing completions count one ticket once");
        int admittedAcrossInstances = 0;
        for (int i = 0; i < 7; i++) {
            var b = new ServiceGovernance.Breaker(now::get);
            for (int k = 0; k < 3; k++) b.finish(b.tryAcquire(), ServiceGovernance.Verdict.FAILURE);
            now.addAndGet(1_000_000_000L);
            if (b.tryAcquire() != null) admittedAcrossInstances++;
        }
        check(admittedAcrossInstances == 7, "one half-open probe is local, not a fleet-wide guarantee");
        System.out.println("PASS root governance probe: " + checks + " new adversarial completion and locality cases");
    }
}
