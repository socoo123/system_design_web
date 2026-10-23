import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class SearchMerge {
  // BEGIN PAGE
  public record Hit(String id, double score, long tie) {}
  public record Reply(String shard, boolean ok, List<Hit> hits) {}
  public record Merged(List<Hit> hits, Set<String> missing) {
    public boolean complete() { return missing.isEmpty(); }
  }
  private static final Comparator<Hit> ORDER = Comparator
      .comparingDouble(Hit::score).reversed().thenComparingLong(Hit::tie);

  // Adapter supplies exact local top-k under the same view, filter and order.
  public static Merged merge(Set<String> expected, List<Reply> replies,
                             int k, boolean allowPartial) {
    if (k < 1 || expected.isEmpty()) throw new IllegalArgumentException("bounds");
    var seen = new HashSet<String>(); var ids = new HashSet<String>();
    var ties = new HashSet<Long>(); var good = new HashSet<String>();
    var candidates = new ArrayList<Hit>();
    for (Reply r : replies) {
      if (!expected.contains(r.shard()) || !seen.add(r.shard()))
        throw new IllegalArgumentException("unexpected/duplicate logical shard");
      if (!r.ok()) continue;                // timed-out hits cannot count
      if (r.hits().size() > k) throw new IllegalArgumentException("local limit");
      for (int i = 0; i < r.hits().size(); i++) {
        Hit h = r.hits().get(i);
        if (!Double.isFinite(h.score()) || !ids.add(h.id()) || !ties.add(h.tie()))
          throw new IllegalArgumentException("invalid/duplicate candidate");
        if (i > 0 && ORDER.compare(r.hits().get(i - 1), h) > 0)
          throw new IllegalArgumentException("unsorted local result");
        candidates.add(h);
      }
      good.add(r.shard());
    }
    var missing = new HashSet<>(expected); missing.removeAll(good);
    if (!allowPartial && !missing.isEmpty())
      throw new IllegalStateException("incomplete: " + missing);
    candidates.sort(ORDER);
    return new Merged(List.copyOf(candidates.subList(0, Math.min(k, candidates.size()))),
                      Set.copyOf(missing));
  }
  // END PAGE
}
