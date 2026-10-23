import java.util.Map;
public class ReadPathIndependent {
 public static void main(String[] args) {
  long[] now={0}; var cache=new ReadPath.MemoryCache(()->now[0]);var origin=new ReadPath.FakeOrigin();
  var path=new ReadPath(cache,origin,()->true,()->now[0],100);
  var weak=new ReadPath.Request("feed:42",false,null);
  path.read(weak); now[0]=40;path.read(weak);
  if(cache.entries.get("feed:42").expiresAt()!=100) throw new AssertionError("hit renewed TTL");
  int gets=cache.gets;
  if(!path.read(new ReadPath.Request("feed:42",false,new ReadPath.Floor("h1",9))).body().equals("post 9") || cache.gets!=gets) throw new AssertionError("floor did not force bypass");
  origin.primary=new ReadPath.Snapshot("h2 unrelated",Map.of("h2",100L));
  try {path.read(new ReadPath.Request("feed:42",false,new ReadPath.Floor("h1",9)));throw new AssertionError("missing history passed");}catch(ReadPath.Unavailable expected){}
  cache.entries.clear();cache.down=true;
  if(!path.read(weak).body().equals("old feed")) throw new AssertionError("successful origin lost after cache put failure");
  cache.down=false;
  // Old reader captured before W committed; W invalidated before R filled.
  var captured=origin.replica;origin.replica=new ReadPath.Snapshot("post 9",Map.of("h1",9L));cache.entries.clear();
  cache.put("feed:42",captured,100);
  if(!path.read(weak).body().equals("old feed")) throw new AssertionError("stale-fill model changed");
  System.out.println("PASS independent: no TTL renewal; floor forces bypass; absent ancestor fails; cache write failure preserves weak success; stale refill remains allowed");
 }
}
