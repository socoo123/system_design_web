import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Pure selector; Auth is a verified adapter input, not self-asserted tags. */
public final class Cohort {
    public record Auth(String namespace, String instanceId, String cluster, String context) {}
    public record Rule(String namespace, long generation, long revision, String stable,
                       String canary, int percent, String salt, String cluster) {}
    public record Selected(long generation, long revision, String context, String release) {}

    // BEGIN page:select
    public static Selected select(Auth auth, Rule rule) {
        if (!auth.namespace().equals(rule.namespace()) || rule.percent() < 0
                || rule.percent() > 100 || rule.generation() < 0 || rule.revision() < 0
                || rule.stable() == null || (rule.canary() == null && rule.percent() != 0))
            throw new IllegalArgumentException("invalid scope or rule");
        int bucket = bucket(rule.namespace(), rule.salt(), auth.instanceId());
        boolean canary = auth.cluster().equals(rule.cluster())
                && rule.canary() != null && bucket < rule.percent();
        return new Selected(rule.generation(), rule.revision(), auth.context(),
                canary ? rule.canary() : rule.stable()); // one complete release
    }

    public static int bucket(String namespace, String salt, String instanceId) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String field : new String[] { namespace, salt, instanceId }) {
                byte[] bytes = field.getBytes(StandardCharsets.UTF_8);
                digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
                digest.update(bytes); // length prefixes avoid ambiguous concatenation
            }
            long first64 = ByteBuffer.wrap(digest.digest()).getLong();
            return (int) Long.remainderUnsigned(first64, 100);
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError(impossible);
        }
    }
    // END page:select
}
