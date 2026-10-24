import java.util.*;

class ProgressReview {
    static int checks;
    static void ok(boolean test, String why) { checks++; if (!test) throw new AssertionError(why); }
    static void invalid(Runnable r, Class<? extends Throwable> type) {
        try {r.run();throw new AssertionError("expected "+type);} catch (Throwable e) {ok(type.isInstance(e),"wrong exception "+e);}
    }
    static long frontier(long[] offsets, boolean[] done, long terminal) {
        for(int i=0;i<offsets.length;i++) if(!done[i]) return offsets[i];
        return terminal;
    }
    public static void main(String[] args) {
        Random rng=new Random(20261023);
        for(int scenario=0;scenario<500;scenario++) {
            int n=1+rng.nextInt(13);long start=1000L+scenario*1000L, next=start;
            List<Long> values=new ArrayList<>();long[] raw=new long[n];
            for(int i=0;i<n;i++){next+=1+rng.nextInt(37);values.add(next);raw[i]=next;}
            long terminal=next+1+rng.nextInt(37);
            PartitionProgress progress=new PartitionProgress(start,13);
            var tickets=progress.register(values,terminal);
            ok(progress.checkpoint().orElseThrow()==raw[0],"first delivered offset skips known absent positions");
            invalid(()->progress.register(List.of(),terminal),IllegalStateException.class);
            List<Integer> order=new ArrayList<>();for(int i=0;i<n;i++)order.add(i);Collections.shuffle(order,rng);
            boolean[] done=new boolean[n];
            if((scenario%2)==0)progress.beginRevocation();
            for(int i:order){
                ok(progress.completed(tickets.get(i)),"genuine ticket accepted");done[i]=true;
                ok(progress.checkpoint().orElseThrow()==frontier(raw,done,terminal),"oracle over actual delivered records");
                ok(!progress.completed(tickets.get(i)),"duplicate completion rejected");
            }
            ok(progress.idle(),"batch drains");
            progress.close();ok(progress.checkpoint().isEmpty(),"closed provides no eligible checkpoint");
            ok(!progress.completed(tickets.get(0)),"late completion after close rejected");
            PartitionProgress reassigned=new PartitionProgress(start,13);var fresh=reassigned.register(values,terminal);
            ok(!reassigned.completed(tickets.get(n-1)),"same offset in new assignment rejects old identity");
            ok(reassigned.checkpoint().orElseThrow()==raw[0],"reassigned frontier unchanged by stale ticket");
            ok(!progress.completed(fresh.get(0)),"closed owner also rejects new assignment ticket");
        }
        PartitionProgress holes=new PartitionProgress(899,5);
        var h=holes.register(List.of(903L,1500L,9999L),10040);
        holes.completed(h.get(2));ok(holes.checkpoint().orElseThrow()==903,"far last completion cannot leap over first");
        holes.completed(h.get(0));ok(holes.checkpoint().orElseThrow()==1500,"next is actual unfinished offset, not offset+1");
        holes.completed(h.get(1));ok(holes.checkpoint().orElseThrow()==10040,"terminal includes filtered tail");
        holes.register(List.of(),12000);ok(holes.checkpoint().orElseThrow()==12000,"advanced empty poll certifies gap");
        holes.register(List.of(),12000);ok(holes.checkpoint().orElseThrow()==12000,"unadvanced empty poll harmless");
        invalid(()->holes.register(List.of(12001L,11999L),13000),IllegalArgumentException.class);
        ok(holes.idle()&&holes.checkpoint().orElseThrow()==12000,"bad tail changes neither queue nor frontier");
        invalid(()->holes.register(List.of(12000L),12000),IllegalArgumentException.class);
        invalid(()->holes.register(List.of(12000L,12000L),12001),IllegalArgumentException.class);
        invalid(()->holes.register(List.of(12001L,12002L,12003L,12004L,12005L,12006L),12007),IllegalArgumentException.class);
        invalid(()->holes.register(List.of(),11999),IllegalArgumentException.class);
        ok(holes.idle()&&holes.checkpoint().orElseThrow()==12000,"invalid inputs remain atomic");
        holes.beginRevocation();invalid(()->holes.beginRevocation(),IllegalStateException.class);
        invalid(()->holes.register(List.of(),12000),IllegalStateException.class);
        holes.close();holes.close();ok(holes.checkpoint().isEmpty(),"close idempotent");
        PartitionProgress large=new PartitionProgress(Long.MAX_VALUE-100,5);
        var l=large.register(List.of(Long.MAX_VALUE-91,Long.MAX_VALUE-2),Long.MAX_VALUE);
        large.completed(l.get(1));ok(large.checkpoint().orElseThrow()==Long.MAX_VALUE-91,"large sparse unfinished first");
        large.completed(l.get(0));ok(large.checkpoint().orElseThrow()==Long.MAX_VALUE,"long terminal without increment overflow");
        PartitionProgress A=new PartitionProgress(100,5), B=new PartitionProgress(200,5);
        var a=A.register(List.of(105L,109L),120);var b=B.register(List.of(211L),240);
        // Both are paused. A later poll has NO nextOffsets, but mailbox completions still arrive.
        Map<String,PartitionProgress> owned=Map.of("A",A,"B",B);
        A.completed(a.get(1));B.completed(b.get(0));
        Map<String,Long> checkpoint=new HashMap<>();
        for(var entry:owned.entrySet())checkpoint.put(entry.getKey(),entry.getValue().checkpoint().orElseThrow());
        ok(checkpoint.equals(Map.of("A",105L,"B",240L)),"empty poll: build map from all owned trackers, including B completion");
        A.completed(a.get(0));checkpoint.clear();
        for(var entry:owned.entrySet())checkpoint.put(entry.getKey(),entry.getValue().checkpoint().orElseThrow());
        ok(checkpoint.equals(Map.of("A",120L,"B",240L)),"next empty poll: both completed partitions checkpoint");
        B.close();checkpoint.clear();
        for(var entry:owned.entrySet())entry.getValue().checkpoint().ifPresent(v->checkpoint.put(entry.getKey(),v));
        ok(checkpoint.equals(Map.of("A",120L)),"lost partition is omitted even on empty poll");
        System.out.println("{\"passed\":true,\"assertions\":"+checks+",\"oracleBatches\":500,\"emptyPollMultiPartition\":true}");
    }
}
