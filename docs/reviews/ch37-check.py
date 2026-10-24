from pathlib import Path
from decimal import Decimal as D
import hashlib
import json
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'examples/ch37'
JDK=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
sources=[ROOT/'chapters/ch37.html',*sorted(p for p in HERE.iterdir() if p.is_file())]
def hashes():return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
result={'sourceHashesBefore':hashes(),'commands':[]}
def run(args):
 p=subprocess.run([str(a) for a in args],cwd=ROOT,capture_output=True,text=True,timeout=120)
 row={'command':[str(a) for a in args],'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
 result['commands'].append(row)
 if p.returncode:raise RuntimeError(row)
 return p.stdout
try:
 run(['node','tools/check.mjs'])
 run(['node','tools/audit-chapter.mjs','ch37'])
 run([sys.executable,HERE/'check_sources.py'])
 run([sys.executable,HERE/'run_contracts.py','--output',ROOT/'docs/reviews/ch37-contract-results.json'])
 with tempfile.TemporaryDirectory(prefix='ch37-java-') as build:
  run([JDK/'javac','-version'])
  run([JDK/'javac','-d',build,HERE/'ExactSum.java',HERE/'ExactSumTest.java'])
  result['java']=json.loads(run([JDK/'java','-cp',build,'ExactSumTest']))
 run(['node','--check','docs/reviews/ch37-render.mjs'])
 run(['node','--check','docs/reviews/ch37-browser.mjs'])
 run(['node','--check','docs/reviews/ch37-ui-baseline.mjs'])
 run(['git','diff','--check'])
 result['passed']=True
finally:
 result['sourceHashesAfter']=hashes();result['sourcesStable']=result['sourceHashesBefore']==result['sourceHashesAfter']
 (ROOT/'docs/reviews/ch37-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'passed':result.get('passed',False),'commands':len(result['commands']),'sourcesStable':result['sourcesStable']}))

numbers=[]
def calc(label,expression,value,expected,unit):
 assert value==D(expected),(label,value)
 numbers.append({'assumption':label,'expression':expression,'value':str(value),'unit':unit})
calc('A1 peak','40*8',D(40)*8,'320','txn/s')
calc('A1 day','40*86400',D(40)*86400,'3456000','orders/day')
calc('A1 year','40*86400*365',D(40)*86400*365,'1261440000','orders/year')
year=D(40)*86400*365
calc('A2 snapshots','year*1500',year*1500,'1892160000000','B')
calc('A2 indexes','year*2*40',year*2*40,'100915200000','B')
copy=year*1580
calc('A2 one copy','year*(1500+80)',copy,'1993075200000','B')
calc('A5 copies and backup','copy*4',copy*4,'7972300800000','B')
calc('A5 retained versions','copy*(3*1.5+1)',copy*(3*D('1.5')+1),'10961913600000','B')
calc('A2 peak payload','320*1500',D(320)*1500,'480000','B/s')
calc('A2 decimal peak','480000/1000000',D(480000)/1000000,'0.48','MB/s')
calc('A6 page','8*1024',D(8)*1024,'8192','B')
calc('A6 three pages','320*3*8192',D(320)*3*8192,'7864320','B/s')
calc('A6 page amplification','3*8192/1500',D(3)*8192/1500,'16.384','ratio')
calc('A3 avg reads','40*20',D(40)*20,'800','QPS')
calc('A3 peak reads','320*20',D(320)*20,'6400','QPS')
calc('A7 hot key','320*0.30',D(320)*D('0.30'),'96','updates/s')
calc('A7 serial utilization','96*0.010',D(96)*D('0.010'),'0.96','ratio')
calc('A8 message payload','2000*400',D(2000)*400,'800000','B/s')
calc('A8 recent messages','50*400',D(50)*400,'20000','B')
calc('A10 postings','80*20',D(80)*20,'1600','B/document')
calc('A11 amount stripes','year*8',year*8,'10091520000','B')
calc('A11 amount and status','year*9',year*9,'11352960000','B')
calc('A11 raw byte ratio','1500/8',D(1500)/8,'187.5','ratio')
calc('A12 WA=6','10*6',D(10)*6,'60','MB/s')
calc('A12 WA=12','10*12',D(10)*12,'120','MB/s')
(ROOT/'docs/reviews/ch37-numeric-review.json').write_text(json.dumps({'passed':True,'calculations':numbers,'scope':'teaching assumptions; not measured I/O, capacity or SLO'},indent=2)+'\n')
