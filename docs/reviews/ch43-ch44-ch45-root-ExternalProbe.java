import java.io.IOException;
import java.nio.file.*;
import java.util.*;

class RootExternalProbe {
    static int checks;
    static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++;
    }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("ch43-root-probe-");
        try {
            Random random = new Random(431445);
            List<ExternalAggregate.Row> input = new ArrayList<>();
            Map<String, Long> expected = new TreeMap<>();
            for (int i = 0; i < 901; i++) {
                String key = "key_" + random.nextInt(29);
                long value = random.nextInt(2001) - 1000;
                input.add(new ExternalAggregate.Row(key, value));
                expected.merge(key, value, Math::addExact);
            }
            for (int budget : List.of(1, 13, 37)) for (int fan : List.of(2, 4, 9)) {
                var actual = ExternalAggregate.readResult(ExternalAggregate.aggregate(
                        input.iterator(), budget, fan, root.resolve("case-" + budget + "-" + fan)));
                check(actual.equals(expected), "new signed input oracle, budget=" + budget + ", fan=" + fan);
            }
            Path job = root.resolve("missing-run");
            Iterator<ExternalAggregate.Row> removingInput = new Iterator<>() {
                int index;
                public boolean hasNext() { return index < 3; }
                public ExternalAggregate.Row next() {
                    if (index == 1) {
                        try { Files.delete(job.resolve("stage-0/run-0")); }
                        catch (IOException failure) { throw new RuntimeException(failure); }
                    }
                    return new ExternalAggregate.Row("K" + index++, 1);
                }
            };
            try {
                Path candidate = ExternalAggregate.aggregate(removingInput, 1, 2, job);
                throw new AssertionError("Missing completed run returned a partial result: "
                        + ExternalAggregate.readResult(candidate));
            } catch (NoSuchFileException expectedFailure) {
                checks++;
            } catch (IOException expectedFailure) {
                // A specific count/identity mismatch is also a fail-closed outcome.
                checks++;
            }
            System.out.println("PASS root external probe: " + checks + " cases; required-run disappearance rejected");
        } finally {
            try (var files = Files.walk(root)) {
                for (Path file : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(file);
            }
        }
    }
}
