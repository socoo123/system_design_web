import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

/** Java 17, no dependencies. Local algorithm, NOT a distributed registry. */
public final class IdExample {
    static final long TIME_LIMIT = 1L << 41;
    interface Clock {
        long millis(); // relative to the shared epoch
        long nanos();  // monotonic elapsed-time source
        void pause();
    }
    // A committed, single-live-instance grant. Never restore this after a restart.
    record Window(int worker, long lo, long hi) {
        Window {
            if (worker < 0 || worker >= 1024 || lo < 1 || hi <= lo || hi > TIME_LIMIT)
                throw new IllegalArgumentException("invalid committed window");
        }
    }
    static final class Generator {
        private final Window grant;
        private final Clock clock;
        private long last = -1;
        private int sequence;
        private boolean halted;
        Generator(Window grant, Clock clock) { this.grant = grant; this.clock = clock; }
        private IllegalStateException stop(String reason) {
            halted = true;
            return new IllegalStateException(reason);
        }
        // BEGIN next-id
        synchronized long nextId() {
            if (halted) throw new IllegalStateException("HALTED: obtain a fresh window");
            long started = clock.nanos();
            boolean waited = false;
            for (;;) {
                long now = clock.millis();
                if (now < grant.lo() || now >= grant.hi())
                    throw stop("outside committed timestamp window");
                if (last - now > 5) throw stop("rollback exceeds 5 ms");
                if (waited && clock.nanos() - started >= 5_000_000L)
                    throw stop("wait budget exhausted");
                int candidate = now == last ? sequence + 1 : 0;
                if (now >= last && candidate < 4096) {
                    last = now;
                    sequence = candidate;
                    return (now << 22) | ((long) grant.worker() << 12) | sequence;
                }
                // Small rollback or same-millisecond exhaustion: re-read, never wrap.
                waited = true;
                clock.pause();
            }
        }
        // END next-id
    }
    static final class FakeClock implements Clock {
        long wall, elapsed;
        boolean advance;
        FakeClock(long wall) { this.wall = wall; }
        public long millis() { return wall; }
        public long nanos() { return elapsed; }
        public void pause() { elapsed += 1_000_000; if (advance) wall++; }
    }
    static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    static void fails(Runnable action, String expected) {
        try { action.run(); throw new AssertionError("expected " + expected); }
        catch (IllegalStateException e) { check(e.getMessage().contains(expected), e.getMessage()); }
    }
    public static void main(String[] args) throws Exception {
        FakeClock clock = new FakeClock(1000);
        Generator g = new Generator(new Window(7, 900, 2000), clock);
        long id = 0;
        for (int i = 0; i <= 42; i++) id = g.nextId();
        check((id >>> 22) == 1000 && ((id >>> 12) & 1023) == 7 && (id & 4095) == 42, "decode");
        clock.wall = 998; clock.advance = true;
        check((g.nextId() & 4095) == 43, "equality after rollback must not reset");
        clock.wall = 990;
        fails(g::nextId, "rollback exceeds");
        clock.wall = 1001; fails(g::nextId, "HALTED");

        FakeClock frozen = new FakeClock(1000);
        Generator full = new Generator(new Window(2, 1, 2000), frozen);
        Set<Long> ids = ConcurrentHashMap.newKeySet();
        for (int i = 0; i < 4096; i++) check(ids.add(full.nextId()), "duplicate");
        fails(full::nextId, "wait budget");
        check(ids.size() == 4096, "must not wrap");
        FakeClock moving = new FakeClock(1000);
        Generator spill = new Generator(new Window(2, 1, 2000), moving);
        for (int i = 0; i < 4096; i++) spill.nextId();
        moving.advance = true;
        check(spill.nextId() == ((1001L << 22) | (2L << 12)), "strictly newer millisecond");

        FakeClock concurrentClock = new FakeClock(1100);
        Generator shared = new Generator(new Window(3, 1, 2000), concurrentClock);
        Set<Long> concurrent = ConcurrentHashMap.newKeySet();
        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        Thread[] threads = new Thread[8];
        for (int t = 0; t < threads.length; t++) {
            threads[t] = new Thread(() -> {
                try { start.await(); for (int i = 0; i < 500; i++) check(concurrent.add(shared.nextId()), "concurrent duplicate"); }
                catch (Throwable e) { error.set(e); }
            });
            threads[t].start();
        }
        start.countDown(); for (Thread t : threads) t.join();
        check(error.get() == null && concurrent.size() == 4000, "same-instance concurrency");

        FakeClock oldClock = new FakeClock(1000), newClock = new FakeClock(1000);
        Generator old = new Generator(new Window(7, 1000, 1030), oldClock);
        long oldId = old.nextId();
        Generator unsafeReplay = new Generator(new Window(7, 1000, 1030), newClock);
        check(oldId == unsafeReplay.nextId(), "counterexample: replaying a grant duplicates");
        newClock.wall = 1030;
        Generator fresh = new Generator(new Window(7, 1030, 1060), newClock);
        long freshId = fresh.nextId();
        check(old.nextId() < freshId, "late old owner stays in disjoint time space");
        oldClock.wall = 1030; fails(old::nextId, "outside committed");
        newClock.wall = 1060; fails(fresh::nextId, "outside committed");
        FakeClock lastClock = new FakeClock(TIME_LIMIT - 1);
        Generator last = new Generator(new Window(1023, TIME_LIMIT - 1, TIME_LIMIT), lastClock);
        long largest = 0; for (int i = 0; i < 4096; i++) largest = last.nextId();
        check(largest == Long.MAX_VALUE, "highest legal tuple");
        lastClock.wall = TIME_LIMIT; fails(last::nextId, "outside committed");
        try { new Window(0, 0, 1); throw new AssertionError("zero timestamp reserved"); }
        catch (IllegalArgumentException expected) { /* positive ID contract */ }
        System.out.println("PASS: decode; rollback equality/refusal; 4096 exhaustion/recovery; 8-thread 4000 unique IDs; unsafe restart counterexample; disjoint windows; time-limit/positive-ID bounds");
    }
}
