import java.util.*;

// Independent new fixtures against the actual author class; no ANN algorithm.
class Ch31IndependentProbe {
  static int checks;
  static void check(boolean ok,String name){checks++;if(!ok)throw new AssertionError(name);}
  static void reject(Runnable code,String name){boolean denied=false;try{code.run();}catch(IllegalArgumentException|IllegalStateException expected){denied=true;}check(denied,name);}
  static VectorCandidates.Point point(String tenant,String id,long version,String category,boolean dead,Double...vector){
    return new VectorCandidates.Point(new VectorCandidates.Key(tenant,id),version,"schema-review",category,dead,List.of(vector));
  }
  static VectorCandidates.Candidate candidate(VectorCandidates.Point p,long version){return new VectorCandidates.Candidate(p.key(),version,"schema-review");}
  public static void main(String[] args){
    var schema=new VectorCandidates.Schema("schema-review","encoder-review",3,VectorCandidates.Metric.COSINE);
    var near=point("tenant-r","z-near",8,"allowed",false,0.,6.,8.);
    var farther=point("tenant-r","a-far",13,"allowed",false,0.,0.,5.);
    var denied=point("tenant-r","private",17,"private",false,0.,3.,4.);
    var foreign=point("tenant-other","foreign",1,"allowed",false,0.,3.,4.);
    var dead=point("tenant-r","dead",20,"allowed",true,0.,3.,4.);
    Map<VectorCandidates.Key,VectorCandidates.Point> live=new HashMap<>();
    for(var p:List.of(near,farther,denied,foreign,dead))live.put(p.key(),p);
    var stream=List.of(candidate(foreign,1),candidate(dead,19),candidate(near,7),candidate(denied,17),candidate(farther,13),candidate(near,8),candidate(near,8));
    var result=VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,stream,2,20);
    check(result.hits().size()==2&&result.inspected()==7,"scope/version/tombstone/duplicate costs");
    check(result.hits().get(0).key().equals(near.key())&&Math.abs(result.hits().get(0).distance())<1e-12,"rescore normalized raw vector");
    check(Math.abs(result.hits().get(1).distance()-.2)<1e-12,"canonical cosine distance");
    check(result.status().equals("ALLOWED_SET_EXHAUSTED"),"all allowed returned");
    var fill=VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,List.of(candidate(farther,13)),1,3);
    check(fill.status().equals("K_REACHED")&&fill.hits().get(0).key().equals(farther.key()),"k fill still omits nearer point");
    var rejectBudget=VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,stream,2,4);
    check(rejectBudget.hits().isEmpty()&&rejectBudget.inspected()==4&&rejectBudget.status().equals("APPROX_SHORTFALL"),"invalid candidates exhaust real inspection budget");
    var empty=VectorCandidates.select(schema,"encoder-review","tenant-r","absent",List.of(0.,3.,4.),live,List.of(),2,5);
    check(empty.status().equals("ALLOWED_SET_EXHAUSTED")&&empty.hits().isEmpty(),"known empty allowed set");
    var staleOnly=VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,List.of(candidate(near,7)),2,5);
    check(staleOnly.hits().isEmpty()&&staleOnly.status().equals("APPROX_SHORTFALL"),"old version cannot read newest raw vector");
    reject(()->VectorCandidates.select(schema,"new-alias-model","tenant-r","allowed",List.of(0.,3.,4.),live,stream,2,10),"pinned model identity");
    reject(()->VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.),live,stream,2,10),"dimension gate");
    reject(()->VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,0.,0.),live,stream,2,10),"cosine zero gate");
    reject(()->VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,Double.POSITIVE_INFINITY,1.),live,stream,2,10),"nonfinite query gate");
    reject(()->VectorCandidates.select(schema,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,List.of(new VectorCandidates.Candidate(near.key(),8,"other-schema")),1,10),"mixed schema fails closed");
    for(var metric:List.of(VectorCandidates.Metric.INNER_PRODUCT,VectorCandidates.Metric.SQUARED_L2)){
      var s=new VectorCandidates.Schema("schema-review","encoder-review",3,metric);
      var r=VectorCandidates.select(s,"encoder-review","tenant-r","allowed",List.of(0.,3.,4.),live,stream,2,10);
      check(r.hits().get(0).distance()<=r.hits().get(1).distance(),"low-first direction "+metric);
    }
    var overflow=point("tenant-r","huge",1,"allowed",false,1e308,0.,0.);
    var l2=new VectorCandidates.Schema("schema-review","encoder-review",3,VectorCandidates.Metric.SQUARED_L2);
    reject(()->VectorCandidates.select(l2,"encoder-review","tenant-r","allowed",List.of(-1e308,0.,0.),Map.of(overflow.key(),overflow),List.of(candidate(overflow,1)),1,5),"distance overflow gate");
    System.out.println("{\"passed\":true,\"independent_checks\":"+checks+"}");
  }
}
