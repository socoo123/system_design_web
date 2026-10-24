import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Callable;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;

public final class ServiceGovernance {
  // BEGIN breaker
  enum State { CLOSED, OPEN, HALF_OPEN }
  enum Verdict { SUCCESS, FAILURE, IGNORED }
  static final class Breaker {
    final LongSupplier clock;                 // monotonic; read inside the lock
    State state = State.CLOSED;
    long epoch, openedAt;
    int failures;
    Breaker(LongSupplier clock) { this.clock = clock; }
    final class Ticket {
      final Breaker owner = Breaker.this;
      final long generation = epoch;
      boolean done;
    }
    synchronized Ticket tryAcquire() {
      long now = clock.getAsLong();
      if (state == State.HALF_OPEN) return null;
      if (state == State.OPEN) {
        if (now - openedAt < 1_000_000_000L) return null;
        state = State.HALF_OPEN;              // exactly one local probe
      }
      return new Ticket();
    }
    synchronized void finish(Ticket t, Verdict v) {
      if (t == null || t.owner != this || t.done) return;
      t.done = true;
      if (t.generation != epoch) return;      // ignore old in-flight completion
      if (state == State.HALF_OPEN) {
        state = v == Verdict.SUCCESS ? State.CLOSED : State.OPEN;
        failures = 0; epoch++; openedAt = clock.getAsLong();
      } else if (state == State.CLOSED) {
        if (v == Verdict.SUCCESS) failures = 0;
        if (v == Verdict.FAILURE && ++failures == 3) {
          state = State.OPEN; epoch++; openedAt = clock.getAsLong();
        }
      }
    }
  }
  // END breaker
  // Executable local resource bracket used by the focused exception probes.
  static Verdict guardedBody(Breaker b, Breaker.Ticket t, Semaphore slot,
                             Callable<Verdict> body) {
    try {
      Verdict result = body.call(); b.finish(t, result); return result;
    } catch (Exception localFailure) {
      return Verdict.IGNORED;
    } finally {
      try { b.finish(t, Verdict.IGNORED); } finally { slot.release(); }
    }
  }
  // Same admission arithmetic as retry.pseudo, in nanoseconds.
  static long remainingAttempt(long admittedAt, long now, long deadline) {
    long left = Math.min(220_000_000L - (now - admittedAt),
                         deadline - now - 140_000_000L);
    return left >= 100_000_000L ? left : 0;
  }
  static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }
  static void fail3(Breaker b) {
    for (int n = 0; n < 3; n++) b.finish(b.tryAcquire(), Verdict.FAILURE);
    check(b.state == State.OPEN, "three observed failures open circuit");
  }
  public static void main(String[] args) throws Exception {
    check(remainingAttempt(0, 1, 800_000_000L) == 219_999_999L, "positive 1ns dispatch delay allowed");
    check(remainingAttempt(0, 1_000_000L, 800_000_000L) == 219_000_000L, "positive 1ms dispatch delay allowed");
    check(remainingAttempt(0, 120_000_000L, 800_000_000L) == 100_000_000L, "minimum useful edge");
    check(remainingAttempt(0, 120_000_001L, 800_000_000L) == 0, "late worker rejected");
    check(remainingAttempt(0, 0, 240_000_000L) == 100_000_000L, "return reserve retained");
    check(remainingAttempt(0, 0, 239_999_999L) == 0, "return reserve deficit rejected");
    long realStart = System.nanoTime(), realNow = System.nanoTime();
    check(realNow - realStart > 0, "real monotonic clock advanced");
    long realBudget = remainingAttempt(realStart, realNow, realStart + 800_000_000L);
    check(realBudget == 0 || (realBudget >= 100_000_000L && realBudget < 220_000_000L), "actual elapsed time deducted");
    AtomicLong clock = new AtomicLong(); Breaker b = new Breaker(clock::get);
    b.finish(b.tryAcquire(), Verdict.SUCCESS);
    check(b.state == State.CLOSED && b.failures == 0, "normal success");
    Breaker.Ticket old = b.tryAcquire();
    fail3(b);
    for (int n = 0; n < 10; n++) check(b.tryAcquire() == null, "open rejection");
    check(b.openedAt == 0, "rejected calls never extend cooldown");
    clock.set(999_999_999L); check(b.tryAcquire() == null, "not yet expired");
    clock.set(1_000_000_000L);
    AtomicInteger probes = new AtomicInteger();
    List<Breaker.Ticket> tickets = new ArrayList<>();
    CountDownLatch ready = new CountDownLatch(20), start = new CountDownLatch(1);
    List<Thread> threads = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      Thread t = new Thread(() -> {
        ready.countDown();
        try { start.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
        Breaker.Ticket ticket = b.tryAcquire();
        if (ticket != null) {
          probes.incrementAndGet(); synchronized (tickets) { tickets.add(ticket); }
        }
      });
      threads.add(t); t.start();
    }
    ready.await(); start.countDown(); for (Thread t : threads) t.join();
    check(probes.get() == 1, "one of twenty concurrent probes admitted");
    b.finish(tickets.get(0), Verdict.SUCCESS);
    check(b.state == State.CLOSED, "probe success closes");
    b.finish(old, Verdict.FAILURE);
    check(b.failures == 0, "old generation failure ignored");
    Breaker.Ticket once = b.tryAcquire(); b.finish(once, Verdict.FAILURE);
    b.finish(once, Verdict.FAILURE);
    check(b.failures == 1, "completion exactly once locally");
    b.finish(b.tryAcquire(), Verdict.IGNORED);
    check(b.failures == 1, "local denial does not count as dependency failure");
    b.finish(b.tryAcquire(), Verdict.SUCCESS);
    check(b.failures == 0, "success resets consecutive failure count");
    fail3(b); long originalOpen = b.openedAt;
    clock.addAndGet(1_000_000_000L);
    b.finish(b.tryAcquire(), Verdict.FAILURE);
    check(b.state == State.OPEN && b.openedAt > originalOpen, "failed probe restarts cooldown");
    clock.addAndGet(1_000_000_000L);
    b.finish(b.tryAcquire(), Verdict.IGNORED);
    check(b.state == State.OPEN, "undispatched probe never claims recovery");
    Breaker other = new Breaker(clock::get);
    other.finish(once, Verdict.FAILURE);
    check(other.failures == 0, "foreign ticket rejected");
    AtomicLong guardClock = new AtomicLong();
    Breaker guarded = new Breaker(guardClock::get); fail3(guarded);
    guardClock.addAndGet(1_000_000_000L);
    Semaphore slots = new Semaphore(1); slots.acquire();
    AtomicInteger ioStarts = new AtomicInteger();
    Verdict quotaException = guardedBody(guarded, guarded.tryAcquire(), slots, () -> {
      throw new IllegalArgumentException("quota SDK parse failure before inventory I/O");
    });
    check(quotaException == Verdict.IGNORED && slots.availablePermits() == 1
          && guarded.state == State.OPEN && ioStarts.get() == 0,
          "quota exception cleans half-open ticket and slot without inventory I/O");
    guardClock.addAndGet(1_000_000_000L); slots.acquire();
    guardedBody(guarded, guarded.tryAcquire(), slots, () -> Verdict.IGNORED);
    check(slots.availablePermits() == 1 && guarded.state == State.OPEN,
          "unknown quota result abandons probe and releases terminal slot");
    guardClock.addAndGet(1_000_000_000L); slots.acquire();
    guardedBody(guarded, guarded.tryAcquire(), slots, () -> {
      long late = remainingAttempt(0, 121_000_000L, 800_000_000L);
      if (late == 0) return Verdict.IGNORED;
      ioStarts.incrementAndGet(); return Verdict.SUCCESS;
    });
    check(slots.availablePermits() == 1 && guarded.state == State.OPEN && ioStarts.get() == 0,
          "late quota completion rechecks useful deadline before inventory I/O");
    guardClock.addAndGet(1_000_000_000L); slots.acquire();
    guardedBody(guarded, guarded.tryAcquire(), slots, () -> {
      ioStarts.incrementAndGet(); return Verdict.SUCCESS;
    });
    check(slots.availablePermits() == 1 && guarded.state == State.CLOSED && ioStarts.get() == 1,
          "normal probe success survives finally IGNORED fallback");
    System.out.println("PASS: quota exception/unknown/late completion cleanup, deadline minimum/positive delay/late dispatch/return reserve, normal, threshold, fixed cooldown, 20-way half-open, stale epoch, duplicate/foreign finish, ignored, failed/abandoned probe");
  }
}
