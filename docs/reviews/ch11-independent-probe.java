import java.util.*;
class Ch11IndependentProbe {
  static final class Permit implements FeedPage.View {
    boolean deny=false, change=false;
    public void requireReady() {}
    public boolean allows(long author) {return !deny || author%2==0;}
    public void checkStillCurrent() {if(change)throw new IllegalStateException("version changed");}
  }
  static FeedPage.Source src(List<FeedPage.Post> values, FeedPage.Key bound) {
    var iterator=values.stream().filter(p->bound==null||p.key().compareTo(bound)<0)
      .sorted(Comparator.comparing(FeedPage.Post::key).reversed()).map(p->new FeedPage.Candidate(p.key())).iterator();
    return ()->iterator.hasNext()?iterator.next():null;
  }
  static void require(boolean b,String m){if(!b)throw new AssertionError(m);}
  public static void main(String[] args) {
    int runs=0;
    var random=new Random(11311);
    for(int trial=0;trial<200;trial++) {
      var view=new Permit();view.deny=trial%2==0;
      var db=new HashMap<Long,FeedPage.Post>();
      var sources=new ArrayList<List<FeedPage.Post>>();
      for(int j=0;j<1+random.nextInt(8);j++)sources.add(new ArrayList<>());
      for(long id=1;id<=80;id++){
        var p=new FeedPage.Post(new FeedPage.Key(1000+random.nextInt(6),id),1+random.nextInt(6),random.nextInt(4)!=0);
        db.put(id,p);
        for(var source:sources)if(random.nextBoolean())source.add(p);
      }
      int limit=1+random.nextInt(20);
      FeedPage.Key bound=null;var seen=new LinkedHashSet<Long>();
      for(int pageNo=0;pageNo<100;pageNo++){
        final var before=bound;
        var flattened=sources.stream().flatMap(List::stream).filter(p->before==null||p.key().compareTo(before)<0)
          .sorted(Comparator.comparing(FeedPage.Post::key).reversed()).toList();
        var expected=new ArrayList<FeedPage.Post>();var ids=new HashSet<Long>();int used=0;FeedPage.Key last=null;
        for(var p:flattened){if(used==5*limit||expected.size()==limit)break;used++;last=p.key();if(ids.add(p.key().postId())&&p.live()&&view.allows(p.author()))expected.add(p);}
        var actual=FeedPage.readPage(limit,view,sources.stream().map(v->src(v,before)).toList(),db::get);
        require(actual.posts().equals(expected),"oracle output "+trial);
        require(actual.scanned()==used,"oracle consumed rows "+trial);
        boolean more=used<flattened.size();
        require(Objects.equals(actual.next(),more?last:null),"oracle cursor "+trial);
        require(actual.partial()==(more&&expected.size()<limit),"oracle partial "+trial);
        for(var p:actual.posts())require(seen.add(p.key().postId()),"no logical duplicate across pages");
        runs++;
        if(actual.next()==null)break;
        require(bound==null||actual.next().compareTo(bound)<0,"strict continuation progress");bound=actual.next();
        require(pageNo<99,"pagination terminates");
      }
      var expectedAll=sources.stream().flatMap(List::stream).filter(p->p.live()&&view.allows(p.author())).map(p->p.key().postId()).collect(java.util.stream.Collectors.toSet());
      require(seen.equals(expectedAll),"fixed snapshot has no omitted live authorized posts");
    }
    var view=new Permit();
    var deleted=new FeedPage.Post(new FeedPage.Key(1000,1),1,false);
    var shortPage=FeedPage.readPage(20,view,List.of(src(List.of(deleted),null)),id->deleted);
    require(shortPage.posts().isEmpty()&&shortPage.next()==null&&!shortPage.partial(),"confirmed exhausted short page is not budget-partial");
    System.out.println("RANDOM_ORACLE_PAGES="+runs+"; trials=200; fixed-set no loss/no duplicate PASS");
    System.out.println("EXHAUSTED_SHORT_PAGE={posts:0,next:null,partial:false}; PASS (caption now qualifies budget exhaustion)");
    var longDeleted=new ArrayList<FeedPage.Post>();
    for(long i=101;i>0;i--)longDeleted.add(new FeedPage.Post(new FeedPage.Key(1000,i),1,false));
    var budgetPage=FeedPage.readPage(20,view,List.of(src(longDeleted,null)),id->new FeedPage.Post(new FeedPage.Key(1000,id),1,false));
    require(budgetPage.posts().isEmpty()&&budgetPage.next()!=null&&budgetPage.partial()&&budgetPage.scanned()==100,"budget-exhausted short page retains continuation");
    System.out.println("BUDGET_SHORT_PAGE={posts:0,next:(1000,2),partial:true,scanned:100}; PASS");
    view.change=true;
    boolean denied=false;try{FeedPage.readPage(20,view,List.of(),id->null);}catch(IllegalStateException ok){denied=true;}
    require(denied,"empty result still validates current permission version");
    System.out.println("EMPTY_PAGE_PERMISSION_RECHECK=PASS");
  }
}
