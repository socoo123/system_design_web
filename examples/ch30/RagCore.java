import java.util.*;
import java.util.function.ToIntFunction;

/** Java 17, standard library only. Pure selection logic, not an ACL service. */
public final class RagCore {
  // BEGIN rrf
  public record Hit(String qualifiedId, int originalRank) {}
  public record Scored(String qualifiedId, double score) {}
  public static List<Scored> rrf(List<List<Hit>> lanes, int cap) {
    if (cap < 1 || cap > 80) throw new IllegalArgumentException("cap 1..80");
    Map<String, Double> score = new HashMap<>();
    for (List<Hit> lane : lanes) {
      Map<String, Integer> best = new HashMap<>();
      for (Hit hit : lane) {
        if (hit.originalRank() < 1 || hit.originalRank() > 100)
          throw new IllegalArgumentException("rank 1..100");
        best.merge(hit.qualifiedId(), hit.originalRank(), Math::min);
      }
      // Eligibility filtering preserves original ranks; duplicates count once/lane.
      best.forEach((id, rank) -> score.merge(id, 1.0 / (60 + rank), Double::sum));
    }
    return score.entrySet().stream()
      .map(e -> new Scored(e.getKey(), e.getValue()))
      .sorted(Comparator.comparingDouble(Scored::score).reversed()
        .thenComparing(Scored::qualifiedId))
      .limit(cap).toList();
  }
  // END rrf

  // BEGIN pack
  public record Span(String tenant, String doc, long rev, String pool,
                     int start, int end, String text) {}
  public record Pack(List<Span> spans, String prompt, int inputTokens) {}
  public interface Renderer {
    String evidence(List<Span> spans);           // includes IDs/locators/delimiters
    String prompt(List<Span> spans);             // complete roles + question + evidence
  }
  public static Optional<Pack> pack(List<Span> ranked, Renderer render,
      ToIntFunction<String> generationTokens, int contextLimit) {
    List<Span> chosen = new ArrayList<>();
    if (generationTokens.applyAsInt(render.prompt(List.of())) > 1024)
      return Optional.empty();                  // no silent question truncation
    for (Span candidate : ranked) {             // already authorized exact revisions
      if (candidate.start() < 0 || candidate.end() <= candidate.start())
        throw new IllegalArgumentException("invalid span");
      boolean overlaps = chosen.stream().anyMatch(s ->
        s.tenant().equals(candidate.tenant()) && s.doc().equals(candidate.doc())
        && s.rev() == candidate.rev() && s.pool().equals(candidate.pool())
        && s.start() < candidate.end() && candidate.start() < s.end());
      if (overlaps) continue;                    // conservative: keep higher-ranked span
      List<Span> trial = new ArrayList<>(chosen); trial.add(candidate);
      int evidence = generationTokens.applyAsInt(render.evidence(trial));
      int input = generationTokens.applyAsInt(render.prompt(trial));
      if (evidence > 4096 || input > 5120 || (long) input + 512 > contextLimit)
        continue;                               // try a smaller later span, no truncation
      chosen = trial;
      if (chosen.size() == 8) break;
    }
    if (chosen.isEmpty()) return Optional.empty();
    String prompt = render.prompt(chosen);
    return Optional.of(new Pack(List.copyOf(chosen), prompt,
      generationTokens.applyAsInt(prompt)));
  }
  // END pack

  private static int assertions = 0;
  private static void check(boolean ok) {
    assertions++;
    if (!ok) throw new AssertionError("case " + assertions);
  }
  private static Span span(String doc, int start, int end, int size) {
    return new Span("t1", doc, 7, "g1", start, end, "x".repeat(size));
  }
  public static void main(String[] args) {
    var scores = rrf(List.of(List.of(new Hit("A", 1), new Hit("B", 5)),
      List.of(new Hit("B", 5), new Hit("A", 10))), 80);
    check(scores.get(0).qualifiedId().equals("B"));
    check(Math.abs(scores.get(0).score() - 2.0 / 65) < 1e-12);
    check(Math.abs(scores.get(1).score() - (1.0 / 61 + 1.0 / 70)) < 1e-12);
    var duplicate = rrf(List.of(List.of(new Hit("A", 1), new Hit("A", 9))), 80);
    check(duplicate.size() == 1 && duplicate.get(0).score() == 1.0 / 61);
    check(rrf(List.of(List.of(new Hit("filtered", 99))), 80).get(0).score() == 1.0 / 159);
    check(rrf(List.of(List.of(new Hit("B", 1), new Hit("A", 1))), 80).get(0).qualifiedId().equals("A"));
    check(rrf(List.of(), 80).isEmpty());
    for (int n : new int[]{0, 81}) try { rrf(List.of(), n); throw new AssertionError(); }
      catch (IllegalArgumentException expected) { assertions++; }
    for (int rank : new int[]{0, 101}) try {
      rrf(List.of(List.of(new Hit("bad", rank))), 80); throw new AssertionError();
    } catch (IllegalArgumentException expected) { assertions++; }
    // Fixture tokenizer counts characters ONLY. Production must use the model tokenizer.
    Renderer renderer = new Renderer() {
      public String evidence(List<Span> spans) {
        StringBuilder b = new StringBuilder(); int id=0;
        for (Span s : spans) b.append("[" + (++id) + "] ").append(s.text()).append("\n");
        return b.toString();
      }
      public String prompt(List<Span> spans) { return "q".repeat(1024) + evidence(spans); }
    };
    var exact = pack(List.of(span("d1", 0, 4091, 4091)), renderer, String::length, 5632).orElseThrow();
    check(exact.inputTokens() == 5120 && exact.spans().size() == 1);
    check(pack(List.of(span("d1", 0, 4092, 4092)), renderer, String::length, 5632).isEmpty());
    check(pack(List.of(span("d1", 0, 4091, 4091)), renderer, String::length, 5631).isEmpty());
    var small = pack(List.of(span("huge", 0, 5000, 5000), span("ok", 0, 3, 3)), renderer, String::length, 5632).orElseThrow();
    check(small.spans().get(0).doc().equals("ok"));
    var overlaps = pack(List.of(span("d", 0, 100, 5), span("d", 90, 200, 5), span("d", 100, 200, 5)), renderer, String::length, 5632).orElseThrow();
    check(overlaps.spans().size() == 2);
    List<Span> many = new ArrayList<>();
    for (int i=0; i<20; i++) many.add(span("d"+i, 0, 1, 1));
    check(pack(many, renderer, String::length, 5632).orElseThrow().spans().size() == 8);
    check(pack(List.of(), renderer, String::length, 5632).isEmpty());
    try { pack(List.of(span("bad", 1, 1, 1)), renderer, String::length, 5632); throw new AssertionError(); }
    catch (IllegalArgumentException expected) { assertions++; }
    Renderer oversizedQuestion = new Renderer() {
      public String evidence(List<Span> s) { return ""; }
      public String prompt(List<Span> s) { return "q".repeat(1025); }
    };
    check(pack(many, oversizedQuestion, String::length, 5632).isEmpty());
    System.out.println("RagCore: " + assertions + " assertions passed (fixture tokenizer, no model calls)");
  }
}
