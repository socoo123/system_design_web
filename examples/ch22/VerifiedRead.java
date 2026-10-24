import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/** Java 17; one bounded block, after an authorized, unexpired read lease. */
public final class VerifiedRead {
    public record Identity(String tenant, String bucket, String key,
                           String version, long layout, String block) { }
    public record Expected(Identity id, int size, byte[] sha256) { }
    public record Record(Identity id, byte[] bytes) { }
    @FunctionalInterface public interface Replica {
        Record fetch(Identity expected) throws IOException;
    }

    // BEGIN PAGE verified-read
    public static byte[] readBlock(Expected expected, List<Replica> replicas) throws IOException {
        // expected comes from the trusted, pinned manifest, not from the selected replica.
        for (Replica replica : replicas) {
            final Record candidate;
            try { candidate = replica.fetch(expected.id()); }
            catch (IOException unavailable) { continue; }
            if (candidate == null || !expected.id().equals(candidate.id()) || candidate.bytes() == null) continue;
            byte[] bytes = candidate.bytes().clone();  // never expose unverified mutable input
            if (bytes.length != expected.size()) continue;
            if (!MessageDigest.isEqual(sha256(bytes), expected.sha256())) continue;
            return bytes;                            // only now may this block reach the client
        }
        throw new IOException("No verified replica for the pinned block");
    }

    public static byte[] sha256(byte[] bytes) {
        try { return MessageDigest.getInstance("SHA-256").digest(bytes); }
        catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    // END PAGE verified-read
}
