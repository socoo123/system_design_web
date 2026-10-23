import java.util.*;

/** Java 17 executable contract model. No network, database or consensus protocol. */
public final class ChatContracts {
    record Entry(long view, long seq, long revision, String kind, String content,
                 boolean serverCertified) {}
    record Cursor(long view, long first, long upto, NavigableMap<Long, Entry> entries) {
        Cursor {
            if (view < 1 || first < 1 || upto < first - 1) throw new IllegalArgumentException();
            entries = Collections.unmodifiableNavigableMap(new TreeMap<>(entries));
        }
    }
    // Pure counterpart of receive.pseudo's transaction body, without persistence.
    static Cursor merge(Cursor saved, List<Entry> batch) {
        var rows = new TreeMap<>(saved.entries());
        for (Entry e : batch) {
            if (e.view() != saved.view() || e.seq() < saved.first() || e.revision() < 1)
                throw new IllegalArgumentException("wrong view/range/revision");
            if (!Set.of("MESSAGE", "TOMBSTONE", "OMITTED").contains(e.kind()) ||
                    (e.kind().equals("OMITTED") && !e.serverCertified()))
                throw new IllegalArgumentException("unproven slot coverage");
            Entry old = rows.get(e.seq());
            if (old != null && old.revision() == e.revision() && !old.equals(e))
                throw new IllegalArgumentException("conflicting equal revision");
            if (old == null || old.revision() < e.revision()) rows.put(e.seq(), e);
        }
        long c = saved.upto();
        while (c < Long.MAX_VALUE && rows.containsKey(c + 1)) c++;
        return new Cursor(saved.view(), saved.first(), c, rows);
    }
    static int checks;
    static void check(boolean ok, String message) {
        checks++;
        if (!ok) throw new AssertionError(message);
        System.out.println("PASS " + message);
    }
    static void rejects(Runnable r, String message) {
        boolean rejected = false;
        try { r.run(); } catch (IllegalArgumentException expected) { rejected = true; }
        check(rejected, message);
    }
    static Entry message(long n) { return new Entry(1,n,1,"MESSAGE","m"+n,true); }
    public static void main(String[] args) {
        Cursor c105 = new Cursor(1,1,105,new TreeMap<>());
        Cursor gap = merge(c105,List.of(message(108)));
        check(gap.upto()==105 && gap.entries().containsKey(108L), "108 alone keeps prefix 105");
        Cursor one = merge(gap,List.of(message(106)));
        check(one.upto()==106, "106 advances only to 106");
        Cursor complete = merge(one,List.of(message(107),message(108)));
        check(complete.upto()==108 && complete.entries().size()==3, "107 closes gap and deduplicates 108");
        check(merge(complete,List.of(message(107),message(108))).equals(complete), "repeat batch is idempotent");
        var marks = List.of(new Entry(1,106,1,"TOMBSTONE","",true),
                new Entry(1,107,1,"OMITTED","",true),message(108));
        check(merge(c105,marks).upto()==108, "server-certified hidden/tombstone slots cover range");
        rejects(()->merge(c105,List.of(new Entry(1,106,1,"OMITTED","",false))),
                "client-created omission is rejected");
        rejects(()->merge(complete,List.of(new Entry(2,109,1,"MESSAGE","new",true))),
                "old local view cannot merge a new membership view");
        rejects(()->merge(complete,List.of(new Entry(1,108,1,"MESSAGE","different",true))),
                "equal-revision content conflict aborts");
        Cursor redacted = merge(complete,List.of(new Entry(1,108,2,"TOMBSTONE","",true)));
        check(redacted.upto()==108 && redacted.entries().get(108L).kind().equals("TOMBSTONE"),
                "new redaction revision changes content without changing prefix");
        check(merge(redacted,List.of(message(108))).equals(redacted), "late old revision cannot undo redaction");
        Cursor reset = new Cursor(2,106,105,new TreeMap<>());
        check(reset.upto()==105, "authorized reset baseline declares only retained range");
        rejects(()->merge(reset,List.of(message(106))), "old view packet after reset is rejected");
        Cursor high = new Cursor(1,1,Long.MAX_VALUE-1,new TreeMap<>());
        Entry last = new Entry(1,Long.MAX_VALUE,1,"MESSAGE","last",true);
        check(merge(high,List.of(last)).upto()==Long.MAX_VALUE, "highest legal seq has no overflow");
        check(merge(merge(high,List.of(last)),List.of(last)).upto()==Long.MAX_VALUE,
                "duplicate highest seq does not overflow");
        check(c105.entries().isEmpty() && c105.upto()==105, "model exceptions do not mutate saved input");
        System.out.println("Java 17 contract checks: " + checks);
    }
}
