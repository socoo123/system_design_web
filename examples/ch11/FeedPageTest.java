import java.util.*;
import static java.util.stream.Collectors.toList;

public final class FeedPageTest {
  static int passed;
  static class Permissions implements FeedPage.View {
    boolean ready = true, changed;
    Set<Long> denied = new HashSet<>();
    public void requireReady() { if (!ready) throw new IllegalStateException("503 incomplete"); }
    public boolean allows(long author) { return !denied.contains(author); }
    public void checkStillCurrent() { if (changed) throw new IllegalStateException("409 changed"); }
  }
  static FeedPage.Post p(long time, long id, long author, boolean live) {
    return new FeedPage.Post(new FeedPage.Key(time, id), author, live);
  }
  static FeedPage.Source source(List<FeedPage.Post> posts, FeedPage.Key bound) {
    var sorted = posts.stream().filter(p -> bound == null || p.key().compareTo(bound) < 0)
        .sorted((a,b) -> b.key().compareTo(a.key())).map(p -> new FeedPage.Candidate(p.key())).iterator();
    return () -> sorted.hasNext() ? sorted.next() : null;
  }
  static FeedPage.Page read(int limit, Permissions view, FeedPage.Key bound,
                            List<List<FeedPage.Post>> lists) {
    var bodies = new HashMap<Long, FeedPage.Post>();
    lists.forEach(list -> list.forEach(p -> bodies.put(p.key().postId(), p)));
    return FeedPage.readPage(limit, view, lists.stream().map(l -> source(l, bound)).collect(toList()), bodies::get);
  }
  static void check(boolean ok, String name) {
    if (!ok) throw new AssertionError(name);
    System.out.println("PASS " + name); passed++;
  }
  static void rejects(Runnable run, String name) {
    try { run.run(); } catch (IllegalStateException | IllegalArgumentException e) {
      check(true, name); return;
    }
    throw new AssertionError(name);
  }
  public static void main(String[] args) {
    var v = new Permissions();
    var a = List.of(p(1000,42,1,true), p(1000,41,1,true), p(999,40,1,true));
    var b = List.of(p(1001,43,2,true), p(1000,42,1,true), p(998,39,2,true));
    var first = read(2,v,null,List.of(a,b));
    check(first.posts().stream().map(x -> x.key().postId()).toList().equals(List.of(43L,42L)), "merge all sources");
    var second = read(2,v,first.next(),List.of(a,b));
    check(second.posts().stream().map(x -> x.key().postId()).toList().equals(List.of(41L,40L)), "same millisecond tie survives seek");
    var all = read(20,v,null,List.of(a,b));
    check(all.posts().size()==5 && all.scanned()==6, "duplicate source row counted but emitted once");
    check(all.next()==null && !all.partial(), "confirmed exhaustion omits continuation");
    var many = new ArrayList<FeedPage.Post>();
    for(int i=100;i>0;i--) many.add(p(1000,i,1,i<98));
    var filled = read(20,v,null,List.of(many));
    check(filled.scanned()==23 && filled.next().postId()==78, "cursor stops at consumed row 23");
    var next = read(20,v,filled.next(),List.of(many));
    check(next.posts().get(0).key().postId()==77, "prefetch remainder is not skipped");
    var removed = new ArrayList<FeedPage.Post>();
    for(int i=101;i>0;i--) removed.add(p(1000,i,1,false));
    var partial = read(20,v,null,List.of(removed));
    check(partial.scanned()==100 && partial.partial() && partial.next()!=null, "deleted rows respect scan budget and progress");
    v.denied.add(2L);
    var allowed = read(20,v,null,List.of(a,b));
    check(allowed.posts().stream().allMatch(x -> x.author()!=2), "current permission filters cached candidates");
    v.changed=true;
    rejects(() -> read(20,v,null,List.of(a)), "concurrent follow/block version change rejects page");
    v.changed=false;v.ready=false;
    rejects(() -> read(20,v,null,List.of(a)), "incomplete heavy view is not an empty feed");
    v.ready=true;
    rejects(() -> FeedPage.readPage(20,v,List.of(() -> { throw new IllegalStateException("503 source"); }),id -> null), "source failure is not exhaustion");
    rejects(() -> FeedPage.readPage(20,v,List.of(source(a,null)),id -> { throw new IllegalStateException("503 body"); }), "body failure aborts complete page");
    rejects(() -> read(0,v,null,List.of(a)), "invalid limit rejected");
    var late=p(1002,44,1,true);
    var later=new ArrayList<>(a);later.add(late);
    check(read(20,v,first.next(),List.of(later,b)).posts().stream().noneMatch(x->x.key().postId()==44), "late fan-out above passed bound is omitted");
    check(read(20,v,null,List.of(later,b)).posts().get(0).key().postId()==44, "refresh sees late fan-out");
    rejects(() -> FeedPage.readPage(20,v,List.of(source(a,null)),id -> p(7,id,1,true)), "corrupt pointer cannot change the sort contract");
    System.out.println("JAVA_CHECKS="+passed);
  }
}
