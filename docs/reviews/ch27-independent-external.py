"""Independent Java 17 boundaries and isolated actual Redis GEO/TTL calls."""
import hashlib,json,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
result={'java':{},'redis':{'checks':[]}}
with tempfile.TemporaryDirectory(prefix='c27e-') as tmp:
 java=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
 source=ROOT/'examples/ch27/LocationGate.java';probe=ROOT/'docs/reviews/ch27-independent-LocationReview.java'
 compile_run=subprocess.run([str(java/'javac'),'--release','17','-d',tmp,str(source),str(probe)],capture_output=True,text=True)
 assert compile_run.returncode==0,compile_run.stderr
 run=subprocess.run([str(java/'java'),'-cp',tmp,'Ch27LocationReview'],capture_output=True,text=True)
 assert run.returncode==0,run.stderr
 result['java']={'passed':True,'checks':23,'stdout':run.stdout.strip(),'version':subprocess.run([str(java/'java'),'-version'],capture_output=True,text=True).stderr.splitlines()[0],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'probeSha256':hashlib.sha256(probe.read_bytes()).hexdigest()}
 server=Path('/tmp/redis-7.2.5/src/redis-server');cli=server.with_name('redis-cli');sock=str(Path(tmp,'r.sock'))
 proc=subprocess.Popen([str(server),'--port','0','--unixsocket',sock,'--unixsocketperm','700','--save','','--appendonly','no','--dir',tmp],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 def redis(*args):
  r=subprocess.run([str(cli),'-s',sock,'--raw',*map(str,args)],capture_output=True,text=True,timeout=3)
  if r.returncode:raise RuntimeError(r.stderr)
  return r.stdout.strip()
 def check(name,condition):
  assert condition,name
  result['redis']['checks'].append(name)
 try:
  end=time.monotonic()+3
  while True:
   try:
    if redis('PING')=='PONG':break
   except RuntimeError:pass
   assert time.monotonic()<end,'Redis startup timeout'
   time.sleep(.02)
  check('two geospatial members stored',redis('GEOADD','geo:test',121,31,'fresh-id',121.0001,31.0001,'stale-id')=='2')
  check('radius query returns both IDs without business eligibility',set(redis('GEOSEARCH','geo:test','FROMLONLAT',121,31,'BYRADIUS',1,'km').splitlines())=={'fresh-id','stale-id'})
  redis('SET','detail:fresh-id','detail','PX',100)
  check('independent GEO key has no TTL',redis('PTTL','geo:test')=='-1')
  end=time.monotonic()+2
  while redis('EXISTS','detail:fresh-id')!='0':
   assert time.monotonic()<end,'detail expiration timeout'
   time.sleep(.02)
  check('detail expires through real Redis key TTL',redis('GET','detail:fresh-id')=='')
  check('detail expiry does not remove GEO membership',redis('ZCARD','geo:test')=='2')
  check('bounded GEO query still returns stale member',redis('GEOSEARCH','geo:test','FROMLONLAT',121,31,'BYRADIUS',1,'km','COUNT',1) in ('fresh-id','stale-id'))
  redis('PEXPIRE','geo:test',100)
  end=time.monotonic()+2
  while redis('EXISTS','geo:test')!='0':
   assert time.monotonic()<end,'GEO key expiration timeout'
   time.sleep(.02)
  check('expiring whole GEO key removes every member',redis('ZCARD','geo:test')=='0')
  result['redis']['version']=redis('INFO','server').split('redis_version:')[1].splitlines()[0]
  result['redis']['passed']=True
 finally:
  proc.terminate();proc.wait(timeout=3)
result['passed']=True
(ROOT/'docs/reviews/ch27-independent-external-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'javaChecks':result['java']['checks'],'redisChecks':len(result['redis']['checks']),'passed':True}))
