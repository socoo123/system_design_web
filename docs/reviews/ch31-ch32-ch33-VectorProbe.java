import java.util.*;

/** New inputs directly exercise the actual chapter class. Java 17 CPU only. */
final class VectorProbe {
  static int checks;
  static void check(boolean value) {
    checks++;
    if (!value) throw new AssertionError("root vector check " + checks);
  }
  static void reject(Runnable work) {
    boolean rejected = false;
    try { work.run(); }
    catch (IllegalArgumentException | IllegalStateException e) { rejected = true; }
    check(rejected);
  }
  static VectorCandidates.Point point(String id, String category, double... vector) {
    return new VectorCandidates.Point(new VectorCandidates.Key("blue", id), 5, "space-a", category,
        false, Arrays.stream(vector).boxed().toList());
  }
  static VectorCandidates.Candidate candidate(VectorCandidates.Point p) {
    return new VectorCandidates.Candidate(p.key(), p.version(), p.schemaId());
  }
  public static void main(String[] args) {
    var nearest = point("near", "science", 2., -3., 0.);
    var far = point("far", "science", 20., -3., 0.);
    var privatePoint = point("secret", "private", 2., -3., 0.);
    var live = Map.of(nearest.key(), nearest, far.key(), far, privatePoint.key(), privatePoint);
    var stream = List.of(candidate(far), candidate(privatePoint), candidate(nearest));
    var l2 = new VectorCandidates.Schema("space-a", "m-a", 3, VectorCandidates.Metric.SQUARED_L2);
    var exact = VectorCandidates.select(l2, "m-a", "blue", "science", List.of(2., -3., 0.), live, stream, 1, 3);
    check(exact.hits().get(0).key().id().equals("near"));
    check(exact.hits().get(0).distance() == 0. && exact.status().equals("K_REACHED"));
    check(exact.hits().stream().noneMatch(h -> h.key().id().equals("secret")));
    var bounded = VectorCandidates.select(l2, "m-a", "blue", "science", List.of(2., -3., 0.), live, stream, 2, 2);
    check(bounded.hits().size() == 1 && bounded.inspected() == 2 && bounded.status().equals("APPROX_SHORTFALL"));
    reject(() -> VectorCandidates.select(l2, "m-b", "blue", "science", List.of(2., -3., 0.), live, stream, 1, 3));
    reject(() -> VectorCandidates.select(l2, "m-a", "blue", "science", List.of(2., -3., 0.), live, stream, 3, 2));
    var empty = VectorCandidates.select(l2, "m-a", "blue", "science", List.of(2., -3., 0.), Map.of(), List.of(), 1, 1);
    check(empty.status().equals("ALLOWED_SET_EXHAUSTED") && empty.hits().isEmpty());
    var ip = new VectorCandidates.Schema("space-a", "m-a", 3, VectorCandidates.Metric.INNER_PRODUCT);
    var large = VectorCandidates.select(ip, "m-a", "blue", "science", List.of(1., 0., 0.), live, stream, 1, 3);
    check(large.hits().get(0).key().id().equals("far") && large.hits().get(0).distance() == -20.);
    var cosine = new VectorCandidates.Schema("space-a", "m-a", 3, VectorCandidates.Metric.COSINE);
    var direction = point("direction", "science", 3., 0., 4.);
    var cos = VectorCandidates.select(cosine, "m-a", "blue", "science", List.of(6., 0., 8.),
        Map.of(direction.key(), direction), List.of(candidate(direction)), 1, 1);
    check(Math.abs(cos.hits().get(0).distance()) < 1e-12);
    for (double invalid : new double[] { Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY })
      reject(() -> VectorCandidates.select(cosine, "m-a", "blue", "science", List.of(invalid, 0., 1.), live, stream, 1, 3));
    System.out.println("Root VectorProbe: " + checks + " checks passed");
  }
}
