import java.util.*;

// Independent inputs against the actual chapter core, not a storage or load test.
class RootNearbyProbe {
  static int assertions;
  static void check(boolean ok, String reason) { assertions++; if(!ok) throw new AssertionError(reason); }
  static void unavailable(Runnable f, String why) { try { f.run(); throw new AssertionError(why); }
    catch (Nearby.Unavailable expected) { assertions++; } }
  static Nearby.Point destination(Nearby.Point q, double metres, double degrees) {
    double p=Math.toRadians(q.lat()), l=Math.toRadians(q.lon()), b=Math.toRadians(degrees), a=metres/Nearby.R;
    double lat=Math.asin(Math.sin(p)*Math.cos(a)+Math.cos(p)*Math.sin(a)*Math.cos(b));
    double lon=l+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(p),Math.cos(a)-Math.sin(p)*Math.sin(lat));
    double d=Math.toDegrees(lon); d=((d+180)%360+360)%360-180;
    return new Nearby.Point(Math.toDegrees(lat),d);
  }
  static Nearby.Row row(long id,long version,Nearby.Point p,boolean open,boolean deleted,
      boolean mover,long observed,boolean published,Set<Long> audience) {
    return new Nearby.Row(id,version,p,"cafe",deleted,open,mover,observed,published,audience);
  }
  static List<Nearby.Hit> rank(Nearby.Point q,Collection<Nearby.Member> m,Map<Long,Optional<Nearby.Row>> a,long by,long error) {
    return Nearby.rank(q,1000,"cafe",77,m,a,by,error,10000);
  }
  public static void main(String[] args) {
    var centres=List.of(new Nearby.Point(40,116.4),new Nearby.Point(0,179.999),
      new Nearby.Point(-60,-179.999),new Nearby.Point(89.999,72),new Nearby.Point(-89.999,-110),new Nearby.Point(0,-180));
    int sampled=0;
    for(var q:centres) for(double r:new double[]{500,1000,2000,5000}) {
      int precision=Math.abs(q.lat())>85?4:6;
      var cover=Nearby.cover(q,r,precision,1000000);
      for(int bearing=0;bearing<360;bearing+=5) for(double fraction:new double[]{0,0.1,0.5,0.99999999}) {
        var p=destination(q,r*fraction,bearing);
        check(cover.contains(Nearby.cell(p,precision)),"missing spherical candidate "+q+" r="+r+" b="+bearing);
        sampled++;
      }
    }
    var q=new Nearby.Point(40,116.4);
    unavailable(()->Nearby.cover(q,5000,6,1),"truncated cover must not succeed");
    var inside=destination(q,12,30);
    var members=new ArrayList<Nearby.Member>();
    var authority=new HashMap<Long,Optional<Nearby.Row>>();
    for(long id=1;id<=21;id++) { members.add(new Nearby.Member(id,1));
      authority.put(id,Optional.of(row(id,1,destination(q,id,0),id==21,false,false,0,true,Set.of()))); }
    var only=rank(q,members,authority,100000,0);
    check(only.size()==1&&only.get(0).id()==21,"business filters must precede top20");
    members=new ArrayList<>(List.of(new Nearby.Member(500,1),new Nearby.Member(500,2)));
    authority=new HashMap<>(Map.of(500L,Optional.of(row(500,3,inside,true,false,false,0,true,Set.of()))));
    var latest=rank(q,members,authority,100000,0);
    check(latest.size()==1&&latest.get(0).version()==3,"hydrate latest then deduplicate/rank");
    var recalled=List.of(new Nearby.Member(500,4));
    var a=authority;
    unavailable(()->rank(q,recalled,a,100000,0),"lagging authority must fail explicitly");
    unavailable(()->rank(q,List.of(new Nearby.Member(501,1)),Map.of(),100000,0),"unknown authority is not absence");
    check(rank(q,List.of(new Nearby.Member(501,1)),Map.of(501L,Optional.empty()),100000,0).isEmpty(),"confirmed absence skips");
    var priv=List.of(new Nearby.Member(900,1));
    var privateRow=row(900,1,destination(q,156,90),true,false,true,70000,false,Set.of(77L));
    var allowed=rank(q,priv,Map.of(900L,Optional.of(privateRow)),100000,0);
    check(allowed.size()==1&&allowed.get(0).publicPin()==null&&allowed.get(0).displayMetres()==100,"private output bucket, no pin");
    check(rank(q,priv,Map.of(900L,Optional.of(privateRow)),100001,0).isEmpty(),"strict 30-second sample age");
    check(rank(q,priv,Map.of(900L,Optional.of(privateRow)),100000,1).isEmpty(),"clock uncertainty consumes freshness margin");
    var denied=row(900,1,inside,true,false,true,99000,false,Set.of(88L));
    check(rank(q,priv,Map.of(900L,Optional.of(denied)),100000,0).isEmpty(),"authorization before distance disclosure");
    var deleted=row(900,2,inside,true,true,false,0,true,Set.of());
    check(rank(q,priv,Map.of(900L,Optional.of(deleted)),100000,0).isEmpty(),"authoritative deletion wins old index");
    var tied=List.of(new Nearby.Member(8,1),new Nearby.Member(3,1));
    var ties=rank(q,tied,Map.of(8L,Optional.of(row(8,1,inside,true,false,false,0,true,Set.of())),
      3L,Optional.of(row(3,1,inside,true,false,false,0,true,Set.of()))),100000,0);
    check(ties.get(0).id()==3&&ties.get(1).id()==8,"stable id tie-break");
    System.out.println("{\"passed\":true,\"assertions\":"+assertions+",\"sampledDestinations\":"+sampled+"}");
  }
}
