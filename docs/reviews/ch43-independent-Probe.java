import java.io.*;
import java.math.BigInteger;
import java.nio.file.*;
import java.util.*;

class Ch43IndependentProbe {
    static final List<String> checks = new ArrayList<>();
    static void check(boolean value, String label) {
        if (!value) throw new AssertionError(label);
        checks.add(label);
    }
    interface Action { void run() throws Exception; }
    static void rejects(Class<? extends Throwable> kind, Action action, String label) throws Exception {
        try { action.run(); } catch (Throwable error) {
            check(kind.isInstance(error), label + ": " + error.getClass().getSimpleName()); return;
        }
        throw new AssertionError("expected failure " + label);
    }
    static SortedMap<String, BigInteger> read(Path file) throws IOException {
        SortedMap<String, BigInteger> result = new TreeMap<>();
        String previous = null;
        try (BufferedReader input = Files.newBufferedReader(file)) {
            for (String line; (line = input.readLine()) != null;) {
                String[] parts = line.split("\\t", -1);
                if (parts.length != 2 || (previous != null && previous.compareTo(parts[0]) >= 0))
                    throw new AssertionError("not unique and sorted");
                result.put(parts[0], new BigInteger(parts[1])); previous = parts[0];
            }
        }
        return result;
    }
    static Iterator<ExternalAggregate.Row> lose(Path job, int rows, int loseRun, int loseAfter) {
        return new Iterator<>() {
            int index; boolean removed;
            public boolean hasNext() {
                Path lost = job.resolve("stage-0/run-" + loseRun);
                if (!removed && index >= loseAfter && Files.exists(lost)) {
                    try { Files.delete(lost); removed = true; }
                    catch (IOException e) { throw new UncheckedIOException(e); }
                }
                return index < rows;
            }
            public ExternalAggregate.Row next() { return new ExternalAggregate.Row("ZZ", ++index); }
        };
    }
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("ch43-independent-");
        boolean singleCandidateMissing = false;
        try {
            Random random = new Random(624);
            List<ExternalAggregate.Row> rows = new ArrayList<>();
            SortedMap<String, BigInteger> oracle = new TreeMap<>();
            for (int i = 0; i < 1543; i++) {
                String key = "K" + random.nextInt(31);
                long value = random.nextInt(10001) - 5000;
                rows.add(new ExternalAggregate.Row(key, value));
                oracle.merge(key, BigInteger.valueOf(value), BigInteger::add);
            }
            for (int budget : List.of(1, 5, 71, 1600)) for (int fan : List.of(2, 5, 9)) {
                Path job = root.resolve("random-" + budget + "-" + fan);
                Path output = ExternalAggregate.aggregate(rows.iterator(), budget, fan, job);
                check(read(output).equals(oracle), "1543 rows / 31 keys / B=" + budget + " F=" + fan);
                try (var files = Files.walk(job)) {
                    check(files.filter(Files::isRegularFile).count() == 1, "completed waves cleaned B=" + budget + " F=" + fan);
                }
            }
            var zero = List.of(new ExternalAggregate.Row("A", -7), new ExternalAggregate.Row("A", 7),
                               new ExternalAggregate.Row("Z", 0));
            check(read(ExternalAggregate.aggregate(zero.iterator(), 1, 2, root.resolve("zero")))
                    .equals(new TreeMap<>(Map.of("A", BigInteger.ZERO, "Z", BigInteger.ZERO))), "zero groups remain after negative cancellation");
            rejects(ArithmeticException.class, () -> ExternalAggregate.aggregate(List.of(
                    new ExternalAggregate.Row("A", Long.MIN_VALUE), new ExternalAggregate.Row("A", -1))
                    .iterator(), 1, 2, root.resolve("negative-overflow")), "negative merge underflow fails");
            rejects(ArithmeticException.class, () -> ExternalAggregate.aggregate(List.of(
                    new ExternalAggregate.Row("A", Long.MAX_VALUE), new ExternalAggregate.Row("A", 1),
                    new ExternalAggregate.Row("A", -1)).iterator(), 3, 2, root.resolve("cancel-later")),
                    "intermediate overflow fails even when final mathematical sum fits");
            rejects(IllegalArgumentException.class, () -> new ExternalAggregate.Row("x".repeat(33), 1), "33-character key rejected");
            rejects(IllegalArgumentException.class, () -> ExternalAggregate.aggregate(rows.iterator(), 1, -1, root.resolve("bad-fan")), "negative fan rejected before directory creation");
            check(!Files.exists(root.resolve("bad-fan")), "invalid budget creates no attempt directory");
            Path missing = root.resolve("missing-later");
            rejects(NoSuchFileException.class, () -> ExternalAggregate.aggregate(lose(missing, 11, 2, 6),
                    2, 3, missing), "middle expected run missing cannot produce partial sum");
            Path r0 = root.resolve("readable"), broken = root.resolve("malformed");
            Files.writeString(r0, "A\t1\n"); Files.writeString(broken, "B\tnot-an-integer\n");
            rejects(IOException.class, () -> ExternalAggregate.merge(List.of(r0, broken), root.resolve("bad-output")), "malformed required run fails");
            Path missingOut = root.resolve("missing-input-output");
            rejects(NoSuchFileException.class, () -> ExternalAggregate.merge(List.of(r0, root.resolve("not-here")), missingOut), "second reader open failure closes earlier readers");
            check(!Files.exists(missingOut), "reader construction failure creates no output");
            Path outputExists = root.resolve("occupied"); Files.writeString(outputExists, "sentinel");
            rejects(FileAlreadyExistsException.class, () -> ExternalAggregate.merge(List.of(r0), outputExists), "existing output cannot be overwritten");
            check(Files.readString(outputExists).equals("sentinel"), "existing output remains intact");
            Path single = root.resolve("single-lost");
            try {
                Path candidate = ExternalAggregate.aggregate(lose(single, 3, 0, 3), 9, 2, single);
                singleCandidateMissing = !Files.isRegularFile(candidate);
            } catch (NoSuchFileException expected) {
                checks.add("single-run loss fails before returning candidate");
            }
            int total = 65003;
            Iterator<ExternalAggregate.Row> streaming = new Iterator<>() {
                int index;
                public boolean hasNext() { return index < total; }
                public ExternalAggregate.Row next() { return new ExternalAggregate.Row(String.format("S%07d", index++), 1); }
            };
            Path output = ExternalAggregate.aggregate(streaming, 127, 5, root.resolve("streamed"));
            int seen = 0;
            try (BufferedReader input = Files.newBufferedReader(output)) {
                for (String line; (line = input.readLine()) != null; seen++)
                    if (!line.equals(String.format("S%07d\t1", seen))) throw new AssertionError("stream output mismatch");
            }
            check(seen == total, "65003 unique streamed keys correct under -Xmx16m");
            System.out.println("{\"passed\":true,\"checks\":" + checks.size()
                    + ",\"randomRows\":1543,\"randomKeys\":31,\"budgetFanPairs\":12,\"streamedUniqueRows\":65003,\"singleRunMissingCandidate\":" + singleCandidateMissing + "}");
        } finally {
            try (var files = Files.walk(root)) {
                for (Path path : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }
}
