import java.util.ArrayList;
import java.util.List;

final class Ch45IndependentDomainProbe {
  static int checks;
  static void require(boolean c, String reason) { if(!c) throw new AssertionError(reason); checks++; }
  static void reject(Class<? extends Throwable> type, Runnable r) {
    try {r.run();} catch(Throwable e) {require(type.isInstance(e),type+" vs "+e);return;}
    throw new AssertionError("Expected "+type);
  }
  public static void main(String[] args) {
    var line = new DomainModel.Line("new-sku",4,new DomainModel.Money(125,"EUR"));
    var owned = new ArrayList<DomainModel.Line>(); owned.add(line);
    var order = new DomainModel.Order("tenant-new","order-new",51,DomainModel.State.DRAFT,
        owned,new DomainModel.Money(500,"EUR"),null,null);
    owned.clear(); require(order.lines().size()==1,"constructor copies caller list");
    var candidate=order.editQuantity("new-sku",7);
    require(candidate.total().minor()==875 && candidate.version()==52,"new numeric input 4x125 ->7x125");
    require(order.total().minor()==500&&order.version()==51,"original never partly edited");
    reject(IllegalArgumentException.class,()->new DomainModel.Order("t","o",0,DomainModel.State.DRAFT,
      List.of(line,new DomainModel.Line("usd",1,new DomainModel.Money(1,"USD"))),
      new DomainModel.Money(501,"EUR"),null,null));
    var max=new DomainModel.Order("tenant-new","max",Long.MAX_VALUE,DomainModel.State.DRAFT,
      order.lines(),order.total(),null,null);
    reject(ArithmeticException.class,()->max.checkout("checkout-new"));
    reject(ArithmeticException.class,()->max.editQuantity("new-sku",4));
    require(max.version()==Long.MAX_VALUE&&max.state()==DomainModel.State.DRAFT,"exhausted version intact");
    var pending=candidate.checkout("attempt-new");
    var capture=new DomainModel.Capture("tenant-new","order-new","payment-new","attempt-new",candidate.total());
    var accepted=pending.capture(capture);
    require(accepted.next().state()==DomainModel.State.PAID && accepted.next().version()==54,"new capture increments candidate only");
    require(pending.state()==DomainModel.State.PENDING_PAY&&pending.version()==53,"capture leaves old snapshot intact");
    reject(UnsupportedOperationException.class,()->accepted.events().clear());
    var again=accepted.next().capture(capture);
    require(again.outcome()==DomainModel.Outcome.ALREADY_ACCEPTED&&again.events().isEmpty(),"same payment no new event candidate");
    var extra=accepted.next().capture(new DomainModel.Capture("tenant-new","order-new","other-payment","attempt-new",candidate.total()));
    require(extra.next()==accepted.next()&&extra.outcome()==DomainModel.Outcome.REFUND_REQUIRED,"other capture cannot fulfill again");
    require(extra.events().get(0) instanceof DomainModel.RefundRequired r && r.reason().equals("EXTRA_CAPTURE")&&r.amount().minor()==875,"extra candidate preserves rejected amount");
    var closed=pending.expire();var late=closed.capture(capture);
    require(late.next()==closed&&late.outcome()==DomainModel.Outcome.REFUND_REQUIRED&&closed.version()==54,"closed cannot resurrect");
    var vmax=new DomainModel.Order("tenant-new","order-new",Long.MAX_VALUE,DomainModel.State.PENDING_PAY,
      candidate.lines(),candidate.total(),"attempt-new",null);
    reject(ArithmeticException.class,()->vmax.capture(capture));
    reject(ArithmeticException.class,()->vmax.expire());
    reject(IllegalArgumentException.class,()->new DomainModel.Order("t","o",0,DomainModel.State.PAID,
      order.lines(),order.total(),"a",null));
    reject(IllegalArgumentException.class,()->new DomainModel.Order("t","o",0,DomainModel.State.CLOSED,
      order.lines(),order.total(),"a","p"));
    var big=new DomainModel.Order("t","huge",1,DomainModel.State.DRAFT,
      List.of(new DomainModel.Line("huge",1,new DomainModel.Money(Long.MAX_VALUE-20,"USD")),
              new DomainModel.Line("tiny",1,new DomainModel.Money(20,"USD"))),new DomainModel.Money(Long.MAX_VALUE,"USD"),null,null);
    reject(ArithmeticException.class,()->big.editQuantity("tiny",2));
    require(big.total().minor()==Long.MAX_VALUE&&big.lines().get(1).quantity()==1,"sum overflow keeps original aggregate whole");
    System.out.println("{\"passed\":true,\"newChecks\":"+checks+",\"input\":\"EUR 500->875, v51->52->53->54, max version/all mutation paths\"}");
  }
}
