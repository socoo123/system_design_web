import java.util.*;
class SplitProbe {
    private static int checks;
    private static void yes(boolean p) { if (!p) throw new AssertionError(); checks++; }
    private static void valid(long total, int n, long m, boolean even, Random rng) {
        var p=SplitPlan.split(total,n,m,even,rng);
        yes(p.size()==n);
        yes(p.stream().mapToLong(SplitPlan.Share::cents).sum()==total);
        yes(p.stream().allMatch(x->x.cents()>=m));
        yes(p.stream().map(SplitPlan.Share::id).distinct().count()==n);
        if(even) yes(p.stream().mapToLong(SplitPlan.Share::cents).max().getAsLong()
                   -p.stream().mapToLong(SplitPlan.Share::cents).min().getAsLong()<=1);
    }
    public static void main(String[] ignored) {
        Random low=new Random(17) { public long nextLong(long a,long b){ return a; } };
        Random high=new Random(71) { public long nextLong(long a,long b){ return b-1; } };
        for(boolean even:new boolean[]{false,true}) for(Random rng:new Random[]{low,high,new Random(991)}) {
            valid(1,1,1,even,rng);valid(97,97,1,even,rng);
            valid(63,5,12,even,rng);valid(31,7,4,even,rng);
            valid(1_000_000_000_000L,1,1_000_000_000_000L,even,rng);
            valid(1_000_000_000_000L,99,10_101_010_101L,even,rng);
            for(int n:new int[]{2,3,11,73,100})valid(100_003,n,7,even,rng);
        }
        var p=SplitPlan.split(101,10,1,true,new Random(1));
        yes(p.stream().filter(x->x.cents()==11).count()==1);
        for(long[] bad:new long[][]{{-1,1,1},{1,2,1},{100,101,1},{100,1,-1},
                {Long.MAX_VALUE,1,1},{1000000000001L,1,1},{100,2,Long.MAX_VALUE}}){
            try { SplitPlan.split(bad[0],(int)bad[1],bad[2],false,new Random());throw new AssertionError(); }
            catch(IllegalArgumentException expected){checks++;}
        }
        try{p.clear();throw new AssertionError();}catch(UnsupportedOperationException expected){checks++;}
        System.out.println("{\"checks\":"+checks+",\"passed\":true,\"javaVersion\":\""+System.getProperty("java.version")+"\"}");
    }
}
