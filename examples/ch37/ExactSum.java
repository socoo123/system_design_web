import java.math.BigInteger;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class ExactSum {
    // BEGIN aggregate
    public record Part(String query, String snapshot, String manifestVersion, String fragment,
                       String contentHash, BigInteger sum) {
        public Part {
            Objects.requireNonNull(query); Objects.requireNonNull(snapshot);
            Objects.requireNonNull(manifestVersion);
            Objects.requireNonNull(fragment); Objects.requireNonNull(contentHash);
            Objects.requireNonNull(sum);
        }
    }
    public static BigInteger exactSum(String query, String snapshot, String manifestVersion,
            Map<String, String> manifest, List<Part> replies) {
        // The trusted manifest is complete and its fragments do not overlap.
        Objects.requireNonNull(query); Objects.requireNonNull(snapshot);
        Objects.requireNonNull(manifestVersion);
        manifest = Map.copyOf(manifest);
        Map<String, Part> accepted = new HashMap<>();
        for (Part part : replies) {
            if (!query.equals(part.query()) || !snapshot.equals(part.snapshot())
                    || !manifestVersion.equals(part.manifestVersion())
                    || !part.contentHash().equals(manifest.get(part.fragment()))) {
                throw new IllegalArgumentException("wrong query/snapshot/fragment/hash");
            }
            Part previous = accepted.putIfAbsent(part.fragment(), part);
            if (previous != null && !previous.equals(part)) {
                throw new IllegalArgumentException("conflicting duplicate");
            }
        }
        if (!accepted.keySet().equals(manifest.keySet())) {
            throw new IllegalStateException("INCOMPLETE: retry missing fragments only");
        }
        BigInteger total = BigInteger.ZERO;
        for (Part part : accepted.values()) total = total.add(part.sum());
        return total;
    }
    // END aggregate
}
