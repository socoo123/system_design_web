import java.util.*;

/** Java 17 CPU model. Candidate order is supplied; this is not an ANN engine. */
public final class VectorCandidates {
  public enum Metric { COSINE, SQUARED_L2, INNER_PRODUCT }
  public record Schema(String id, String model, int dims, Metric metric) {
    public Schema { if (id == null || model == null || dims < 1 || metric == null) throw new IllegalArgumentException("schema"); }
  }
  public record Key(String tenant, String id) {}
  public record Candidate(Key key, long version, String schemaId) {}
  public record Point(Key key, long version, String schemaId, String category,
                      boolean deleted, List<Double> vector) {
    public Point { vector = List.copyOf(vector); }
  }
  public record Hit(Key key, long version, double distance) {}
  public record Result(List<Hit> hits, String status, int inspected) {}

  static double[] checked(Schema schema, List<Double> values) {
    if (values.size() != schema.dims()) throw new IllegalArgumentException("dimension");
    double[] v = new double[values.size()];
    double norm = 0;
    for (int i = 0; i < v.length; i++) {
      v[i] = values.get(i);
      if (!Double.isFinite(v[i])) throw new IllegalArgumentException("nonfinite vector");
      norm = Math.hypot(norm, v[i]);
    }
    if (schema.metric() == Metric.COSINE) {
      if (!(norm > 0) || !Double.isFinite(norm)) throw new IllegalArgumentException("cosine norm");
      for (int i = 0; i < v.length; i++) v[i] /= norm;
    }
    return v;
  }
  static double distance(Schema schema, double[] q, double[] v) {
    double sum = 0;
    for (int i = 0; i < q.length; i++) {
      if (schema.metric() == Metric.SQUARED_L2) sum += (q[i] - v[i]) * (q[i] - v[i]);
      else sum += q[i] * v[i];
    }
    double d = switch (schema.metric()) {
      case SQUARED_L2 -> sum;
      case INNER_PRODUCT -> -sum;
      case COSINE -> 1 - Math.max(-1, Math.min(1, sum));
    };
    if (!Double.isFinite(d)) throw new IllegalArgumentException("nonfinite distance");
    return d;
  }

  // BEGIN select
  public static Result select(Schema schema, String queryModel, String tenant,
      String category, List<Double> query, Map<Key, Point> pinnedLive,
      List<Candidate> stream, int k, int inspectLimit) {
    if (!schema.model().equals(queryModel) || k < 1 || k > 100 ||
        inspectLimit < k || inspectLimit > 100) throw new IllegalArgumentException("request");
    double[] q = checked(schema, query);
    Map<Key, Point> live = Map.copyOf(pinnedLive); // one immutable read cut
    Set<Key> allowed = new HashSet<>();
    for (Point p : live.values())
      if (!p.deleted() && p.key().tenant().equals(tenant) &&
          p.schemaId().equals(schema.id()) && p.category().equals(category))
        allowed.add(p.key());
    Map<Key, Hit> hits = new HashMap<>();
    int inspected = 0;
    for (Candidate c : stream) {
      if (inspected == inspectLimit) break;
      inspected++; // denied, stale and duplicate candidates also cost budget
      if (!schema.id().equals(c.schemaId())) throw new IllegalStateException("mixed schema");
      Point p = live.get(c.key());
      if (p == null || !allowed.contains(c.key()) || p.version() != c.version()) continue;
      if (hits.containsKey(c.key())) continue;
      double d = distance(schema, q, checked(schema, p.vector()));
      hits.put(c.key(), new Hit(c.key(), p.version(), d));
    }
    List<Hit> ranked = hits.values().stream()
        .sorted(Comparator.comparingDouble(Hit::distance)
            .thenComparing(h -> h.key().id())).limit(k).toList();
    String status = ranked.size() == allowed.size() ? "ALLOWED_SET_EXHAUSTED"
        : ranked.size() == k ? "K_REACHED" : "APPROX_SHORTFALL";
    return new Result(ranked, status, inspected);
  }
  // END select

  static int checks;
  static void expect(boolean ok) { checks++; if (!ok) throw new AssertionError("check " + checks); }
  static void rejects(Runnable r) {
    boolean rejected = false;
    try { r.run(); } catch (IllegalArgumentException | IllegalStateException expected) { rejected = true; }
    expect(rejected);
  }
  static Point point(String tenant, String id, long version, String schema, boolean deleted, double x, double y) {
    return new Point(new Key(tenant, id), version, schema, "public", deleted, List.of(x, y));
  }
  public static void main(String[] args) {
    Schema cos = new Schema("s1", "m1", 2, Metric.COSINE);
    Point a=point("t1","a",2,"s1",false,1,0), b=point("t1","b",1,"s1",false,0,1);
    Point foreign=point("t2","x",1,"s1",false,1,0), dead=point("t1","d",3,"s1",true,1,0);
    Map<Key,Point> live=Map.of(a.key(),a,b.key(),b,foreign.key(),foreign,dead.key(),dead);
    List<Candidate> candidates=List.of(new Candidate(foreign.key(),1,"s1"), new Candidate(a.key(),1,"s1"),
        new Candidate(dead.key(),2,"s1"),new Candidate(b.key(),1,"s1"),new Candidate(a.key(),2,"s1"));
    Result all=select(cos,"m1","t1","public",List.of(2.,0.),live,candidates,2,100);
    expect(all.hits().size()==2 && all.hits().get(0).key().equals(a.key()));
    expect(all.status().equals("ALLOWED_SET_EXHAUSTED") && all.inspected()==5);
    Result shortfall=select(cos,"m1","t1","public",List.of(1.,0.),live,candidates,2,3);
    expect(shortfall.hits().isEmpty() && shortfall.status().equals("APPROX_SHORTFALL"));
    Result missed=select(cos,"m1","t1","public",List.of(1.,0.),live,List.of(new Candidate(b.key(),1,"s1")),1,100);
    expect(missed.status().equals("K_REACHED") && missed.hits().get(0).distance()==1); // k filled, nearest a missed
    expect(select(cos,"m1","nobody","public",List.of(1.,0.),live,candidates,2,100).status().equals("ALLOWED_SET_EXHAUSTED"));
    rejects(()->select(cos,"m2","t1","public",List.of(1.,0.),live,candidates,2,100));
    rejects(()->select(cos,"m1","t1","public",List.of(0.,0.),live,candidates,2,100));
    rejects(()->select(cos,"m1","t1","public",List.of(Double.NaN,0.),live,candidates,2,100));
    rejects(()->select(cos,"m1","t1","public",List.of(1.),live,candidates,2,100));
    rejects(()->select(cos,"m1","t1","public",List.of(1.,0.),live,List.of(new Candidate(a.key(),2,"s2")),1,100));
    for (double invalid : new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}) {
      Point bad=point("t1","bad",1,"s1",false,invalid,1);
      rejects(()->select(cos,"m1","t1","public",List.of(1.,0.),Map.of(bad.key(),bad),
          List.of(new Candidate(bad.key(),1,"s1")),1,100));
    }
    for (Metric metric : Metric.values()) {
      Schema s=new Schema("s1","m1",2,metric);
      Result r=select(s,"m1","t1","public",List.of(1.,0.),live,candidates,2,100);
      expect(r.hits().get(0).key().equals(a.key()) && r.hits().get(0).distance()<=r.hits().get(1).distance());
    }
    Point zero=point("t1","z",1,"s1",false,0,0);
    rejects(()->select(cos,"m1","t1","public",List.of(1.,0.),Map.of(zero.key(),zero),List.of(new Candidate(zero.key(),1,"s1")),1,100));
    Schema l2=new Schema("s1","m1",2,Metric.SQUARED_L2);
    Point huge=point("t1","h",1,"s1",false,1e308,0);
    rejects(()->select(l2,"m1","t1","public",List.of(-1e308,0.),Map.of(huge.key(),huge),List.of(new Candidate(huge.key(),1,"s1")),1,100));
    System.out.println("VectorCandidates: "+checks+" checks passed; no ANN database executed");
  }
}
