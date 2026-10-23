import java.util.*;

/** Java 17, no dependencies. Pure single-key reconciliation, not a database. */
public class VersionedKv {
    // BEGIN lww
    record Mutation(long timestamp, String id, String value, boolean deleted) {
        Mutation {
            if (timestamp < 0 || id == null || !id.matches("[A-Za-z0-9_-]+"))
                throw new IllegalArgumentException("invalid version");
            if (deleted != (value == null)) throw new IllegalArgumentException("value/tombstone");
        }
    }
    static Mutation winner(Mutation a, Mutation b) {
        if (a == null) return b;  // null means absence, not deletion
        if (b == null) return a;
        int order = Long.compare(a.timestamp(), b.timestamp());
        if (order == 0) order = a.id().compareTo(b.id()); // canonical ASCII IDs
        if (order == 0 && !a.equals(b))
            throw new IllegalArgumentException("same version, different mutation");
        return order >= 0 ? a : b;
    }
    // END lww

    // BEGIN siblings
    record Version(Map<String, Long> clock, String value) {
        Version { clock = Map.copyOf(clock); Objects.requireNonNull(value);
            if (clock.values().stream().anyMatch(n -> n < 0))
                throw new IllegalArgumentException("negative counter"); }
    }
    static boolean before(Version a, Version b) {
        Set<String> actors = new HashSet<>(a.clock().keySet());
        actors.addAll(b.clock().keySet());
        boolean strict = false;
        for (String actor : actors) {
            long x = a.clock().getOrDefault(actor, 0L);
            long y = b.clock().getOrDefault(actor, 0L);
            if (x > y) return false;
            strict |= x < y;
        }
        return strict; // a is an ancestor only if <= everywhere and < somewhere
    }
    static List<Version> siblings(List<Version> versions) {
        return versions.stream().distinct()
            .filter(a -> versions.stream().noneMatch(b -> before(a, b))).toList();
    }
    // Actor is one causal writer; context includes all of its own prior events.
    // Concurrent writers need distinct actors, not a shared coordinator ID.
    static Version resolved(List<Version> context, String actor,
                            long reservedCounter, String applicationValue) {
        Map<String, Long> joined = new HashMap<>();
        for (Version v : context)
            v.clock().forEach((k, n) -> joined.merge(k, n, Math::max));
        if (reservedCounter <= joined.getOrDefault(actor, 0L))
            throw new IllegalArgumentException("counter must advance context");
        joined.put(actor, reservedCounter);
        return new Version(joined, applicationValue);
    }
    // END siblings

    static int tests = 0;
    static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        tests++; System.out.println("PASS " + label);
    }
    public static void main(String[] args) {
        Mutation old = new Mutation(100, "old", "v1", false);
        Mutation next = new Mutation(200, "next", "v2", false);
        Mutation del = new Mutation(300, "delete", null, true);
        check(winner(old, next).equals(next), "completed write read from intersection");
        check(winner(next, next).equals(next), "same mutation retry idempotent");
        check(winner(next, del).deleted(), "tombstone beats older value");
        check(winner(del, next).equals(del), "old hint keeps original timestamp");
        Mutation forged = new Mutation(400, "next", "v2", false);
        check(!winner(del, forged).deleted(), "retimestamping old hint resurrects value");
        check(winner(null, next).equals(next), "purging tombstone permits resurrection");
        Mutation[] purgedReplicas = {null,null,null}; // all had DEL@300, then purged
        for (int i=0;i<3;i++) purgedReplicas[i]=winner(purgedReplicas[i],next);
        check(Arrays.stream(purgedReplicas).allMatch(next::equals),
              "old client retry resurrects after ALL repaired replicas purge tombstones");
        Mutation x = new Mutation(1200, "x", "X", false);
        Mutation y = new Mutation(1100, "y", "Y", false);
        check(winner(x, y).equals(x), "clock skew defeats later real-time write");
        Mutation tie = new Mutation(200, "z", "other", false);
        check(winner(next, tie).equals(winner(tie, next)), "equal timestamp has deterministic tie-break");
        boolean rejected = false;
        try { winner(next, new Mutation(200,"next","different",false)); }
        catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, "equal version conflicting content rejected");
        List<Mutation> walTrace = new ArrayList<>();
        try {
            Mutation invalid = new Mutation(200,"next","different",false);
            Mutation validated = winner(next, invalid); // before durable logging
            walTrace.add(invalid);
        } catch (IllegalArgumentException expected) { /* rejected before append */ }
        check(walTrace.isEmpty(), "invalid mutation is rejected before WAL append");
        Mutation inc1 = new Mutation(201,"inc1","11",false);
        Mutation inc2 = new Mutation(202,"inc2","11",false);
        check(winner(inc1,inc2).value().equals("11"), "concurrent read-modify-write loses increment");
        // Failed write lands only at A. Before async repair, reads AB then BC regress.
        Mutation readAB = winner(next,old), readBC = winner(old,old);
        check(readAB.equals(next) && readBC.equals(old), "failed write plus async repair allows read regression");
        // Sloppy writes AD; original B,C have only old.
        check(winner(old,old).equals(old), "sloppy AD write can be absent from BC read");
        for (Mutation a : List.of(old,next,del,tie)) for (Mutation b : List.of(old,next,del,tie))
            for (Mutation c : List.of(old,next,del,tie)) {
                if (!winner(winner(a,b),c).equals(winner(a,winner(b,c))))
                    throw new AssertionError("associativity");
            }
        check(true,"64 LWW regroupings converge");
        Version a = new Version(Map.of("A",2L),"cart-A");
        Version b = new Version(Map.of("A",1L,"B",1L),"cart-B");
        check(!before(a,b) && !before(b,a),"incomparable vectors retain concurrent intent");
        check(siblings(List.of(a,b,a)).size()==2,"siblings deduplicate retry and retain conflict");
        Version merged = resolved(List.of(a,b),"B",2L,"app-merged");
        check(before(a,merged)&&before(b,merged),"context join plus new event dominates both siblings");
        check(siblings(List.of(a,b,merged)).equals(List.of(merged)),"merged write replaces observed ancestors");
        Version unseen = new Version(Map.of("A",3L),"unseen");
        check(siblings(List.of(merged,unseen)).size()==2,"unseen concurrent update survives reconciliation");
        rejected=false;
        try { resolved(List.of(b),"B",1L,"bad"); }
        catch(IllegalArgumentException expected){rejected=true;}
        check(rejected,"reserved counter must exceed returned context");
        Version stale = new Version(Map.of("A",1L), "base");
        Version wrong1 = resolved(List.of(stale),"B",1L,"client-1");
        Version wrong2 = resolved(List.of(stale),"B",2L,"client-2");
        check(siblings(List.of(wrong1,wrong2)).equals(List.of(wrong2)),
              "INVALID shared actor plus stale context falsely implies ancestry");
        Version right1 = resolved(List.of(stale),"writer1",1L,"client-1");
        Version right2 = resolved(List.of(stale),"writer2",1L,"client-2");
        check(siblings(List.of(right1,right2)).size()==2,
              "distinct causal writers preserve unseen concurrent updates");
        System.out.println("PASS " + tests + " scenarios; pure model only, no network or disk guarantees");
    }
}
