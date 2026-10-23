import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

/** Java 17 teaching example: local placement, NOT distributed handoff. */
public final class ConsistentRing {
    // BEGIN ring
    public record Token(long position, String owner) {
        public Token {
            if (owner == null || owner.isBlank())
                throw new IllegalArgumentException("empty owner");
        }
    }
    public record Ring(long epoch, List<Token> tokens) {
        public Ring {
            if (epoch < 0 || tokens.isEmpty())
                throw new IllegalArgumentException("invalid epoch / empty ring");
            var sorted = new ArrayList<>(tokens);
            sorted.sort((a, b) -> Long.compareUnsigned(a.position(), b.position()));
            for (int i = 1; i < sorted.size(); i++)
                if (sorted.get(i - 1).position() == sorted.get(i).position())
                    throw new IllegalArgumentException("token collision");
            tokens = List.copyOf(sorted);
        }
        public String owner(long hash) {
            int lo = 0, hi = tokens.size();
            while (lo < hi) {
                int mid = lo + (hi - lo) / 2;
                if (Long.compareUnsigned(tokens.get(mid).position(), hash) < 0)
                    lo = mid + 1;
                else hi = mid;
            }
            return tokens.get(lo == tokens.size() ? 0 : lo).owner();
        }
    }
    // END ring

    // BEGIN router
    public record Route(long epoch, String owner) {}
    public static final class Router {
        private final AtomicReference<Ring> current;
        public Router(Ring initial) {
            current = new AtomicReference<>(Objects.requireNonNull(initial));
        }
        public Route route(long hash) {
            Ring snapshot = current.get();
            return new Route(snapshot.epoch(), snapshot.owner(hash));
        }
        // Only consume a validated, committed control-plane manifest.
        public boolean install(long expectedEpoch, Ring next) {
            Ring old = current.get();
            if (old.epoch() != expectedEpoch || next.epoch() <= old.epoch())
                return false; // stale update, replay or same-epoch fork
            return current.compareAndSet(old, next);
        }
    }
    // END router

    /** UTF-8 bytes without normalization; first 8 SHA-256 bytes, big endian. */
    public static long hash64(String key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(key.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.wrap(digest).getLong();
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError(impossible);
        }
    }
}
