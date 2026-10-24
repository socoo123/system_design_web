import java.util.*;

// Independent sparse-offset completion orders; this does not run a Kafka broker.
class RootProgressProbe {
  static int assertions;
  static void check(boolean ok,String why){assertions++;if(!ok)throw new AssertionError(why);}
  static void illegal(Runnable f){try{f.run();throw new AssertionError("expected rejection");}
    catch(IllegalArgumentException|IllegalStateException expected){assertions++;}}
  static void same(PartitionProgress p,long value){check(p.checkpoint().orElseThrow()==value,"unsafe completion frontier");}
  public static void main(String[] args){
    Random random=new Random(127);
    int completions=0;
    for(int trial=0;trial<100;trial++){
      long recovered=10000L+trial*2000;
      var p=new PartitionProgress(recovered,64);
      int n=random.nextInt(45);
      var offsets=new ArrayList<Long>();long value=recovered;
      for(int i=0;i<n;i++){value+=1+random.nextInt(12);offsets.add(value);}
      long next=value+1+random.nextInt(20);
      var tickets=p.register(offsets,next);
      same(p,n==0?next:offsets.get(0));
      var order=new ArrayList<Integer>();for(int i=0;i<n;i++)order.add(i);Collections.shuffle(order,random);
      boolean[] done=new boolean[n];
      for(int index:order){
        check(p.completed(tickets.get(index)),"first completion accepted");done[index]=true;completions++;
        int earliest=0;while(earliest<n&&done[earliest])earliest++;
        same(p,earliest==n?next:offsets.get(earliest));
        check(!p.completed(tickets.get(index)),"duplicate callback ignored");
      }
      same(p,next);check(p.idle(),"finished batch releases pause");
      p.register(List.of(),next+50);same(p,next+50); // invisible/control offset advancement
      p.close();check(p.checkpoint().isEmpty(),"lost/closed owner cannot commit");
      if(n>0)check(!p.completed(tickets.get(0)),"closed callbacks ignored");
    }
    var old=new PartitionProgress(7,3);var t=old.register(List.of(8L,41L),50);
    old.beginRevocation();illegal(()->old.register(List.of(),50));
    check(old.completed(t.get(1)),"draining can observe completed effects");same(old,8);
    old.close();check(old.checkpoint().isEmpty(),"no post-loss commit");
    var fresh=new PartitionProgress(7,3);var f=fresh.register(List.of(8L),50);
    check(!fresh.completed(t.get(0)),"old ticket cannot affect new assignment");same(fresh,8);
    check(fresh.completed(f.get(0)),"fresh ticket accepted");same(fresh,50);
    var invalid=new PartitionProgress(0,3);
    illegal(()->invalid.register(List.of(3L,3L),4));
    illegal(()->invalid.register(List.of(3L),3));
    illegal(()->invalid.register(List.of(1L,2L,3L,4L),5));
    invalid.register(List.of(4L),6);same(invalid,4); // validation failures do not poison tracker
    System.out.println("{\"passed\":true,\"assertions\":"+assertions+",\"completionOrders\":100,\"actualCompletions\":"+completions+"}");
  }
}
