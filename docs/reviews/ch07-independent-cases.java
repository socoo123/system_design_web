// Independent reviewer cases; compiled with the author's unchanged source.
class Ch07IndependentCases {
 static int n;
 static void ok(boolean b){n++;if(!b)throw new AssertionError(n);}
 static void invalid(int worker,long lo,long hi){try{new IdExample.Window(worker,lo,hi);throw new AssertionError();}catch(IllegalArgumentException expected){n++;}}
 public static void main(String[] args){
  invalid(-1,1,2);invalid(1024,1,2);invalid(0,0,2);invalid(0,2,2);invalid(0,1,(1L<<41)+1);
  IdExample.FakeClock c=new IdExample.FakeClock(1);
  IdExample.Generator g=new IdExample.Generator(new IdExample.Window(0,1,2),c);
  ok(g.nextId()==(1L<<22));c.wall=2;
  IdExample.fails(g::nextId,"outside");c.wall=1;IdExample.fails(g::nextId,"HALTED");n+=2;
  IdExample.FakeClock r=new IdExample.FakeClock(2000);IdExample.Generator rollback=new IdExample.Generator(new IdExample.Window(8,1,4000),r);
  long before=rollback.nextId();r.wall=1996;r.advance=true;
  long after=rollback.nextId();ok(after==before+1);ok(r.elapsed==4_000_000);
  IdExample.FakeClock t=new IdExample.FakeClock(2000);IdExample.Generator deadline=new IdExample.Generator(new IdExample.Window(8,1,4000),t);
  deadline.nextId();t.wall=1995;t.advance=true;IdExample.fails(deadline::nextId,"wait budget");n++;
  // A and B coexist with the same worker but disjoint timestamps.
  IdExample.FakeClock aClock=new IdExample.FakeClock(1000), bClock=new IdExample.FakeClock(1030);
  IdExample.Generator a=new IdExample.Generator(new IdExample.Window(7,1000,1030),aClock);
  IdExample.Generator b=new IdExample.Generator(new IdExample.Window(7,1030,1060),bClock);
  long bFirst=b.nextId(),aLate=a.nextId();ok(aLate<bFirst && (aLate>>>22)==1000 && (bFirst>>>22)==1030);
  System.out.println("PASS independent reviewer "+n+" bounds/rollback/deadline/late-owner checks");
 }
}
