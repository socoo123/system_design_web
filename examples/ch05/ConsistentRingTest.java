import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public final class ConsistentRingTest {
    static int checks;
    static ConsistentRing.Token t(long h, String s) { return new ConsistentRing.Token(h,s); }
    static ConsistentRing.Ring ring(long e, ConsistentRing.Token... ts) {
        return new ConsistentRing.Ring(e, List.of(ts));
    }
    static void check(boolean ok,String label) {
        if(!ok) throw new AssertionError(label);
        checks++; System.out.println("PASS " + label);
    }
    static void reject(Runnable r,String label) {
        try { r.run(); throw new AssertionError(label); }
        catch(IllegalArgumentException expected) { check(true,label); }
    }
    public static void main(String[] args) throws Exception {
        var old=ring(7,t(75,"S2"),t(10,"S0"),t(40,"S1"));
        long[] hashes={0,10,11,25,40,41,75,76,99};
        String[] expected={"S0","S0","S1","S1","S1","S2","S2","S0","S0"};
        for(int i=0;i<hashes.length;i++) check(old.owner(hashes[i]).equals(expected[i]),"endpoint "+hashes[i]);
        var next=ring(8,t(10,"S0"),t(25,"S3"),t(40,"S1"),t(75,"S2"));
        int changed=0; boolean locality=true;
        for(int h=0;h<100;h++) {boolean diff=!old.owner(h).equals(next.owner(h));if(diff)changed++;locality &= diff==(h>10&&h<=25);}
        check(changed==15&&locality,"addition changes exactly (10,25], 15/100");
        var removed=ring(9,t(10,"S0"),t(25,"S3"),t(75,"S2"));
        int s2=0;for(int h=0;h<100;h++)if(removed.owner(h).equals("S2"))s2++;
        check(s2==50,"removal S2 share 50/100");
        var vnode=ring(10,t(10,"S0"),t(60,"S0"),t(30,"S1"),t(95,"S1"),t(45,"S2"),t(80,"S2"));
        var survivors=new ConsistentRing.Ring(11,vnode.tokens().stream().filter(t->!t.owner().equals("S1")).toList());
        int s0=0;s2=0;for(int h=0;h<100;h++){if(survivors.owner(h).equals("S0"))s0++;else s2++;}
        check(s0==45&&s2==55,"remove all physical-owner tokens: 45/55");
        reject(()->ring(0),"empty ring rejected");
        reject(()->ring(0,t(10,"S0"),t(10,"S1")),"token collision rejected");
        reject(()->ring(0,t(10,"S0"),t(10,"S0")),"duplicate same-owner token rejected");
        reject(()->ring(-1,t(10,"S0")),"negative epoch rejected");
        var unsigned=ring(0,t(0,"zero"),t(Long.MIN_VALUE,"high"),t(-1L,"max"));
        check(unsigned.owner(Long.MAX_VALUE).equals("high")&&unsigned.owner(-2L).equals("max")&&unsigned.owner(-1L).equals("max"),"unsigned order and equality");
        check(ring(0,t(10,"only")).owner(-1L).equals("only"),"unsigned wrap and single node");
        var input=new ArrayList<>(List.of(t(10,"S0")));var immutable=new ConsistentRing.Ring(0,input);input.clear();
        check(immutable.owner(10).equals("S0"),"input list cannot mutate snapshot");
        check(Long.toUnsignedString(ConsistentRing.hash64("abc"),16).equals("ba7816bf8f01cfea"),"UTF-8/SHA-256/big-endian vector");
        var router=new ConsistentRing.Router(old);
        check(router.install(7,next)&&router.route(18).equals(new ConsistentRing.Route(8,"S3")),"install then route one coherent snapshot");
        check(!router.install(7,removed)&&!router.install(8,old)&&!router.install(8,ring(8,t(10,"other"))),"stale, rollback, same-epoch fork rejected");
        var race=new ConsistentRing.Router(old);var gate=new CountDownLatch(1);var wins=new AtomicInteger();
        Runnable a=()->{try{gate.await();if(race.install(7,next))wins.incrementAndGet();}catch(InterruptedException e){throw new RuntimeException(e);}};
        Runnable b=()->{try{gate.await();if(race.install(7,removed))wins.incrementAndGet();}catch(InterruptedException e){throw new RuntimeException(e);}};
        Thread ta=new Thread(a),tb=new Thread(b);ta.start();tb.start();gate.countDown();ta.join();tb.join();
        check(wins.get()==1,"competing expected-epoch installs: exactly one winner");
        int modMoves=0;for(int h=0;h<12;h++)if(h%3!=h%4)modMoves++;
        check(modMoves==9,"modulo full cycle 9/12");
        double origin=10000.0/11+10000.0*10/11*.05;
        double warm=1-(800-10000.0*10/11*.05)/(10000.0/11);
        check(Math.abs(origin-1363.6363636364)<1e-6&&Math.abs(warm-.62)<1e-9,"cold origin 1363.64/s; prewarm 62%");
        System.out.println("PASS "+checks+" checks; local algorithm only, not a network fault test");
    }
}
