import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

public final class LoadBalancingTest {
    static int checks;
    static final List<String> passed = new ArrayList<>();
    static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++; passed.add(label);
    }
    static LoadBalancing.Gate ready(long incarnation, int limit, AtomicLong time) {
        var gate = new LoadBalancing.Gate(incarnation, limit, time::get);
        if (!gate.ready(incarnation)) throw new AssertionError();
        return gate;
    }
    // Hold the implementation lock, enqueue the tested operation, then move time.
    static <T> T afterLockWait(LoadBalancing.Gate gate, AtomicLong time,
                              long newTime, Supplier<T> action) throws Exception {
        AtomicReference<T> value = new AtomicReference<>();
        AtomicReference<Throwable> error = new AtomicReference<>();
        Thread worker = new Thread(() -> {
            try { value.set(action.get()); } catch (Throwable e) { error.set(e); }
        });
        gate.lock.lock();
        try {
            worker.start();
            long end = System.nanoTime() + 2_000_000_000L;
            while (!gate.lock.hasQueuedThread(worker)) {
                if (System.nanoTime() - end >= 0) throw new AssertionError("worker did not queue");
                Thread.onSpinWait();
            }
            time.set(newTime);
        } finally { gate.lock.unlock(); }
        worker.join(2000);
        if (worker.isAlive()) throw new AssertionError("worker stalled");
        if (error.get() != null) throw new AssertionError(error.get());
        return value.get();
    }
    public static void main(String[] args) throws Exception {
        var r = new Random(39);
        var good = new LoadBalancing.Endpoint("a", 1, LoadBalancing.Phase.READY, true, 8);
        var light = new LoadBalancing.Endpoint("b", 2, LoadBalancing.Phase.READY, true, 2);
        var warming = new LoadBalancing.Endpoint("c", 3, LoadBalancing.Phase.WARMING, true, 0);
        var draining = new LoadBalancing.Endpoint("d", 4, LoadBalancing.Phase.DRAINING, true, 0);
        var failed = new LoadBalancing.Endpoint("e", 5, LoadBalancing.Phase.READY, false, 0);
        check(LoadBalancing.choose(List.of(good, light, warming, draining, failed), r) == light,
              "filter unavailable before P2C; two distinct candidates choose 2 not 8");
        check(LoadBalancing.choose(List.of(warming, draining, failed), r) == null,
              "no available endpoint rejects instead of falling back to unhealthy");
        check(LoadBalancing.choose(List.of(), r) == null, "empty snapshot");
        check(LoadBalancing.choose(List.of(good), r) == good, "one available endpoint");

        var time = new AtomicLong(10);
        var gate = new LoadBalancing.Gate(7, 1, time::get);
        check(gate.tryAdmit(7, 100) == null, "warming denies admission");
        check(!gate.ready(6) && gate.ready(7), "readiness requires current incarnation");
        check(gate.tryAdmit(6, 100) == null, "stale incarnation denied");
        check(gate.tryAdmit(7, 10) == null, "exact deadline is expired");
        var held = gate.tryAdmit(7, 100);
        check(held != null && gate.activeCount() == 1, "normal admission holds one permit");
        check(gate.tryAdmit(7, 100) == null, "ready but saturated denies work");
        check(!ready(8, 1, time).finish(held), "another incarnation cannot release old work");
        check(gate.finish(held) && !gate.finish(held) && gate.activeCount() == 0,
              "duplicate completion cannot double release");

        // Two independent ingress threads observe one ready App and race its last slot.
        var raceGate = ready(9, 1, time);
        var start = new CountDownLatch(1);
        var permits = new AtomicReferenceArray2();
        Thread[] threads = new Thread[2];
        for (int i = 0; i < 2; i++) {
            final int slot = i;
            threads[i] = new Thread(() -> {
                try { start.await(); permits.set(slot, raceGate.tryAdmit(9, 100)); }
                catch (InterruptedException e) { throw new AssertionError(e); }
            });
            threads[i].start();
        }
        start.countDown();
        for (Thread thread : threads) thread.join();
        check((permits.get(0) == null) != (permits.get(1) == null), "two ingress threads: exactly one winner");
        check(raceGate.activeCount() == 1, "last-slot race never exceeds local limit");
        raceGate.finish(permits.get(0)); raceGate.finish(permits.get(1));

        var delayed = ready(10, 1, time);
        check(afterLockWait(delayed, time, 20, () -> delayed.tryAdmit(10, 20)) == null,
              "deadline crossed while waiting for lock: deny with lock-after time");
        check(delayed.activeCount() == 0, "expired waiter consumes no capacity");

        time.set(100);
        var drainGate = ready(11, 2, time);
        var old = drainGate.tryAdmit(11, 1000);
        long deadline = afterLockWait(drainGate, time, 200, () -> drainGate.beginDrain(11, 50, 30));
        check(deadline == 230, "drain deadline starts after lock acquisition");
        check(drainGate.tryAdmit(11, 1000) == null, "stale selector denied after local close");
        check(!drainGate.ready(11), "late success probe cannot revive DRAINING");
        check(!drainGate.acknowledgeRemoval(10, 50) && !drainGate.acknowledgeRemoval(11, 49),
              "removal ACK binds exact incarnation and revision");
        check(drainGate.pollDrain() == LoadBalancing.DrainDecision.WAIT, "drain keeps active work alive");
        time.set(210);
        check(drainGate.beginDrain(11, 50, 3000) == 230, "duplicate drain never extends original deadline");
        boolean changedRevisionRejected = false;
        try { drainGate.beginDrain(11, 51, 30); } catch (IllegalStateException expected) { changedRevisionRejected = true; }
        check(changedRevisionRejected, "changed drain revision cannot reset lifecycle");
        check(drainGate.acknowledgeRemoval(11, 50), "trusted coordinator confirms withdrawal");
        time.set(229);
        check(drainGate.pollDrain() == LoadBalancing.DrainDecision.WAIT, "before cutoff retains old active work");
        check(afterLockWait(drainGate, time, 230, drainGate::pollDrain) == LoadBalancing.DrainDecision.FORCE_REQUIRED,
              "drain polling observes deadline crossed under lock contention");
        check(drainGate.activeCount() == 1, "cancel/close decision does not fabricate resource completion");
        check(drainGate.finish(old) && !drainGate.finish(old), "old handler completes once after deadline");
        check(drainGate.pollDrain() == LoadBalancing.DrainDecision.CLEAN_EXIT, "ACK plus actual zero allows clean exit");

        var noAck = ready(12, 1, time);
        noAck.beginDrain(12, 60, 5);
        check(noAck.pollDrain() == LoadBalancing.DrainDecision.WAIT, "zero active without removal evidence is insufficient");
        time.addAndGet(5);
        check(noAck.pollDrain() == LoadBalancing.DrainDecision.FORCE_REQUIRED, "lost removal ACK reaches bounded forced path");

        var crash = ready(13, 1, time);
        var crashOld = crash.tryAdmit(13, 1000);
        check(crash.unhealthy(13) && crash.tryAdmit(13, 1000) == null, "unhealthy gate denies new work");
        check(crash.activeCount() == 1 && !crash.ready(13), "failure neither clears work nor revives by probe");
        var replacement = ready(14, 1, time);
        boolean staleDrainRejected = false;
        try { replacement.beginDrain(13, 61, 30); }
        catch (IllegalStateException expected) { staleDrainRejected = true; }
        check(staleDrainRejected, "late drain for prior incarnation cannot close replacement");
        var fresh = replacement.tryAdmit(14, 1000);
        check(replacement.tryAdmit(13, 1000) == null && !replacement.finish(crashOld),
              "old route and old completion cannot affect replacement incarnation");
        check(replacement.activeCount() == 1 && replacement.finish(fresh), "replacement retains its own permit");
        check(crash.finish(crashOld) && crash.activeCount() == 0, "old completion belongs only to old gate");

        var wrapTime = new AtomicLong(Long.MAX_VALUE - 2);
        var wrap = ready(15, 1, wrapTime);
        long wrapsAt = wrapTime.get() + 5;
        var wrapPermit = wrap.tryAdmit(15, wrapsAt);
        check(wrapPermit != null, "monotonic tick wrap does not prematurely expire future deadline");
        wrap.finish(wrapPermit); wrapTime.set(wrapsAt);
        check(wrap.tryAdmit(15, wrapsAt) == null, "deadline comparison survives monotonic tick wrap");

        System.out.println("PASS " + checks + " targeted checks");
        for (String label : passed) System.out.println("- " + label);
    }
    static final class AtomicReferenceArray2 {
        final java.util.concurrent.atomic.AtomicReferenceArray<LoadBalancing.Permit> values =
            new java.util.concurrent.atomic.AtomicReferenceArray<>(2);
        void set(int i, LoadBalancing.Permit p) { values.set(i, p); }
        LoadBalancing.Permit get(int i) { return values.get(i); }
    }
}
