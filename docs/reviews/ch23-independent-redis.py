#!/usr/bin/env python3
import sys
sys.dont_write_bytecode=True
import json,socket,subprocess,tempfile,time,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class RedisError(Exception):pass
class Client:
 def __init__(self,path,user=None):self.path=path;self.user=user
 def call(self,*args):
  def send(s,values):
   vals=[str(x).encode() for x in values];s.sendall(b'*'+str(len(vals)).encode()+b'\r\n'+b''.join(b'$'+str(len(x)).encode()+b'\r\n'+x+b'\r\n' for x in vals))
  def read(f):
   line=f.readline();kind,body=line[:1],line[1:-2]
   if kind==b'-':raise RedisError(body.decode())
   if kind==b'+':return body.decode()
   if kind==b':':return int(body)
   if kind==b'$':
    n=int(body)
    if n<0:return None
    value=f.read(n);assert f.read(2)==b'\r\n';return value.decode()
   if kind==b'*':return [read(f) for _ in range(int(body))]
   raise RuntimeError(line)
  with socket.socket(socket.AF_UNIX) as s:
   s.settimeout(5);s.connect(self.path)
   with s.makefile('rb') as f:
    if self.user:send(s,['AUTH',self.user,'review-local-only']);read(f)
    send(s,args);return read(f)
checks=[]
def check(name,condition,details=None):
 assert condition,name
 checks.append({'name':name,'passed':True,'details':details})
def reject(name,fn):
 try:fn()
 except RedisError as e:check(name,True,str(e));return str(e)
 raise AssertionError(name)
project=(ROOT/'examples/ch23/project.lua').read_text();around=(ROOT/'examples/ch23/around.lua').read_text()
with tempfile.TemporaryDirectory(prefix='ch23-independent-redis-') as tmp:
 sock=str(Path(tmp)/'redis.sock')
 proc=subprocess.Popen(['/tmp/redis-7.2.5/src/redis-server','--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',tmp],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
 try:
  for _ in range(100):
   if Path(sock).exists():break
   time.sleep(.02)
  c=Client(sock);scope='review:special-season:global:b9';epoch='E11'
  keys=[f'lb:{{{scope}:{epoch}}}:scores',f'lb:{{{scope}:{epoch}}}:state']
  c.call('HSET',keys[1],'__scope',scope,'__epoch',epoch,'__mode','SERVING')
  def apply(member,v,value,ep=epoch):return c.call('EVAL',project,2,*keys,scope,ep,member,v,value)
  def read(member,minimum=0,ep=epoch):return c.call('EVAL',around,2,*keys,scope,ep,member,minimum)
  def composite(score,t):return score*3_000_001+3_000_000-t
  for i in range(1,24):check('apply member '+str(i),apply(f'{i:012d}',31,composite(47,91))=='APPLIED')
  middle=read('000000000012',31);top=read('000000000023',31);tail=read('000000000001',31)
  check('middle around reads ordinal12 and exactly11 rows',middle[0]=='OK' and middle[3]==12 and len(middle[4])==22 and middle[4][10]=='000000000012',middle)
  check('top and tail clamp to six rows',len(top[4])==12 and len(tail[4])==12)
  check('minimum future version returns pending',read('000000000012',32)[0]=='PENDING')
  check('missing positive-version member pending',read('000000000099',1)[0]=='PENDING')
  check('missing no-minimum member unranked',read('000000000099')[0]=='UNRANKED')
  before=c.call('ZSCORE',keys[0],'000000000012')
  reject('same version changed composite conflicts',lambda:apply('000000000012',31,composite(48,91)))
  check('conflict changes neither score nor version',c.call('ZSCORE',keys[0],'000000000012')==before and c.call('HGET',keys[1],'p:000000000012')=='31:'+before)
  check('newer correction lowers rank score',apply('000000000012',33,composite(2,101))=='APPLIED' and read('000000000012',33)[3]==23)
  check('older replay is stale after correction',apply('000000000012',32,composite(47,91))=='STALE')
  reject('wrong epoch write rejected',lambda:apply('000000000012',34,composite(47,91),'E10'))
  reject('wrong epoch read rejected',lambda:read('000000000012',0,'E10'))
  c.call('HSET',keys[1],'__mode','FROZEN')
  reject('frozen epoch cannot mutate',lambda:apply('000000000012',34,composite(47,91)))
  check('frozen epoch can serve bounded reads',read('000000000012',33)[0]=='OK')
  c.call('HSET',keys[1],'__mode','LOADING')
  reject('loading cannot serve',lambda:read('000000000012'))
  c.call('HSET',keys[1],'__mode','SERVING')
  c.call('ZREM',keys[0],'000000000012')
  reject('partial score loss cannot claim unranked/replay success',lambda:read('000000000012'))
  reject('partial score loss blocks stale ACK',lambda:apply('000000000012',32,composite(47,91)))
  # Run the unchanged production-shaped script under an ACL denying only HSET.
  # It reaches ZADD successfully and then errors: Redis does not roll it back.
  writekeys=['lb:{review:acl:E1}:scores','lb:{review:acl:E1}:state'];acl_scope='review:acl'
  c.call('HSET',writekeys[1],'__scope',acl_scope,'__epoch','E1','__mode','SERVING')
  c.call('ACL','SETUSER','writer','on','>review-local-only','~*','+eval','+type','+hget','+zscore','+zadd')
  limited=Client(sock,'writer')
  failure=reject('actual project.lua HSET runtime error after ZADD',lambda:limited.call('EVAL',project,2,*writekeys,acl_scope,'E1','000000000088',1,composite(1,100)))
  check('runtime error retains ZADD but no member state',c.call('ZSCORE',writekeys[0],'000000000088')==str(composite(1,100)) and c.call('HGET',writekeys[1],'p:000000000088') is None,failure)
  c.call('HSET',writekeys[1],'__mode','FROZEN')
  reject('quarantine/freeze prevents further application',lambda:c.call('EVAL',project,2,*writekeys,acl_scope,'E1','000000000089',1,composite(1,100)))
  version=c.call('INFO','server').splitlines()[1]
 finally:proc.terminate();proc.wait(timeout=5)
result={'passed':True,'redis':version,'checks':checks,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['examples/ch23/project.lua','examples/ch23/around.lua']},'limits':['One own Unix-socket Redis7.2.5; not Cluster/replication/OOM/health-controller verification','Actual unchanged Lua scripts invoked with new probes; ACL denied HSET to expose no rollback']}
(ROOT/'docs/reviews/ch23-independent-redis-results.json').write_text(json.dumps(result,indent=2)+'\n')
print('independent real Redis checks',len(checks))
