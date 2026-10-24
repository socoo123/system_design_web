import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

// Calls the actual chapter class, never a replacement implementation.
class ReadProbe {
    static int assertions;
    static void require(boolean condition) {
        assertions++;
        if (!condition) throw new AssertionError("Probe " + assertions);
    }
    public static void main(String[] args) throws Exception {
        var id = new VerifiedRead.Identity("tenant-A", "photos", "x/y", "v9", 4, "block-0");
        byte[] bytes = "an immutable block".getBytes(StandardCharsets.UTF_8);
        var expected = new VerifiedRead.Expected(id, bytes.length, VerifiedRead.sha256(bytes));
        VerifiedRead.Replica good = ignored -> new VerifiedRead.Record(id, bytes);
        require(Arrays.equals(VerifiedRead.readBlock(expected, List.of(good)), bytes));
        var wrongIds = List.of(
            new VerifiedRead.Identity("tenant-B", "photos", "x/y", "v9", 4, "block-0"),
            new VerifiedRead.Identity("tenant-A", "other", "x/y", "v9", 4, "block-0"),
            new VerifiedRead.Identity("tenant-A", "photos", "another", "v9", 4, "block-0"),
            new VerifiedRead.Identity("tenant-A", "photos", "x/y", "v8", 4, "block-0"),
            new VerifiedRead.Identity("tenant-A", "photos", "x/y", "v9", 3, "block-0"),
            new VerifiedRead.Identity("tenant-A", "photos", "x/y", "v9", 4, "block-1"));
        for (var wrong : wrongIds) {
            VerifiedRead.Replica stale = ignored -> new VerifiedRead.Record(wrong, bytes);
            try { VerifiedRead.readBlock(expected, List.of(stale)); throw new AssertionError("Wrong identity accepted"); }
            catch (IOException correctlyRejected) { require(true); }
            require(Arrays.equals(VerifiedRead.readBlock(expected, List.of(stale, good)), bytes));
        }
        byte[] corrupt = bytes.clone(); corrupt[0] ^= 1;
        VerifiedRead.Replica wrongHash = ignored -> new VerifiedRead.Record(id, corrupt);
        VerifiedRead.Replica wrongLength = ignored -> new VerifiedRead.Record(id, Arrays.copyOf(bytes, bytes.length + 1));
        VerifiedRead.Replica absent = ignored -> null;
        VerifiedRead.Replica unavailable = ignored -> { throw new IOException("Disk unavailable"); };
        require(Arrays.equals(VerifiedRead.readBlock(expected, List.of(unavailable, absent, wrongLength, wrongHash, good)), bytes));
        try { VerifiedRead.readBlock(expected, List.of(unavailable, absent, wrongLength, wrongHash)); throw new AssertionError("Bad bytes leaked"); }
        catch (IOException correctlyRejected) { require(true); }
        try { VerifiedRead.readBlock(expected, List.of()); throw new AssertionError("Empty replica set accepted"); }
        catch (IOException correctlyRejected) { require(true); }
        byte[] returned = VerifiedRead.readBlock(expected, List.of(good));
        returned[0] ^= 1;
        require(!Arrays.equals(returned, bytes));
        require(Arrays.equals(VerifiedRead.readBlock(expected, List.of(good)), bytes));
        var empty = new VerifiedRead.Expected(id, 0, VerifiedRead.sha256(new byte[0]));
        require(VerifiedRead.readBlock(empty, List.of(ignored -> new VerifiedRead.Record(id, new byte[0]))).length == 0);
        System.out.println("{\"passed\":true,\"assertions\":" + assertions + "}");
    }
}
