import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;

class Ch28IndependentReviewProbe {
    static final class Time implements Supplier<ConfigClient.Clock> {
        long ms=7000,era=11; boolean trusted=true;
        public ConfigClient.Clock get(){return new ConfigClient.Clock(ms,era,trusted);}
    }
    static final List<String> checks=new ArrayList<>();
    static void check(boolean value,String name){if(!value)throw new AssertionError(name);checks.add(name);}
    static ConfigClient.View view(ConfigClient.Scope s,long g,String r,Boolean allow,int timeout){
        return new ConfigClient.View(s,g,g,r,"verified-"+r,allow,timeout);
    }
    static void confirm(ConfigClient c,Time t,ConfigClient.View v){
        var p=c.beginConfirmation();t.ms++;check(c.confirmed(p,v,true),"fresh proof "+v.generation()+"/"+v.scope().identityContext());
    }
    public static void main(String[] args)throws Exception{
        var scope=new ConfigClient.Scope("finance/prod/risk","region-c-99","approved-ctx-A");
        var clock=new Time();var sdk=new ConfigClient(scope,clock);
        var a=view(scope,701,"R-blue",true,321);
        check(sdk.install(a),"normal complete bundle install");
        check(!sdk.allowDangerousAction(),"bytes alone never authorize");confirm(sdk,clock,a);
        var old=sdk.ordinarySnapshot();var waiting=sdk.beginConfirmation();
        var b=view(scope,702,"R-blue",true,654);sdk.install(b);
        check(!sdk.confirmed(waiting,a,true),"rule-only higher g invalidates pending response");
        check(!sdk.allowDangerousAction(),"same release bytes cannot preserve old proof");
        check(old.generation()==701&&old.timeoutMs()==321&&sdk.ordinarySnapshot().timeoutMs()==654,"captured bundle remains internally whole after swap");
        confirm(sdk,clock,b);
        var timeout=sdk.beginConfirmation();sdk.timeout(timeout);
        check(sdk.allowDangerousAction(),"request timeout retains prior unexpired proof");
        check(!sdk.confirmed(timeout,b,true),"timed-out response cannot renew");
        clock.ms=37001;check(!sdk.allowDangerousAction(),"proof expires from request start rather than receipt");
        clock.ms=37002;confirm(sdk,clock,b);
        var identityTicket=sdk.beginConfirmation();
        var newScope=new ConfigClient.Scope(scope.namespace(),scope.instance(),"approved-ctx-B");
        sdk.identityChanged(newScope);var reselected=view(newScope,702,"R-canary",true,777);
        check(sdk.ordinarySnapshot()==null&&!sdk.install(b),"old identity cleared and delayed old-scope install rejected");
        check(sdk.install(reselected)&&!sdk.confirmed(identityTicket,b,true),"same-g new identity reselects without old pending proof");
        confirm(sdk,clock,reselected);
        var altered=new ConfigClient.View(newScope,702,702,"R-canary","different-digest",true,777);
        boolean fork=false;try{sdk.install(altered);}catch(IllegalStateException expected){fork=true;}
        check(fork&&sdk.ordinarySnapshot().equals(reselected),"same identity same-g digest fork preserves good whole view");
        var rollback=view(newScope,703,"R-blue",true,321);sdk.install(rollback);
        check(!sdk.allowDangerousAction()&&sdk.ordinarySnapshot().release().equals("R-blue"),"higher-g older-content rollback clears qualification");
        confirm(sdk,clock,rollback);
        var pauseTicket=sdk.beginConfirmation();clock.era++;
        check(!sdk.confirmed(pauseTicket,rollback,true)&&!sdk.allowDangerousAction(),"pending request cannot cross runtime era");
        confirm(sdk,clock,rollback);
        clock.ms+=1_000_000;check(!sdk.allowDangerousAction(),"suspension-counting elapsed clock expires proof");
        confirm(sdk,clock,rollback);
        var request=sdk.beginConfirmation();clock.ms+=1999;
        check(sdk.confirmed(request,rollback,true),"1999ms response accepted");
        request=sdk.beginConfirmation();clock.ms+=2000;
        check(!sdk.confirmed(request,rollback,true)&&!sdk.allowDangerousAction(),"2000ms response rejected and clears previous proof");
        var deny=view(newScope,704,"R-deny",null,321);sdk.install(deny);confirm(sdk,clock,deny);
        check(!sdk.allowDangerousAction(),"current missing allow remains deny");
        var reboot=new ConfigClient(newScope,clock);reboot.install(rollback);
        check(!reboot.allowDangerousAction(),"disk-restored bundle never restores proof");

        var hub=new WatchHub(701,700);var parked=hub.watch(701);hub.replay(702,700);
        check(parked.get().kind()==WatchHub.Kind.CHANGED&&hub.parked()==0,"post-registration publish wakes and removes waiter");
        check(hub.watch(701).get().generation()==702,"pre-registration publish returns changed immediately");
        var pending=hub.watch(702);hub.replay(703,703);
        check(pending.get().kind()==WatchHub.Kind.RESET,"compaction crossing parked cursor resets");
        check(!hub.watch(703).isDone(),"exact current/floor cursor parks rather than false RESET");
        check(hub.watch(704).get().kind()==WatchHub.Kind.SYNC_REQUIRED,"ahead cursor never receives idle");
        var pool=Executors.newFixedThreadPool(2);
        try{for(int i=0;i<40;i++){
            var h=new WatchHub(500+i,500+i);var start=new CountDownLatch(1);final int generation=501+i;
            var watch=pool.submit(()->{start.await();return h.watch(generation-1);});
            var publish=pool.submit(()->{start.await();h.replay(generation,generation-1);return true;});
            start.countDown();publish.get();
            check(watch.get().get(2,TimeUnit.SECONDS).generation()==generation,"independent watch/replay competition "+i);
        }}finally{pool.shutdownNow();}
        var timeoutHub=new WatchHub(707,706);var idle=timeoutHub.watch(707);timeoutHub.idle(idle);timeoutHub.replay(708,706);
        check(idle.get().kind()==WatchHub.Kind.IDLE&&timeoutHub.parked()==0,"timeout removes waiter before later publications");

        var auth=new Cohort.Auth("finance/prod/risk","欧区-prod-17","eligible","issued");
        var r5=new Cohort.Rule(auth.namespace(),701,701,"R-blue","R-canary",5,"固定盐","eligible");
        var r20=new Cohort.Rule(auth.namespace(),702,702,"R-blue","R-canary",20,"固定盐","eligible");
        for(int i=0;i<250;i++){
            var who=new Cohort.Auth(auth.namespace(),"fresh-input-"+i,"eligible","issued");
            boolean small=Cohort.select(who,r5).release().equals("R-canary");
            check(!small||Cohort.select(who,r20).release().equals("R-canary"),"fixed salt nested cohort "+i);
        }
        var ineligible=new Cohort.Auth(auth.namespace(),auth.instanceId(),"elsewhere","issued");
        var full=new Cohort.Rule(auth.namespace(),703,703,"R-blue","R-canary",100,"固定盐","eligible");
        check(Cohort.select(ineligible,full).release().equals("R-blue"),"cluster AND percentage condition");
        var clear=new Cohort.Rule(auth.namespace(),704,704,"R-blue",null,0,"固定盐","eligible");
        check(Cohort.select(auth,clear).release().equals("R-blue"),"rollback clears canary even for formerly eligible instance");
        
        System.out.println("{\"passed\":true,\"count\":"+checks.size()+",\"unicode_bucket\":"+Cohort.bucket(auth.namespace(),"固定盐",auth.instanceId())+",\"prefix_left\":"+Cohort.bucket("a","bc","x")+",\"prefix_right\":"+Cohort.bucket("ab","c","x")+",\"checks\":[\""+String.join("\",\"",checks)+"\"]}");
    }
}
