import java.util.*;

public final class LeaderboardTest {
    static int checks;
    static void check(String name, boolean ok) {
        if (!ok) throw new AssertionError(name);
        checks++; System.out.println("PASS " + name);
    }
    static void rejects(String name, Runnable f) {
        try { f.run(); } catch (IllegalArgumentException | IllegalStateException expected) {
            check(name, true); return;
        }
        throw new AssertionError(name);
    }
    static Leaderboard.Entry e(int id, int score, int t) {
        return new Leaderboard.Entry(String.format(Locale.ROOT, "%012d", id), score, t, 1);
    }
    static Leaderboard.Head head(Leaderboard.Manifest m, String bucket,
                                List<Leaderboard.Entry> rows, int k) {
        return new Leaderboard.Head(bucket,m.scope(),m.snapshot(),m.routing(),m.order(),k,true,
                rows.stream().sorted(Leaderboard.ORDER).limit(k).toList());
    }
    static List<String> ids(List<Leaderboard.Entry> list) {
        return list.stream().map(Leaderboard.Entry::member).toList();
    }
    public static void main(String[] args) {
        var a=e(9,1200,100); var b=e(7,1000,100); var c=e(3,1000,100);
        check("earlier achievement wins",Leaderboard.ORDER.compare(e(1,1000,1),b)<0);
        check("equal score/second reverse fixed-width member",Leaderboard.ORDER.compare(b,c)<0);
        check("a full point dominates every allowed tie",Leaderboard.ORDER.compare(e(1,1001,2_592_000),e(9,1000,0))<0);
        check("maximum composite and IEEE exactness",e(1,1_000_000,0).composite()==Leaderboard.MAX_C
                && (long)(double)Leaderboard.MAX_C==Leaderboard.MAX_C && Leaderboard.MAX_C<(1L<<53));
        rejects("score bound",()->e(1,1_000_001,0));
        rejects("season time bound",()->e(1,1,2_592_001));
        rejects("unformatted member",()->new Leaderboard.Entry("9",1,0,1));
        rejects("version bound",()->new Leaderboard.Entry("000000000001",1,0,1_000_000_001L));
        var m=new Leaderboard.Manifest("g1:s17:global","snap-17","hash-v1",Leaderboard.ORDER_ID,Set.of("A","B"));
        var heads=List.of(head(m,"A",List.of(c,a),2),head(m,"B",List.of(b),2));
        check("frozen topK merge",ids(Leaderboard.topK(m,heads,2)).equals(ids(List.of(a,b))));
        rejects("missing bucket fails",()->Leaderboard.topK(m,heads.subList(0,1),2));
        rejects("duplicate bucket fails",()->Leaderboard.topK(m,List.of(heads.get(0),heads.get(0)),2));
        var mixed=new Leaderboard.Head("B",m.scope(),"snap-old",m.routing(),m.order(),2,true,List.of(b));
        rejects("mixed snapshots fail",()->Leaderboard.topK(m,List.of(heads.get(0),mixed),2));
        var partial=new Leaderboard.Head("B",m.scope(),m.snapshot(),m.routing(),m.order(),2,false,List.of(b));
        rejects("partial response fails",()->Leaderboard.topK(m,List.of(heads.get(0),partial),2));
        rejects("duplicate player across buckets fails",()->Leaderboard.topK(m,List.of(head(m,"A",List.of(a),2),head(m,"B",List.of(a),2)),2));
        Random random=new Random(23);
        for(int round=0;round<50;round++){
            List<Leaderboard.Entry> all=new ArrayList<>(), left=new ArrayList<>(),right=new ArrayList<>();
            for(int id=0;id<50;id++) {var row=e(id,random.nextInt(5),random.nextInt(3));all.add(row);(id%2==0?left:right).add(row);}
            int k=1+random.nextInt(20);
            if(!Leaderboard.topK(m,List.of(head(m,"A",left,k),head(m,"B",right,k)),k)
                    .equals(all.stream().sorted(Leaderboard.ORDER).limit(k).toList())) throw new AssertionError("random merge");
        }
        check("50 seeded tie-heavy merge cases equal full sort",true);
        var source=new ArrayList<>(List.of(c,a,b));
        var snapshot=new Leaderboard.Snapshot(m.scope(),m.snapshot(),m.order(),500,source);
        var first=Leaderboard.page(snapshot,null,2,100); source.clear();
        var second=Leaderboard.page(snapshot,first.next(),2,101);
        check("immutable snapshot pages no gaps or duplicates",ids(first.rows()).equals(ids(List.of(a,b)))
                && ids(second.rows()).equals(ids(List.of(c)))&&second.next()==null);
        rejects("snapshot expiry is 410",()->Leaderboard.page(snapshot,first.next(),2,500));
        rejects("cursor scope binding",()->Leaderboard.page(snapshot,new Leaderboard.Cursor("other",m.snapshot(),m.order(),2),2,100));
        rejects("cursor snapshot binding",()->Leaderboard.page(snapshot,new Leaderboard.Cursor(m.scope(),"old",m.order(),2),2,100));
        rejects("negative cursor offset",()->Leaderboard.page(snapshot,new Leaderboard.Cursor(m.scope(),m.snapshot(),m.order(),-1),2,100));
        var initial=List.of(a,b,c);
        var liveAfterMove=List.of(e(3,1300,100),a,b);
        check("live offset counterexample repeats P7 and misses moving P3",
                initial.subList(0,2).contains(liveAfterMove.get(2))
                && !initial.subList(0,2).contains(c));
        // t0 A=10,B=20; A drops to5; B drops to0. Sample A before and B after.
        var timeline=List.of(List.of(e(1,10,0),e(2,20,0)),
                List.of(e(1,5,0),e(2,20,0)),List.of(e(1,5,0),e(2,0,0)));
        var mixedHead=Leaderboard.topK(m,List.of(head(m,"A",List.of(timeline.get(0).get(0)),1),
                head(m,"B",List.of(timeline.get(2).get(1)),1)),1);
        check("same epoch mixed-time heads match no real global top1",
                timeline.stream().noneMatch(t->mixedHead.equals(t.stream().sorted(Leaderboard.ORDER).limit(1).toList())));
        System.out.println("JAVA_CHECKS="+checks);
    }
}
