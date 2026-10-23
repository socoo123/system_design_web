import java.util.*;

// Independent exhaustive oracle against the author's unmodified Java core.
class Ch13IndependentMergeOracle {
  static final List<String> SHARDS = List.of("A","B","C","D");
  static final Set<String> EXPECTED = new HashSet<>(SHARDS);
  static int assertions, corpora;
  static final Comparator<SearchMerge.Hit> ORACLE = (a,b) -> {
    if (a.score() > b.score()) return -1;
    if (a.score() < b.score()) return 1;
    return Long.compare(a.tie(),b.tie());
  };
  static void check(boolean value, String message) {
    if(!value) throw new AssertionError(message);
    assertions++;
  }
  static void rejected(Runnable action) {
    try { action.run(); } catch(IllegalArgumentException | IllegalStateException e) {
      assertions++; return;
    }
    throw new AssertionError("malformed/incomplete reply accepted");
  }
  static void runCorpus(int[] counts, int[] scores) {
    var all = new ArrayList<SearchMerge.Hit>();
    var local = new ArrayList<List<SearchMerge.Hit>>();
    int id = 0;
    for(int count:counts) {
      var one = new ArrayList<SearchMerge.Hit>();
      for(int j=0;j<count;j++,id++) {
        var h = new SearchMerge.Hit("id"+id,scores[id]-1,-(id+1));
        all.add(h); one.add(h);
      }
      one.sort(ORACLE); local.add(one);
    }
    all.sort(ORACLE); corpora++;
    for(int k=1;k<=4;k++) {
      var replies = new ArrayList<SearchMerge.Reply>();
      for(int s=0;s<4;s++) {
        var hits=local.get(s);
        replies.add(new SearchMerge.Reply(SHARDS.get(s),true,
            hits.subList(0,Math.min(k,hits.size()))));
      }
      Collections.reverse(replies); // execution arrival differs from shard order
      var actual = SearchMerge.merge(EXPECTED,replies,k,false);
      check(actual.complete(),"complete shards marked missing");
      check(actual.hits().equals(all.subList(0,Math.min(k,all.size()))),
            "local prefixes differ from whole-corpus sort");
    }
  }
  static void scorePatterns(int[] counts,int[] scores,int i) {
    if(i==scores.length) { runCorpus(counts,scores); return; }
    for(int score=0;score<3;score++) { scores[i]=score; scorePatterns(counts,scores,i+1); }
  }
  public static void main(String[] args) {
    for(int shape=0;shape<81;shape++) {
      int value=shape,total=0; int[] counts=new int[4];
      for(int s=0;s<4;s++) { counts[s]=value%3; total+=counts[s]; value/=3; }
      scorePatterns(counts,new int[total],0);
    }
    var hit = new SearchMerge.Hit("a",1,1);
    var a = new SearchMerge.Reply("A",true,List.of(hit));
    var b = new SearchMerge.Reply("B",false,List.of(new SearchMerge.Hit("ghost",999,2)));
    rejected(() -> SearchMerge.merge(Set.of("A","B"),List.of(a,b),1,false));
    var partial=SearchMerge.merge(Set.of("A","B"),List.of(a,b),1,true);
    check(partial.hits().equals(List.of(hit)) && partial.missing().equals(Set.of("B")),
          "failed-shard candidates leaked into explicit partial");
    rejected(() -> SearchMerge.merge(Set.of("A","B"),List.of(a,a),1,false));
    rejected(() -> SearchMerge.merge(Set.of("A"),List.of(
        new SearchMerge.Reply("A",true,List.of(new SearchMerge.Hit("x",Double.POSITIVE_INFINITY,1)))),1,false));
    rejected(() -> SearchMerge.merge(Set.of("A"),List.of(
        new SearchMerge.Reply("A",true,List.of(new SearchMerge.Hit("x",0,1),new SearchMerge.Hit("y",1,2)))),2,false));
    System.out.printf("PASS independent oracle: %,d corpora; %,d assertions; Java %s%n",
                      corpora,assertions,System.getProperty("java.version"));
  }
}
