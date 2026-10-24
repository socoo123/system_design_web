import java.util.*;
import java.util.function.Supplier;

class Ch28IndependentProbe {
    static final class Time implements Supplier<ConfigClient.Clock> {
        long ms, era; boolean trusted = true;
        public ConfigClient.Clock get() { return new ConfigClient.Clock(ms, era, trusted); }
    }
    static final List<String> rows = new ArrayList<>();
    static void observe(String name, boolean expected, boolean actual) {
        rows.add("{\"name\":\""+name+"\",\"expected\":"+expected+",\"actual\":"+actual+",\"passed\":"+(expected==actual)+"}");
    }
    static ConfigClient.View view(ConfigClient.Scope s, long g, String r) {
        return new ConfigClient.View(s,g,g,r,"verified-"+r,true,321);
    }
    public static void main(String[] args) throws Exception {
        var time = new Time();
        var scope = new ConfigClient.Scope("payments/prod/risk", "worker-901", "issued-revision-X");
        var current = view(scope, 701, "release-safe");
        var sdk = new ConfigClient(scope,time); sdk.install(current);
        var initial = sdk.beginConfirmation(); time.ms=1;
        observe("normal confirmation",true,sdk.confirmed(initial,current,true));
        time.ms=1000; var pending=sdk.beginConfirmation();
        time.ms=1100; time.trusted=false;
        observe("untrusted clock denies",false,sdk.allowDangerousAction());
        time.ms=1200; time.trusted=true;
        observe("pre-distrust pending response must be invalidated",false,sdk.confirmed(pending,current,true));
        observe("old pending proof cannot restore dangerous allow",false,sdk.allowDangerousAction());

        var t2 = new Time(); t2.ms=1000;
        var sdk2 = new ConfigClient(scope,t2); sdk2.install(current);
        var p2 = sdk2.beginConfirmation(); t2.ms=1001; sdk2.confirmed(p2,current,true);
        t2.ms=20000; observe("before regression valid",true,sdk2.allowDangerousAction());
        t2.ms=1500;
        observe("observed clock regression after request start must deny",false,sdk2.allowDangerousAction());
        System.out.println("{\"probes\":["+String.join(",",rows)+"]}");
    }
}
