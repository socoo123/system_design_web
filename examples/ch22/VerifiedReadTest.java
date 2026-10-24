import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class VerifiedReadTest {
    private static int checks;
    private static void check(String name, boolean pass) {
        if (!pass) throw new AssertionError(name);
        checks++;
        System.out.println("PASS " + name);
    }
    private static void unavailable(String name, VerifiedRead.Expected e, List<VerifiedRead.Replica> replicas) throws Exception {
        try { VerifiedRead.readBlock(e, replicas); throw new AssertionError(name); }
        catch (IOException expected) { check(name, true); }
    }
    public static void main(String[] args) throws Exception {
        byte[] cat = "cat".getBytes(StandardCharsets.UTF_8);
        var id = new VerifiedRead.Identity("tenant-a","photos","cat.jpg","v2",7,"block0");
        var expected = new VerifiedRead.Expected(id,3,VerifiedRead.sha256(cat));
        var good = (VerifiedRead.Replica) ignored -> new VerifiedRead.Record(id,cat);
        check("normal correct identity and bytes", Arrays.equals(cat,VerifiedRead.readBlock(expected,List.of(good))));
        byte[] returned = VerifiedRead.readBlock(expected,List.of(good));
        returned[0] = 'X';
        check("returned array does not expose replica storage", cat[0] == 'c');
        var corrupt = (VerifiedRead.Replica) ignored -> new VerifiedRead.Record(id,"dog".getBytes(StandardCharsets.UTF_8));
        unavailable("all corrupt replicas fail instead of emitting bytes",expected,List.of(corrupt,corrupt));
        check("corrupt then good falls back",Arrays.equals(cat,VerifiedRead.readBlock(expected,List.of(corrupt,good))));
        var different = List.of(
            new VerifiedRead.Identity("tenant-b","photos","cat.jpg","v2",7,"block0"),
            new VerifiedRead.Identity("tenant-a","secret","cat.jpg","v2",7,"block0"),
            new VerifiedRead.Identity("tenant-a","photos","other.jpg","v2",7,"block0"),
            new VerifiedRead.Identity("tenant-a","photos","cat.jpg","v1",7,"block0"),
            new VerifiedRead.Identity("tenant-a","photos","cat.jpg","v2",6,"block0"),
            new VerifiedRead.Identity("tenant-a","photos","cat.jpg","v2",7,"block1"));
        String[] labels = {"tenant","bucket","key","version","layout","block"};
        for (int i=0;i<different.size();i++) {
            var wrong = different.get(i);
            unavailable("wrong "+labels[i]+" rejects identical payload",expected,List.of(ignored -> new VerifiedRead.Record(wrong,cat)));
        }
        unavailable("truncated block rejects",expected,List.of(ignored -> new VerifiedRead.Record(id,new byte[]{1,2})));
        unavailable("long block rejects",expected,List.of(ignored -> new VerifiedRead.Record(id,new byte[]{1,2,3,4})));
        unavailable("null record rejects",expected,List.of(ignored -> null));
        unavailable("null payload rejects",expected,List.of(ignored -> new VerifiedRead.Record(id,null)));
        unavailable("empty replica list fails",expected,List.of());
        var down=(VerifiedRead.Replica) ignored -> {throw new IOException("timeout: remote outcome unknown");};
        check("unavailable then healthy fallback",Arrays.equals(cat,VerifiedRead.readBlock(expected,List.of(down,good))));
        unavailable("all unavailable stays failed",expected,List.of(down,down));
        AtomicInteger touches=new AtomicInteger();
        VerifiedRead.Replica later=ignored->{touches.incrementAndGet();return new VerifiedRead.Record(id,cat);};
        VerifiedRead.readBlock(expected,List.of(good,later));
        check("successful verified copy stops extra fetches",touches.get()==0);
        check("empty block can be verified",VerifiedRead.readBlock(new VerifiedRead.Expected(id,0,VerifiedRead.sha256(new byte[0])),List.of(ignored->new VerifiedRead.Record(id,new byte[0]))).length==0);
        System.out.println("CHECKS "+checks);
    }
}
