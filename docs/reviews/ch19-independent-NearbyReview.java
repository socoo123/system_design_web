import java.util.*;
import static java.lang.Math.*;

/** Independent probes against the actual author implementation; Java17, no dependencies. */
class NearbyReview {
  static int assertions=0, circles=0;
  static void ck(boolean ok,String label){assertions++;if(!ok)throw new AssertionError(label);}
  static void unavailable(Runnable action,String label){
    try{action.run();throw new AssertionError(label);}catch(Nearby.Unavailable expected){assertions++;}
  }
  static Nearby.Point destination(Nearby.Point center,double metres,double degrees){
    // Independent 3D tangent-vector rotation, not the author's forward-latitude formula.
    double p=toRadians(center.lat()),l=toRadians(center.lon()),a=metres/Nearby.R,b=toRadians(degrees);
    double[] c={cos(p)*cos(l),cos(p)*sin(l),sin(p)};
    double[] east={-sin(l),cos(l),0},north={-sin(p)*cos(l),-sin(p)*sin(l),cos(p)},v=new double[3];
    for(int j=0;j<3;j++)v[j]=cos(a)*c[j]+sin(a)*(cos(b)*north[j]+sin(b)*east[j]);
    return new Nearby.Point(toDegrees(atan2(v[2],hypot(v[0],v[1]))),toDegrees(atan2(v[1],v[0])));
  }
  static Nearby.Cell ownCell(Nearby.Point q,int p){
    int longitudeBits=(5*p+1)/2,latitudeBits=5*p/2;
    int x=(int)floor((q.lon()+180)*pow(2,longitudeBits)/360);
    int y=(int)floor((q.lat()+90)*pow(2,latitudeBits)/180);
    return new Nearby.Cell(min((1<<longitudeBits)-1,max(0,x)),min((1<<latitudeBits)-1,max(0,y)),p);
  }
  static double vectorDistance(Nearby.Point a,Nearby.Point b){
    double p=toRadians(a.lat()),l=toRadians(a.lon()),q=toRadians(b.lat()),m=toRadians(b.lon());
    double[] x={cos(p)*cos(l),cos(p)*sin(l),sin(p)},y={cos(q)*cos(m),cos(q)*sin(m),sin(q)};
    double cross=hypot(hypot(x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2]),x[0]*y[1]-x[1]*y[0]);
    return Nearby.R*atan2(cross,x[0]*y[0]+x[1]*y[1]+x[2]*y[2]);
  }
  static Nearby.Row row(long id,long v,Nearby.Point p,boolean mover,long observed,boolean pub,Set<Long> audience){
    return new Nearby.Row(id,v,p,"cafe",false,true,mover,observed,pub,audience);
  }
  static List<Nearby.Hit> rank(Collection<Nearby.Member> members,Map<Long,Optional<Nearby.Row>> rows,long send,long error){
    return Nearby.rank(new Nearby.Point(12.34,179.999),2000,"cafe",302,members,rows,send,error,1000);
  }
  public static void main(String[] args){
    List<Nearby.Point> centers=List.of(new Nearby.Point(41.7151,44.8271),new Nearby.Point(19.0760,72.8777),
      new Nearby.Point(-54.8019,-68.3030),new Nearby.Point(-17.7134,179.99998),new Nearby.Point(1.5,-179.99998),
      new Nearby.Point(82.501,7.25),new Nearby.Point(-84.1,149.7),new Nearby.Point(89.98,-157),
      new Nearby.Point(-89.98,18),new Nearby.Point(0,0.0054931640625));
    for(Nearby.Point center:centers)for(double radius:new double[]{500,1000,2000,5000}){
      int precision=abs(center.lat())>89?4:6;
      Set<Nearby.Cell> cover=Nearby.cover(center,radius,precision,100000);
      circles++;
      for(int bearing=0;bearing<360;bearing++)for(double factor:new double[]{0,0.2,0.99999999,1}){
        Nearby.Point point=destination(center,radius*factor,bearing);
        ck(cover.contains(ownCell(point,precision)),"uncovered 3D sample "+center+"/"+radius+"/"+bearing);
        ck(abs(Nearby.distance(center,point)-vectorDistance(center,point))<1e-5,"sphere model disagreement");
      }
      ck(Nearby.cover(center,radius,precision,cover.size()).equals(cover),"exact cover budget");
      if(cover.size()>1)unavailable(()->Nearby.cover(center,radius,precision,cover.size()-1),"budget cannot truncate");
    }
    for(int p=1;p<=6;p++)ck(Nearby.cell(new Nearby.Point(-13.123,179.999),p).equals(ownCell(new Nearby.Point(-13.123,179.999),p)),"independent bins");
    ck(Nearby.cell(new Nearby.Point(0,180),6).equals(ownCell(new Nearby.Point(0,-180),6)),"canonical dateline");
    unavailable(()->Nearby.cover(new Nearby.Point(90,8),5000,6,200),"polar work fails closed");
    Map<Long,Optional<Nearby.Row>> rows=new HashMap<>();List<Nearby.Member> members=new ArrayList<>();
    Nearby.Point query=new Nearby.Point(12.34,179.999);
    List<Long> expected=new ArrayList<>();Map<Long,Double> distances=new HashMap<>();
    for(long id=1;id<=120;id++){
      double metres=(121-id)*12;
      Nearby.Point point=destination(query,metres,id*29%360);
      boolean open=id%5!=0,deleted=id%13==0,mover=id%3==0,pub=id%4!=0;
      Set<Long> audience=id%7==0?Set.of():Set.of(302L);
      String type=id%11==0?"pharmacy":"cafe";
      Nearby.Row r=new Nearby.Row(id,9,point,type,deleted,open,mover,1_990_000,pub,audience);
      rows.put(id,Optional.of(r));members.add(new Nearby.Member(id,8));
      if(id%2==0)members.add(new Nearby.Member(id,9));
      if(open&&!deleted&&type.equals("cafe")&&((pub&&!mover)||audience.contains(302L))){expected.add(id);distances.put(id,vectorDistance(query,point));}
    }
    expected.sort(Comparator.comparingDouble((Long id)->distances.get(id)).thenComparingLong(id->id));
    List<Nearby.Hit> result=rank(members,rows,2_000_000,250);
    ck(result.size()==20,"limit after all filters");
    ck(result.stream().map(Nearby.Hit::id).toList().equals(expected.subList(0,20)),"global order against vector oracle");
    for(Nearby.Hit hit:result){Nearby.Row r=rows.get(hit.id()).get();ck(hit.version()==9,"authority version");
      if(r.mover())ck(hit.publicPin()==null&&hit.displayMetres()==floor(Nearby.distance(query,r.point())/100)*100,"private redaction after ranking");}
    long target=result.get(0).id();Nearby.Row before=rows.get(target).get();
    rows.put(target,Optional.of(row(target,10,destination(query,2501,75),false,0,true,Set.of())));
    ck(rank(members,rows,2_000_000,0).stream().noneMatch(h->h.id()==target),"authority moved outside despite recalled index ID");
    rows.put(target,Optional.of(row(target,11,destination(query,3,90),false,0,true,Set.of())));
    ck(rank(members,rows,2_000_000,0).get(0).id()==target,"new authority point rather than old distance");
    List<Nearby.Member> missing=List.of(new Nearby.Member(9001,1));
    unavailable(()->rank(missing,rows,2_000_000,0),"missing authority cannot mean deleted");
    rows.put(9001L,Optional.empty());ck(rank(missing,rows,2_000_000,0).isEmpty(),"confirmed absence");
    rows.put(9001L,Optional.of(row(9001,2,query,false,0,true,Set.of())));
    unavailable(()->rank(List.of(new Nearby.Member(9001,3)),rows,2_000_000,0),"authority behind member");
    rows.put(9001L,Optional.of(row(9002,3,query,false,0,true,Set.of())));
    unavailable(()->rank(missing,rows,2_000_000,0),"authority ID mismatch");
    rows.put(9001L,Optional.of(row(9001,4,query,true,1_970_250,true,Set.of(302L))));
    ck(rank(missing,rows,2_000_000,250).size()==1,"age upper exactly 30s");
    ck(rank(missing,rows,2_000_001,250).isEmpty(),"send 1ms later fails age");
    ck(rank(missing,rows,2_000_000,251).isEmpty(),"clock error 1ms larger fails age");
    rows.put(9001L,Optional.of(row(9001,5,query,true,2_000_251,true,Set.of(302L))));
    ck(rank(missing,rows,2_000_000,250).isEmpty(),"future outside verified clock bound");
    rows.put(9001L,Optional.of(row(9001,6,query,true,2_000_250,true,Set.of(302L))));
    ck(rank(missing,rows,2_000_000,250).size()==1,"future at verified clock bound");
    rows.put(9001L,Optional.of(row(9001,7,query,true,1_999_999,true,Set.of())));
    ck(rank(missing,rows,2_000_000,0).isEmpty(),"mover audience withdrawn despite public bit");
    ck(rank(List.of(),rows,2_000_000,0).isEmpty(),"authority-only ID is not recalled");
    rows.put(111L,Optional.of(row(111,1,query,false,0,true,Set.of())));
    rows.put(112L,Optional.of(row(112,1,query,false,0,true,Set.of())));
    ck(rank(List.of(new Nearby.Member(112,1),new Nearby.Member(111,1)),rows,0,0).get(0).id()==111,"exact distance tie by ID");
    unavailable(()->Nearby.rank(query,2000,"cafe",302,members,rows,2_000_000,0,members.size()-1),"raw candidate budget fails explicitly");
    System.out.println("{\"passed\":true,\"assertions\":"+assertions+",\"independentVectorCircles\":"+circles+"}");
  }
}
