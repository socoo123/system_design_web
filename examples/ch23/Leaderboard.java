import java.util.*;

/** Java 17: pure ordering/merge/pagination; storage and signed cursors are adapters. */
public final class Leaderboard {
    public static final String ORDER_ID = "score-time-id-v1";
    public static final long MAX_C = 3_000_004_000_000L;

    // BEGIN order
    public record Entry(String member, int score, int second, long version) {
        public Entry {
            if (member == null || !member.matches("[0-9]{12}")
                    || score < 0 || score > 1_000_000
                    || second < 0 || second > 2_592_000
                    || version < 1 || version > 1_000_000_000L)
                throw new IllegalArgumentException("out of contract");
        }
        public long composite() {
            return score * 3_000_001L + (3_000_000L - second);
        }
    }
    public static final Comparator<Entry> ORDER = Comparator
            .comparingLong(Entry::composite).reversed()
            .thenComparing(Entry::member, Comparator.reverseOrder());
    // END order

    /** Trusted manifest identifies ONE immutable dataset, not just Redis layout epoch. */
    public record Manifest(String scope, String snapshot, String routing,
                           String order, Set<String> buckets) {
        public Manifest {
            Objects.requireNonNull(scope); Objects.requireNonNull(snapshot);
            Objects.requireNonNull(routing);
            if (!ORDER_ID.equals(order) || buckets == null || buckets.isEmpty())
                throw new IllegalArgumentException("manifest");
            buckets = Set.copyOf(buckets);
        }
    }
    /** Storage must attest first min(k,size) rows from the manifest's frozen bucket. */
    public record Head(String bucket, String scope, String snapshot, String routing,
                       String order, int requested, boolean complete, List<Entry> rows) {
        public Head { rows = List.copyOf(rows); }
    }

    // BEGIN merge
    public static List<Entry> topK(Manifest m, List<Head> heads, int k) {
        if (k < 1 || k > 100) throw new IllegalArgumentException("k");
        Set<String> seenBuckets = new HashSet<>(), seenPlayers = new HashSet<>();
        List<Entry> candidates = new ArrayList<>();
        for (Head h : heads) {
            if (!m.buckets().contains(h.bucket()) || !seenBuckets.add(h.bucket())
                    || !m.scope().equals(h.scope()) || !m.snapshot().equals(h.snapshot())
                    || !m.routing().equals(h.routing()) || !m.order().equals(h.order())
                    || !h.complete() || h.requested() != k || h.rows().size() > k)
                throw new IllegalStateException("incomplete or mixed snapshot");
            Entry previous = null;
            for (Entry e : h.rows()) {
                if (!seenPlayers.add(e.member())
                        || (previous != null && ORDER.compare(previous, e) > 0))
                    throw new IllegalStateException("duplicate player or unsorted head");
                candidates.add(e); previous = e;
            }
        }
        if (!seenBuckets.equals(m.buckets()))
            throw new IllegalStateException("missing bucket");
        return candidates.stream().sorted(ORDER).limit(k).toList();
    }
    // END merge

    public record Snapshot(String scope, String id, String order, long retainUntil,
                           List<Entry> rows) {
        public Snapshot {
            Objects.requireNonNull(scope); Objects.requireNonNull(id);
            if (!ORDER_ID.equals(order)) throw new IllegalArgumentException("order");
            List<Entry> sorted = rows.stream().sorted(ORDER).toList();
            if (sorted.stream().map(Entry::member).distinct().count() != sorted.size())
                throw new IllegalArgumentException("duplicate player");
            rows = sorted;
        }
    }
    // BEGIN page
    public record Cursor(String scope, String snapshot, String order, int offset) {}
    public record Page(List<Entry> rows, Cursor next) {}

    public static Page page(Snapshot s, Cursor c, int limit, long now) {
        if (now >= s.retainUntil()) throw new IllegalStateException("410 expired");
        if (limit < 1 || limit > 100) throw new IllegalArgumentException("limit");
        int start = c == null ? 0 : c.offset();
        if (c != null && (!s.scope().equals(c.scope())
                || !s.id().equals(c.snapshot()) || !s.order().equals(c.order())))
            throw new IllegalArgumentException("cursor binding");
        if (start < 0 || start > s.rows().size())
            throw new IllegalArgumentException("offset");
        int end = start + Math.min(limit, s.rows().size() - start);
        Cursor next = end == s.rows().size() ? null
                : new Cursor(s.scope(), s.id(), s.order(), end);
        return new Page(List.copyOf(s.rows().subList(start, end)), next);
    }
    // END page
}
