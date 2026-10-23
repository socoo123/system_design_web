class Ch06IndependentProbe {
    public static void main(String[] args) {
        var context = new VersionedKv.Version(java.util.Map.of("A",1L),"base");
        var first = VersionedKv.resolved(java.util.List.of(context),"B",1L,"client-one");
        var second = VersionedKv.resolved(java.util.List.of(context),"B",2L,"client-two");
        System.out.println("Same observed context, different client writes, shared B counter: "+first+" / "+second);
        System.out.println("siblings="+VersionedKv.siblings(java.util.List.of(first,second)));
        if (VersionedKv.siblings(java.util.List.of(first,second)).size()!=1) throw new AssertionError();
        var third = VersionedKv.resolved(java.util.List.of(context),"C",1L,"client-three");
        if (VersionedKv.siblings(java.util.List.of(first,third)).size()!=2) throw new AssertionError();
        System.out.println("FIXED contract: distinct causal writers preserve both intents");
        var wal = new java.util.ArrayList<VersionedKv.Mutation>();
        var old = new VersionedKv.Mutation(100,"same","original",false);
        var invalid = new VersionedKv.Mutation(100,"same","conflicting",false);
        wal.add(old); wal.add(invalid); // order in original APPLY pseudocode
        try { VersionedKv.winner(old,invalid); }
        catch(IllegalArgumentException expected) {System.out.println("ORIGINAL APPLY order: winner rejects, but WAL already contains conflicting version");}
        var correctedWal = new java.util.ArrayList<VersionedKv.Mutation>();
        try {
            var next = VersionedKv.winner(old,invalid);
            correctedWal.add(invalid); // only after validation succeeds
        } catch (IllegalArgumentException expected) { }
        if (!correctedWal.isEmpty()) throw new AssertionError();
        System.out.println("FIXED APPLY order: rejected conflicting record never enters WAL");
        var deleted = new VersionedKv.Mutation(300,"delete",null,true);
        var delayedClient = new VersionedKv.Mutation(200,"put","old",false);
        if (!VersionedKv.winner(deleted,delayedClient).deleted()) throw new AssertionError();
        if (VersionedKv.winner(null,delayedClient).deleted()) throw new AssertionError();
        System.out.println("GC counterexample: repair all replicas, purge all markers, then late client PUT200 resurrects");
    }
}
