import java.io.IOException;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

class Ch22IndependentRead {
    static int checks;
    static void ok(String name,boolean pass){if(!pass)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    static byte[] digest(byte[] b)throws Exception{return MessageDigest.getInstance("SHA-256").digest(b);}
    static VerifiedRead.Identity id(String version,String block){return new VerifiedRead.Identity("review-tenant","binary"," leading/é\u0000",version,19,block);}
    public static void main(String[] args)throws Exception{
        byte[] first={0,1,(byte)255,13,10}, second={(byte)128,42,0};
        var i0=id("immutable-old","b0");var i1=id("immutable-old","b1");
        var e0=new VerifiedRead.Expected(i0,first.length,digest(first));
        var e1=new VerifiedRead.Expected(i1,second.length,digest(second));
        AtomicInteger calls=new AtomicInteger();
        VerifiedRead.Replica wrongCurrent=ignored->{calls.incrementAndGet();return new VerifiedRead.Record(id("new-current","b0"),first);};
        VerifiedRead.Replica wrongBytes=ignored->{calls.incrementAndGet();return new VerifiedRead.Record(i0,new byte[]{0,1,2,13,10});};
        VerifiedRead.Replica good=ignored->{calls.incrementAndGet();return new VerifiedRead.Record(i0,first);};
        VerifiedRead.Replica forbidden=ignored->{throw new AssertionError("must stop after verification");};
        byte[] part0=VerifiedRead.readBlock(e0,List.of(wrongCurrent,wrongBytes,good,forbidden));
        ok("wrong current and same-length corruption rejected before binary fallback",Arrays.equals(part0,first)&&calls.get()==3);
        first[0]=99;ok("verified return owns its buffer after replica mutates",part0[0]==0);
        VerifiedRead.Replica down=ignored->{throw new IOException("read timeout");};
        VerifiedRead.Replica newPart=ignored->new VerifiedRead.Record(id("new-current","b1"),second);
        VerifiedRead.Replica oldPart=ignored->new VerifiedRead.Record(i1,second);
        byte[] part1=VerifiedRead.readBlock(e1,List.of(down,newPart,oldPart));
        ok("second block remains pinned despite current change",Arrays.equals(part1,second));
        byte[] entire=new byte[part0.length+part1.length];System.arraycopy(part0,0,entire,0,part0.length);System.arraycopy(part1,0,entire,part0.length,part1.length);
        ok("pinned multi-block result has original full-object digest",Arrays.equals(digest(entire),digest(new byte[]{0,1,(byte)255,13,10,(byte)128,42,0})));
        var alteredNames=List.of(new VerifiedRead.Identity("review-tenant","binary","leading/é\u0000","immutable-old",19,"b1"),
                new VerifiedRead.Identity("review-tenant","binary"," leading/e\u0301\u0000","immutable-old",19,"b1"),
                new VerifiedRead.Identity("review-tenant","binary"," leading/é\u0000","immutable-old",19,"b01"));
        for(int n=0;n<alteredNames.size();n++){
            var wrong=alteredNames.get(n);boolean rejected=false;
            try{VerifiedRead.readBlock(e1,List.of(ignored->new VerifiedRead.Record(wrong,second)));}catch(IOException expected){rejected=true;}
            ok("exact key/block identity rejects normalization variant "+n,rejected);
        }
        byte[] mutated=second.clone();mutated[0]=0;boolean noOutput=false;
        try{VerifiedRead.readBlock(e1,List.of(ignored->new VerifiedRead.Record(i1,mutated)));}catch(IOException expected){noOutput=true;}
        ok("all wrong bytes fail rather than return a partial block",noOutput);
        System.out.println("INDEPENDENT_JAVA_CHECKS="+checks);
    }
}
