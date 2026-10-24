import java.util.*;
class Ch23IndependentProbe {
 static int count;
 static final Comparator<Leaderboard.Entry> ORACLE = Comparator.comparingInt(Leaderboard.Entry::score).reversed()
     .thenComparingInt(Leaderboard.Entry::second).thenComparing(Leaderboard.Entry::member,Comparator.reverseOrder());
 static void check(String name,boolean ok){if(!ok)throw new AssertionError(name);count++;System.out.println("PASS "+name);}
 static void reject(String name,Runnable run){try{run.run();}catch(IllegalArgumentException|IllegalStateException good){check(name,true);return;}throw new AssertionError(name);}
 static Leaderboard.Entry entry(int id,int score,int second){return new Leaderboard.Entry(String.format(Locale.ROOT,"%012d",id),score,second,17);}
 static Leaderboard.Head head(Leaderboard.Manifest m,String bucket,List<Leaderboard.Entry> rows,int k){return new Leaderboard.Head(bucket,m.scope(),m.snapshot(),m.routing(),m.order(),k,true,rows.stream().sorted(ORACLE).limit(k).toList());}
 public static void main(String[]args){
  var max=entry(1,1_000_000,0);var low=entry(2,0,2_592_000);
  check("composite maximum independently recomputed",max.composite()==1_000_000L*3_000_001L+3_000_000L&&max.composite()<(1L<<53));
  check("whole-point precedence at opposite time bounds",Leaderboard.ORDER.compare(entry(1,101,2_592_000),entry(999,100,0))<0);
  check("same-second reverse fixed ASCII ID",Leaderboard.ORDER.compare(entry(103,77,99),entry(102,77,99))<0);
  List<Leaderboard.Entry> all=new ArrayList<>();Map<String,List<Leaderboard.Entry>> buckets=new LinkedHashMap<>();
  for(String b:List.of("west","central","east"))buckets.put(b,new ArrayList<>());
  Random rng=new Random(57291);
  for(int i=1;i<=157;i++){var e=entry(i,rng.nextInt(9),rng.nextInt(5));all.add(e);buckets.get(List.of("west","central","east").get(i%3)).add(e);}
  var manifest=new Leaderboard.Manifest("game:season:global","immutable-cut-31","route-r7",Leaderboard.ORDER_ID,buckets.keySet());
  for(int k:List.of(1,3,7,100)){
   List<Leaderboard.Head> heads=buckets.entrySet().stream().map(x->head(manifest,x.getKey(),x.getValue(),k)).toList();
   check("three-bucket exact topK oracle K="+k,Leaderboard.topK(manifest,heads,k).equals(all.stream().sorted(ORACLE).limit(k).toList()));
  }
  int k=7;var heads=buckets.entrySet().stream().map(x->head(manifest,x.getKey(),x.getValue(),k)).toList();
  reject("missing destination refuses exact result",()->Leaderboard.topK(manifest,heads.subList(0,2),k));
  reject("routing version mismatch",()->Leaderboard.topK(manifest,List.of(heads.get(0),heads.get(1),new Leaderboard.Head("east",manifest.scope(),manifest.snapshot(),"route-r6",manifest.order(),k,true,heads.get(2).rows())),k));
  reject("snapshot mismatch",()->Leaderboard.topK(manifest,List.of(heads.get(0),heads.get(1),new Leaderboard.Head("east",manifest.scope(),"cut-30",manifest.routing(),manifest.order(),k,true,heads.get(2).rows())),k));
  reject("partial bucket refuses exact result",()->Leaderboard.topK(manifest,List.of(heads.get(0),heads.get(1),new Leaderboard.Head("east",manifest.scope(),manifest.snapshot(),manifest.routing(),manifest.order(),k,false,heads.get(2).rows())),k));
  reject("wrong requested K refuses exact result",()->Leaderboard.topK(manifest,List.of(heads.get(0),heads.get(1),new Leaderboard.Head("east",manifest.scope(),manifest.snapshot(),manifest.routing(),manifest.order(),6,true,heads.get(2).rows())),k));
  var reversed=new ArrayList<>(heads.get(2).rows());Collections.reverse(reversed);
  reject("unsorted bucket rejected",()->Leaderboard.topK(manifest,List.of(heads.get(0),heads.get(1),new Leaderboard.Head("east",manifest.scope(),manifest.snapshot(),manifest.routing(),manifest.order(),k,true,reversed)),k));
  reject("same player in two buckets rejected",()->Leaderboard.topK(manifest,List.of(heads.get(0),new Leaderboard.Head("central",manifest.scope(),manifest.snapshot(),manifest.routing(),manifest.order(),k,true,heads.get(0).rows()),heads.get(2)),k));
  var source=new ArrayList<>(all);var snap=new Leaderboard.Snapshot(manifest.scope(),manifest.snapshot(),manifest.order(),1000,source);source.clear();
  var collected=new ArrayList<Leaderboard.Entry>();Leaderboard.Cursor cursor=null;int pages=0;
  do{var page=Leaderboard.page(snap,cursor,13,999);collected.addAll(page.rows());cursor=page.next();pages++;}while(cursor!=null);
  check("all immutable pages equal full tuple order despite source mutation",collected.equals(all.stream().sorted(ORACLE).toList())&&pages==13);
  var wrong=new Leaderboard.Cursor(manifest.scope(),"new-cut",manifest.order(),13);
  reject("cursor cannot cross snapshots",()->Leaderboard.page(snap,wrong,13,999));
  reject("cursor comparator mismatch",()->Leaderboard.page(snap,new Leaderboard.Cursor(manifest.scope(),manifest.snapshot(),"old-order",13),13,999));
  reject("cursor offset cannot exceed retained dataset",()->Leaderboard.page(snap,new Leaderboard.Cursor(manifest.scope(),manifest.snapshot(),manifest.order(),158),13,999));
  reject("expiry boundary is rejected",()->Leaderboard.page(snap,null,13,1000));
  reject("invalid ID format rejected",()->new Leaderboard.Entry("00000000000x",1,1,1));
  reject("score bound rejected",()->entry(1,1_000_001,0));
  System.out.println("INDEPENDENT_JAVA_CHECKS="+count);
 }
}
