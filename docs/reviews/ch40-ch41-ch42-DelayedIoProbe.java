import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
class DelayedIoProbe {
  public static void main(String[] args) throws Exception {
    var gate = new Resilience.IoGate(1);
    var release = new CountDownLatch(1);
    var ended = new CountDownLatch(1);
    var calls = new AtomicInteger();
    gate.workers.setThreadFactory(task -> new Thread(() -> {
      try { release.await(); task.run(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
      finally { ended.countDown(); }
    }));
    var reply = gate.call(() -> { calls.incrementAndGet(); return "effect"; },
       System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(50));
    boolean callerExpired = false;
    try { reply.toCompletableFuture().get(2, TimeUnit.SECONDS); }
    catch (ExecutionException expected) { callerExpired = expected.getCause() instanceof TimeoutException; }
    int heldAfterTimeout = gate.permits.availablePermits();
    release.countDown(); gate.close();
    if (!callerExpired) throw new AssertionError("caller did not time out");
    if (heldAfterTimeout != 0) throw new AssertionError("timeout prematurely released the I/O permit");
    System.out.println("callerExpired=" + callerExpired + "; permitHeld=" + (heldAfterTimeout == 0)
      + "; actualIoStartedAfterDeadline=" + calls.get());
    if (calls.get() != 0) throw new AssertionError("expired work started actual I/O");
  }
}
