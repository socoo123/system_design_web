import java.util.Map;
import java.util.HashMap;

/** Java 17, no dependencies. Deterministic contract model, not a DB adapter. */
public final class ReadPath {
    record Floor(String history, long position) {}
    record Snapshot(String body, Map<String, Long> appliedPrefixes) {
        boolean covers(Floor floor) {
            return floor == null || appliedPrefixes.getOrDefault(floor.history(), -1L) >= floor.position();
        }
    }
    record Request(String key, boolean strong, Floor minPos) {}
    record Entry(Snapshot value, long expiresAt) {}
    static final class Unavailable extends RuntimeException {
        Unavailable(String reason) { super(reason); }
    }
    interface Cache {
        Snapshot get(String key);              // cache service enforces its own TTL
        void put(String key, Snapshot value, long remainingTtlMillis);
    }
    interface Origin {
        // Adapter proves current read authority; returns a fresh snapshot plus prefix evidence.
        // Snapshot includes authoritative own posts, not unfinished async projections.
        Snapshot freshPrimary(String key);
        Snapshot staleReplica(String key);
    }
    interface Budget { boolean admit(); }       // shared across all app instances
    interface Clock { long millis(); }         // monotonic elapsed-time clock
    final Cache cache; final Origin origin; final Budget budget; final Clock clock;
    final long ttlMillis;
    ReadPath(Cache cache, Origin origin, Budget budget, Clock clock, long ttlMillis) {
        this.cache = cache; this.origin = origin; this.budget = budget;
        this.clock = clock; this.ttlMillis = ttlMillis;
    }

    // BEGIN PAGE
    Snapshot read(Request request) {
        boolean strong = request.strong() || request.minPos() != null;
        if (strong) {                          // classify BEFORE any cache lookup
            if (!budget.admit()) throw new Unavailable("origin budget");
            Snapshot value = origin.freshPrimary(request.key());
            if (!value.covers(request.minPos()))
                throw new Unavailable("required history unavailable");
            return value;                      // never downgrade to stale data
        }
        try {
            Snapshot hit = cache.get(request.key());
            if (hit != null) return hit;
        } catch (Unavailable ignored) { /* cache error is not an empty DB result */ }
        if (!budget.admit()) throw new Unavailable("origin budget");
        long startedAt = clock.millis();
        Snapshot value = origin.staleReplica(request.key());
        // Failed DB reads throw. Do not convert failures into cached empty results.
        long remainingTtl = ttlMillis - (clock.millis() - startedAt);
        if (remainingTtl > 0) {
            try { cache.put(request.key(), value, remainingTtl); }
            catch (Unavailable ignored) { /* a successful stale-ok read still returns */ }
        }
        return value;                          // TTL is not a replica-freshness proof
    }
    // END PAGE

    static final class MemoryCache implements Cache {
        final Map<String, Entry> entries = new HashMap<>();
        final Clock serviceClock;
        MemoryCache(Clock serviceClock) { this.serviceClock = serviceClock; }
        boolean down; int gets;
        public Snapshot get(String key) {
            gets++; if (down) throw new Unavailable("cache");
            Entry entry = entries.get(key);
            return entry != null && serviceClock.millis() < entry.expiresAt() ? entry.value() : null;
        }
        public void put(String key, Snapshot value, long ttl) {
            if (down) throw new Unavailable("cache");
            entries.put(key, new Entry(value, Math.addExact(serviceClock.millis(), ttl)));
        }
    }
    static final class FakeOrigin implements Origin {
        Snapshot primary = new Snapshot("post 9", Map.of("h1", 9L));
        Snapshot replica = new Snapshot("old feed", Map.of("h1", 8L));
        int calls; boolean authority = true, failRead;
        public Snapshot freshPrimary(String key) {
            calls++;
            if (!authority || failRead) throw new Unavailable("unproven authority or DB failure");
            return primary;
        }
        public Snapshot staleReplica(String key) {
            calls++; if (failRead) throw new Unavailable("DB failure"); return replica;
        }
    }
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static void fails(Runnable call, String reason) {
        try { call.run(); throw new AssertionError("expected " + reason); }
        catch (Unavailable expected) { check(expected.getMessage().contains(reason), expected.getMessage()); }
    }
    public static void main(String[] args) {
        long[] time = {0}; var cache = new MemoryCache(() -> time[0]);
        var origin = new FakeOrigin(); int[] remaining = {10};
        var service = new ReadPath(cache, origin, () -> remaining[0]-- > 0, () -> time[0], 100);
        var weak = new Request("feed:42", false, null);
        var strong = new Request("feed:42", true, new Floor("h1", 9));
        check(service.read(weak).body().equals("old feed"), "miss uses replica");
        check(service.read(weak).body().equals("old feed") && origin.calls == 1, "hit avoids origin");
        int cacheGets = cache.gets;
        check(service.read(strong).body().equals("post 9") && cache.gets == cacheGets, "strong bypasses old cache");
        remaining[0] = 0;
        fails(() -> service.read(strong), "budget"); // never fall back even though old cache exists
        remaining[0] = 10;
        origin.primary = new Snapshot("new branch, missing post 9", Map.of("h1", 8L, "h2", 100L));
        fails(() -> service.read(strong), "history"); // bigger numeric position on another history is insufficient
        origin.primary = new Snapshot("post 9 on promoted primary", Map.of("h1", 9L, "h2", 100L));
        check(service.read(strong).body().contains("promoted"), "verified ancestor prefix accepted");
        origin.authority = false;
        fails(() -> service.read(strong), "authority");
        origin.authority = true;
        cache.down = true; remaining[0] = 1;
        check(service.read(weak).body().equals("old feed"), "cache outage uses admitted origin");
        fails(() -> service.read(weak), "budget");
        cache.down = false; remaining[0] = 10; time[0] = 100;
        int calls = origin.calls;
        service.read(weak);
        check(origin.calls == calls + 1, "expiry equality is a miss");
        time[0] = 200; origin.failRead = true;
        fails(() -> service.read(weak), "DB failure");
        check(cache.entries.get("feed:42").expiresAt() == 200, "failed DB read does not extend cache");
        origin.failRead = false; time[0] = 300;
        var offsetClock = new ReadPath(cache, origin, () -> true, () -> time[0] + 10000, 100);
        offsetClock.read(weak);
        check(cache.entries.get("feed:42").expiresAt() == 400, "app clock origin never leaks into cache TTL");
        cache.entries.clear();
        Origin slow = new Origin() {
            public Snapshot freshPrimary(String key) { return origin.primary; }
            public Snapshot staleReplica(String key) { time[0] += 120; return origin.replica; }
        };
        new ReadPath(cache, slow, () -> true, () -> time[0], 100).read(weak);
        check(cache.entries.isEmpty(), "load consuming the TTL is not cached");
        System.out.println("PASS: miss/hit, strong bypass, no downgrade, failover histories, authority, outage budget, TTL, DB failure, different clocks, slow fill");
    }
}
