#!/usr/bin/env python3
"""Execute the chapter's exact Lua with a disposable Redis over a Unix socket.
Usage: python3 examples/ch04/verify.py /absolute/path/to/redis-server
"""
from pathlib import Path
import concurrent.futures, hashlib, html, json, re, socket, subprocess, sys, tempfile, time
ROOT = Path(__file__).resolve().parents[2]
LUA = (ROOT/'examples/ch04/token-bucket.lua').read_text()
PAGE = (ROOT/'chapters/ch04.html').read_text()
assert html.unescape(re.search(r'<pre data-language="Lua[^>]*><code>(.*?)</code></pre>', PAGE, re.S)[1]) == LUA
results = []
class RedisError(Exception): pass

def encode(args):
    parts = [str(a).encode() for a in args]
    return b'*%d\r\n'%len(parts)+b''.join(b'$%d\r\n'%len(p)+p+b'\r\n' for p in parts)
def read(f):
    line=f.readline(); kind,data=line[:1],line[1:-2]
    if kind==b'-': raise RedisError(data.decode())
    if kind==b'+': return data.decode()
    if kind==b':': return int(data)
    if kind==b'$':
        if int(data)==-1:return None
        value=f.read(int(data));f.read(2);return value.decode()
    if kind==b'*':return [read(f) for _ in range(int(data))]
    raise RuntimeError(line)
with tempfile.TemporaryDirectory(prefix='ch04-redis-') as folder:
    sock=folder+'/redis.sock'
    log=open(folder+'/redis.log','w')
    proc=subprocess.Popen([sys.argv[1],'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',folder],stdout=log,stderr=log)
    def call(*args, user=None):
        with socket.socket(socket.AF_UNIX) as c:
            c.settimeout(5);c.connect(sock);f=c.makefile('rb')
            if user:c.sendall(encode(['AUTH',user,'test']));read(f)
            c.sendall(encode(args));return read(f)
    def evaluate(key,cost=1,script=LUA,*extra): return call('EVAL',script,1,key,cost,*extra)
    def state(key,credit,last):return call('SET',key,json.dumps({'v':1,'credit':credit,'last':last}))
    def now():
        s,u=call('TIME');return int(s)*1000+int(u)//1000
    def record(name,details):results.append({'name':name,'passed':True,**details})
    try:
        for _ in range(100):
            if Path(sock).exists():break
            time.sleep(.02)
        version=call('INFO','server').split('redis_version:')[1].split('\r')[0]
        # Controlled time changes only the TIME acquisition line, not the algorithm.
        fixed=LUA.replace("local time = redis.call('TIME')", "local time = {ARGV[2], '0'}")
        base=now()//1000
        # Seed the full t=0 bucket and replay the diagram without wall-clock waiting.
        state('deck',60000,base*1000)
        deck=[evaluate('deck',c,fixed,base+t) for t,c in [(10,1),(10,1),(10,1),(20,1),(20,1),(25,1)]]
        assert deck==[[1,45000,0],[1,30000,0],[1,15000,0],[1,10000,0],[0,10000,5000],[1,0,0]],deck
        record('deck2_exact_trace_real_redis_injected_TIME',{'returns':deck})
        # Actual TIME, last in near future -> zero refill during 20 concurrent requests.
        state('race',15000,now()+5000)
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            race=list(pool.map(lambda _:evaluate('race'),range(20)))
        assert sum(x[0] for x in race)==1 and json.loads(call('GET','race'))['credit']==0
        record('20_clients_last_token_exact_source',{'allowed':1,'denied':19})
        current=now();future=current+100000
        state('rollback',0,future)
        rb=evaluate('rollback');ttl=call('PTTL','rollback');saved=json.loads(call('GET','rollback'))
        assert rb[0:2]==[0,0] and 114000<=rb[2]<=115000 and 219000<=ttl<=220000 and saved['last']==future
        record('rollback_debt_exact_source',{'reply':rb,'ttl_ms':ttl,'last_preserved':True})
        for invalid in [0,5,1.5,'NaN','bad']:
            try:evaluate('badcost',invalid);raise AssertionError('accepted bad cost')
            except RedisError:pass
        assert call('GET','badcost') is None
        for invalid in ['false','null','12','{broken','{"v":2,"credit":1,"last":1}','{"v":1,"credit":-1,"last":1}','{"v":1,"credit":1,"last":9000000000001}']:
            call('SET','badstate',invalid)
            try:evaluate('badstate');raise AssertionError('accepted bad state')
            except RedisError:pass
            assert call('GET','badstate')==invalid
        record('invalid_cost_state_rejected_before_write',{'unchanged':True})
        state('writefail',15000,now()+5000);before=call('GET','writefail')
        call('ACL','SETUSER','limited','on','>test','~*','+eval','+get','+time')
        try:call('EVAL',LUA,1,'writefail',1,user='limited');raise AssertionError('SET should fail')
        except RedisError:pass
        assert call('GET','writefail')==before
        record('SET_permission_failure_no_allow_no_mutation',{'unchanged':True})
        state('lost',60000,now()+5000)
        with socket.socket(socket.AF_UNIX) as c:
            c.connect(sock);c.sendall(encode(['EVAL',LUA,1,'lost',1]))
            # Ensure the response exists, deliberately discard it without decoding.
            c.recv(4096)
        assert json.loads(call('GET','lost'))['credit']==45000
        duplicate=evaluate('lost');assert duplicate[1]==30000
        record('discarded_reply_then_retry_consumes_twice',{'after_retry_credit':duplicate[1]})
        # Small independent contract arithmetic checks, not replication experiments.
        assert 0+7*.5+1<=7 and 7+1>7 and 3+5*.7+1>7
        assert 4*50+4*500==2200 and 1000000*200*2==400000000
        record('window_and_capacity_arithmetic',{'weighted':4.5,'actual':8,'fallback_1s':2200,'memory_bytes':400000000})
        report={'redis_version':version,'lua_sha256':hashlib.sha256(LUA.encode()).hexdigest(),'tests':results,'limits':['No failover, replication-loss, OS-clock-change, eviction or throughput experiment.','Controlled deck timestamps injected only at TIME acquisition; rollback uses seeded future last with real TIME.','Lost response deliberately discarded by test client; no network fault injection.']}
        (ROOT/'docs/reviews/ch04-code-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(report,ensure_ascii=False,indent=2))
    finally:
        proc.terminate();proc.wait(timeout=5);log.close()
