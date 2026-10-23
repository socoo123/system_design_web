import java.util.*;

/** Java 17 teaching core. Storage, cursor signing and HTTP are adapters. */
public final class FeedPage {
  public record Key(long createdAt, long postId) implements Comparable<Key> {
    public int compareTo(Key other) {
      int time = Long.compare(createdAt, other.createdAt);
      return time != 0 ? time : Long.compare(postId, other.postId);
    }
  }
  public record Candidate(Key key) {}
  public record Post(Key key, long author, boolean live) {}
  public interface Source {
    // Strict descending order, already restricted to key < cursor and retention.
    // null means confirmed exhaustion; an unavailable source MUST throw.
    Candidate next();
  }
  public interface View {
    // All sources ready; signed cursor belongs to viewer/version/snapshot.
    void requireReady();
    boolean allows(long author);
    // Recheck authoritative follow/block version before sending; 409 on change.
    void checkStillCurrent();
  }
  public interface Bodies { Post load(long postId); } // unavailable => throw
  public record Page(List<Post> posts, Key next, boolean partial, int scanned) {}
  private record Head(Candidate item, Source source) {}

  // BEGIN PAGE SNIPPET
  public static Page readPage(int limit, View view, List<Source> sources,
                              Bodies bodies) {
    if (limit < 1 || limit > 50) throw new IllegalArgumentException("limit");
    view.requireReady();
    var heap = new PriorityQueue<Head>(
        (a, b) -> b.item.key.compareTo(a.item.key));
    for (Source source : sources) {
      Candidate first = source.next();
      if (first != null) heap.add(new Head(first, source));
    }
    var seen = new HashSet<Long>();
    var out = new ArrayList<Post>();
    Key last = null;
    int scanned = 0;
    while (!heap.isEmpty() && out.size() < limit && scanned < 5 * limit) {
      Head head = heap.remove();
      Candidate candidate = head.item;
      last = candidate.key; // consumed, not merely prefetched
      scanned++;
      Candidate next = head.source.next();
      if (next != null) heap.add(new Head(next, head.source));
      if (!seen.add(candidate.key.postId)) continue;
      Post post = bodies.load(candidate.key.postId);
      if (post == null) continue;
      if (!post.key.equals(candidate.key))
        throw new IllegalStateException("corrupt pointer");
      if (post.live && view.allows(post.author)) out.add(post);
    }
    view.checkStillCurrent(); // also required for an empty page
    boolean more = !heap.isEmpty();
    return new Page(List.copyOf(out), more ? last : null,
                    more && out.size() < limit, scanned);
  }
  // END PAGE SNIPPET
}
