import java.util.*;

// Default package accesses the author's unchanged pure model. No database/network claims.
class Ch12IndependentProbe {
    static int checks;
    static void must(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++; System.out.println("PASS " + label);
    }
    public static void main(String[] args) {
        var initial = new ChatContracts.Cursor(1, 106, 105, new TreeMap<>());
        var late = new ChatContracts.Entry(1,108,1,"MESSAGE","late",true);
        var one = new ChatContracts.Entry(1,106,1,"MESSAGE","one",true);
        var omitted = new ChatContracts.Entry(1,107,1,"OMITTED","",true);
        var outOfOrder = ChatContracts.merge(initial, List.of(late));
        must(outOfOrder.upto()==105, "108 never crosses absent106/107");
        var complete = ChatContracts.merge(outOfOrder, List.of(omitted,one));
        must(complete.upto()==108 && complete.entries().size()==3, "certified107 and106 close the contiguous range");
        must(ChatContracts.merge(complete,List.of(late)).equals(complete), "late duplicate108 is idempotent");
        var unseen = ChatContracts.merge(complete,List.of());
        must(unseen.entries().get(106L).revision()==1, "negative: cursor108/empty delta cannot discover a changed106");
        var tombstone = new ChatContracts.Entry(1,106,2,"TOMBSTONE","",true);
        var revised = ChatContracts.merge(complete,List.of(tombstone));
        must(revised.upto()==108 && revised.entries().get(106L).revision()==2,
             "received old-seq revision applies without prefix regression");
        must(ChatContracts.merge(revised,List.of(one)).equals(revised), "old replay cannot undo received revision2");
        boolean denied=false;
        try { ChatContracts.merge(initial,List.of(new ChatContracts.Entry(1,106,1,"OMITTED","",false))); }
        catch(IllegalArgumentException expected) { denied=true; }
        must(denied && initial.upto()==105 && initial.entries().isEmpty(), "untrusted omission aborts immutable transition");
        var reset = new ChatContracts.Cursor(2,120,119,new TreeMap<>());
        denied=false;
        try { ChatContracts.merge(reset,List.of(one)); } catch(IllegalArgumentException expected) { denied=true; }
        must(denied && reset.upto()==119, "reset view rejects old packets and retains explicit119 baseline");
        System.out.println("Independent Java 17 checks: " + checks);
    }
}
