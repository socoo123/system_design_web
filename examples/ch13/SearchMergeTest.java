import java.util.List;
import java.util.Set;
import java.util.ArrayList;
import java.util.Random;

public final class SearchMergeTest {
  private static int checks;
  static SearchMerge.Hit hit(String id, double score, long tie) {
    return new SearchMerge.Hit(id, score, tie);
  }
  static SearchMerge.Reply reply(String shard, SearchMerge.Hit... hits) {
    return new SearchMerge.Reply(shard, true, List.of(hits));
  }
  static void check(boolean ok, String name) {
    if (!ok) throw new AssertionError(name);
    checks++;
  }
  static void fails(Runnable action, String name) {
    try { action.run(); } catch (IllegalArgumentException | IllegalStateException e) {
      checks++; return;
    }
    throw new AssertionError(name);
  }
  public static void main(String[] args) {
    var shards = Set.of("A", "B");
    var a = reply("A", hit("a", 9, 1), hit("c", 7, 3));
    var b = reply("B", hit("b", 8, 2), hit("d", 6, 4));
    var page = SearchMerge.merge(shards, List.of(a, b), 2, false);
    check(page.complete() && page.hits().stream().map(SearchMerge.Hit::id).toList()
        .equals(List.of("a", "b")), "normal exact top-k");
    check(SearchMerge.merge(shards, List.of(reply("A", hit("x", 4, 8)),
        reply("B", hit("y", 4, 2))), 2, false).hits().get(0).id().equals("y"),
        "cross-shard deterministic tie");
    fails(() -> SearchMerge.merge(shards, List.of(a), 2, false), "missing shard");
    var failed = new SearchMerge.Reply("B", false, List.of(hit("ghost", 99, 99)));
    fails(() -> SearchMerge.merge(shards, List.of(a, failed), 2, false), "timeout");
    var partial = SearchMerge.merge(shards, List.of(a, failed), 2, true);
    check(!partial.complete() && partial.missing().equals(Set.of("B"))
        && partial.hits().equals(a.hits()), "partial explicitly identifies B");
    fails(() -> SearchMerge.merge(shards, List.of(a, a), 2, false), "duplicate replica");
    fails(() -> SearchMerge.merge(shards, List.of(a, reply("C")), 2, false), "unknown shard");
    fails(() -> SearchMerge.merge(shards, List.of(a,
        reply("B", hit("a", 8, 4))), 2, false), "duplicate document");
    fails(() -> SearchMerge.merge(shards, List.of(a,
        reply("B", hit("b", 8, 1))), 2, false), "duplicate PIT tie");
    fails(() -> SearchMerge.merge(shards, List.of(a,
        reply("B", hit("b", Double.NaN, 9))), 2, false), "NaN");
    fails(() -> SearchMerge.merge(shards, List.of(reply("A", hit("x", 1, 5),
        hit("y", 2, 6)), b), 2, false), "unsorted shard result");
    check(SearchMerge.merge(shards, List.of(reply("A"), reply("B")), 2, false)
        .hits().isEmpty(), "complete zero hits");
    var order = java.util.Comparator.comparingDouble(SearchMerge.Hit::score)
        .reversed().thenComparingLong(SearchMerge.Hit::tie);
    var rng = new Random(13);
    for (int round = 0; round < 100; round++) {
      var all = new ArrayList<SearchMerge.Hit>();
      var replies = new ArrayList<SearchMerge.Reply>();
      for (String shard : shards) {
        var local = new ArrayList<SearchMerge.Hit>();
        for (int i = 0; i < 50; i++) {
          long id = all.size(); var h = hit("d" + id, rng.nextInt(12), id);
          local.add(h); all.add(h);
        }
        local.sort(order);
        replies.add(new SearchMerge.Reply(shard, true, local.subList(0, 7)));
      }
      all.sort(order);
      check(SearchMerge.merge(shards, replies, 7, false).hits().equals(all.subList(0, 7)),
          "local top-k matches full oracle round " + round);
    }
    System.out.println("PASS " + checks + " Java 17 merge checks");
  }
}
