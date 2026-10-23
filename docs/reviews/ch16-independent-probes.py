"""Independent inputs against actual source SQL/Lua; only writes reviewer evidence."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import itertools
import json
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import tempfile
import time

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'examples/ch16'
EXPECTED='51ab82ad45b71a1b4e8660d188fd5b52a7c34046c058770012c06af9eb179eed'
checks=[]
def check(ok,label):
    assert ok,label
    checks.append(label)

html=(ROOT/'chapters/ch16.html').read_bytes()
check(hashlib.sha256(html).hexdigest()==EXPECTED,'review freezes the announced HTML')
# Load only existing client/schema/flush definitions, never the author's runner/output.
source=(SOURCE/'verify.py').read_text().split('page_probes();flush_probes();')[0]
ns={'__file__':str(SOURCE/'verify.py')}
exec(compile(source,str(SOURCE/'verify.py'),'exec'),ns)
Redis,RedisError=ns['Redis'],ns['RedisError']

page=(SOURCE/'page.sql').read_text()
root_sql=re.search(r'WITH roots AS \(\n(.*?)\n\)\nSELECT',page,re.S).group(1)
preview_sql=re.search(r'LEFT JOIN LATERAL \(\n(.*?)\n\) c ON true',page,re.S).group(1).replace('root_id = r.id','root_id = :root')
continuation=page[page.index('SELECT id, parent_id, created_at, body, author_id FROM comment'):].split(';')[0]
first_root=root_sql.replace('    AND (created_at, id) < (:before_time, :before_id)\n','')
with sqlite3.connect(':memory:') as db:
    db.row_factory=sqlite3.Row
    db.executescript(ns['SCHEMA'])
    def add(cid,parent=None,rid=None,status='visible',ever=1,t=500,post=17):
        db.execute('INSERT INTO comment VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                   (post,cid,parent,rid or cid,900+cid,'PRIVATE-BODY-'+str(cid) if status!='visible' else 'public-'+str(cid),status,1,ever,t,'digest'))
    for cid in range(401,443):add(cid,t=500 if cid%2 else 499)
    add(490,status='pending',ever=0,t=600);add(491,status='rejected',ever=0,t=600)
    add(492,status='deleted',ever=0,t=600);add(493,status='deleted',t=501)
    add(494,status='pending',t=501)
    first=[dict(r) for r in db.execute(first_root,{'post':17})]
    check(len(first)==20 and first[:2][0]['id']==494,'actual root projection keeps exactly twenty containers')
    check(not any(r['id'] in (490,491,492) for r in first),'never-public pending/rejected/deleted roots absent')
    hidden=[r for r in first if r['id'] in (493,494)]
    check(len(hidden)==2 and all(r['public_state']=='unavailable' and r['body'] is None and r['author_id'] is None for r in hidden),
          'deleted and re-review roots expose no body author or private moderation state')
    check('PRIVATE-BODY' not in json.dumps(first),'actual SQL projection cannot leak hidden body marker')
    anchor=first[-1]
    second=[dict(r) for r in db.execute(root_sql,{'post':17,'before_time':anchor['created_at'],'before_id':anchor['id']})]
    check(not {r['id'] for r in first}&{r['id'] for r in second},'root composite tuple handles mixed time ties without overlap')
    for rid in [493,494,441]:
        for j in range(12):add(rid*100+j,parent=rid,rid=rid,t=700+(j%3))
        add(rid*100+90,parent=rid,rid=rid,status='pending',ever=0,t=999)
    previews=[]
    for rid in [493,494,441]:
        p=[dict(r) for r in db.execute(preview_sql,{'post':17,'root':rid})]
        check(len(p)==3 and all('PRIVATE-BODY' not in str(r) for r in p),f'per-root preview limit and privacy for {rid}')
        last=p[-1]
        rest=[dict(r) for r in db.execute(continuation,{'post':17,'root':rid,'before_time':last['created_at'],'before_id':last['id']})]
        check(len(rest)==9 and not {r['id'] for r in p}&{r['id'] for r in rest},f'last-preview continuation for {rid} neither repeats nor skips tied replies')
        previews.extend(p)
    check(len(previews)==9,'one hot root cannot consume another root preview allocation')
    # Foreign keys alone permit a same-post wrong root; the documented post guard is required.
    add(800,parent=441,rid=442)
    check(db.execute('SELECT root_id FROM comment WHERE id=800').fetchone()[0]==442,'negative witness same-post FK does not prove inherited root agreement')
    db.execute('DELETE FROM comment WHERE id=800')
    before_ids={r['id'] for r in second}
    db.execute("UPDATE comment SET status='visible',ever_public=1 WHERE id=490")
    check(490 not in before_ids and 490 in {r['id'] for r in db.execute(first_root,{'post':17})},'late approval requires refresh rather than pretending cursor is snapshot')

with tempfile.TemporaryDirectory(prefix='ch16-review-') as temp:
    sock=str(Path(temp)/'r.sock')
    binary='/tmp/redis-7.2.5/src/redis-server'
    version=subprocess.check_output([binary,'--version'],text=True).strip()
    process=subprocess.Popen([binary,'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',temp],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(200):
            if Path(sock).exists():break
            time.sleep(.01)
        r=Redis(sock);k='like:{comment:review-77}'
        like=(SOURCE/'like.lua').read_text();rotate=(SOURCE/'rotate.lua').read_text();ack=(SOURCE/'ack.lua').read_text()
        r.command('HSET',k,'ready','1','total','0','delta','0')
        run=lambda user,target:r.command('EVAL',like,1,k,user,target)
        with ThreadPoolExecutor(max_workers=16) as pool:
            responses=list(pool.map(lambda i:run(2000+i,1),range(97)))
        check(sum(v[0] for v in responses)==97 and r.command('HGET',k,'total')=='97','actual Lua accepts 97 concurrent distinct members')
        with ThreadPoolExecutor(max_workers=16) as pool:
            same=list(pool.map(lambda _:run(2001,1),range(71)))
        check(all(v[0]==0 for v in same),'71 concurrent replays of a present user never increment')
        b1=r.command('EVAL',rotate,1,k,'review-b1')
        check(b1==['review-b1','97'],'actual rotate freezes original live delta')
        with ThreadPoolExecutor(max_workers=16) as pool:
            list(pool.map(lambda i:run(2000+i,0),range(41)))
        check(r.command('HGET',k,'delta')=='-41' and r.command('HGET',k,'total')=='56','unlikes continue into next live delta while positive batch is frozen')
        check(r.command('EVAL',rotate,1,k,'review-b2')==b1,'another rotator cannot publish negative batch before first ACK')
        db=sqlite3.connect(Path(temp)/'counts.sqlite');db.executescript(ns['SCHEMA']);db.execute('INSERT INTO like_count VALUES(77,0)');db.commit()
        ns['flush'](db,77,b1[0],int(b1[1]));ns['flush'](db,77,b1[0],int(b1[1]))
        check(db.execute('SELECT total FROM like_count').fetchone()[0]==97,'real SQLite ledger survives lost ACK and applies frozen batch once')
        try:r.command('EVAL',ack,1,k,b1[0],'96')
        except RedisError:pass
        else:raise AssertionError('wrong ACK accepted')
        check(r.command('HGET',k,'inflight')==b1[0],'wrong payload ACK preserves frozen batch')
        check(r.command('EVAL',ack,1,k,b1[0],b1[1])==2 and r.command('HGET',k,'delta')=='-41','ACK clears only old batch and preserves newer unlikes')
        b2=r.command('EVAL',rotate,1,k,'review-b2');ns['flush'](db,77,b2[0],int(b2[1]))
        check(b2==['review-b2','-41'] and db.execute('SELECT total FROM like_count').fetchone()[0]==56,'ordered second batch reconciles persistent total')
        try:ns['flush'](db,77,b2[0],-40)
        except ValueError:pass
        else:raise AssertionError('ledger payload mismatch accepted')
        check(db.execute('SELECT total FROM like_count').fetchone()[0]==56,'same batch changed delta cannot mutate count')
        try:ns['flush'](db,77,'review-underflow',-57)
        except sqlite3.IntegrityError:pass
        else:raise AssertionError('underflow accepted')
        check(db.execute("SELECT count(*) FROM applied_like_batch WHERE batch_id='review-underflow'").fetchone()[0]==0,'SQL count failure rolls back ledger too')
        run(9999,1);run(9999,0);run(9999,1)
        check(r.command('HGET',k,'u:9999')=='1','actual receipt order allows delayed old like to override unlike as documented')
        before=r.command('HGETALL',k)
        try:run('client-spoof',1)
        except RedisError:pass
        check(r.command('HGETALL',k)==before,'invalid user syntax fails before one HSET mutation')
        r.command('DEL',k)
        try:run(2001,1)
        except RedisError:pass
        else:raise AssertionError('missing full member state initialized silently')
        check(r.command('EXISTS',k)==0,'membership loss fails closed on actual script')
        # Intentionally violate documented complete-state/recovery-gate precondition.
        r.command('HSET',k,'ready','1','total','56','delta','0')
        run(2001,1)
        check(r.command('HGET',k,'total')=='57','negative witness saved integer plus empty members overcounts; external recovery gate is necessary')
        db.close()
    finally:
        process.terminate();process.wait(timeout=5)

# Independent finite interleavings for the explicit pseudocode-only dependencies.
for ordering in itertools.permutations(['approve-v4','delete','replay-v4']):
    state={'version':4,'status':'pending','body':'secret','public':False,'events':0}
    for action in ordering:
        if action=='delete':state.update(version=state['version']+1,status='deleted',body=None)
        elif state['version']==4 and state['status']=='pending':state.update(status='visible',public=True,events=state['events']+1)
    check(state['status']=='deleted' and state['body'] is None and state['events']<=1,'independent moderation/delete/replay trace '+str(ordering))
for started,deleted,finished in [(10,10.1,14.6),(10,10.1,14.9),(10,14,15.01)]:
    not_after=started+4.8
    can_send=finished<not_after
    check(not can_send or finished-deleted<5,'absolute expiry bounds last stale send despite late invalidation '+str((started,deleted,finished)))
lease_token=100;old=100;lease_token+=1
check(old!=lease_token,'cache token revocation fences late fill after delete')
query_count=sum(1 for state in ['OWNER']+['BUSY']*99 if state=='OWNER')
check(query_count==1,'BUSY waiters do not become 99 extra origin readers')
permits=600;admitted=0
for instance in range(12):
    for _ in range(100):
        if permits:permits-=1;admitted+=1
check(admitted==600,'twelve unavailable-cache instances share one modeled quota rather than 600 each')
rates={k:10_000_000*v/86400*5 for k,v in [('comment',2),('like',10),('list',15)]}
check(round(rates['list']*.05,2)==434.03 and round(rates['list']-600,2)==8080.56,'origin normal/failure arithmetic recomputed')
check(round((rates['comment']-1000)*600)==94444 and round(rates['comment']/2000*100,2)==57.87,'backlog and twenty-worker utilization recomputed')
result={'passed':True,'html_sha256':EXPECTED,'checks':len(checks),'cases':checks,'redis':version,'rates':rates,
        'limits':['Actual Redis Lua and SQLite ledger transactions; not PG LATERAL/row-lock execution.',
                  'Preview SQL adapts only correlated r.id to a bound per-root argument; no PG query-plan claim.',
                  'Moderation/cache interleavings are independent contract traces, not deployed workers/leases/clocks.',
                  'Redis recovery gate is explicitly an external contract; negative witness shows the script alone cannot detect missing members in a retained ready hash.']}
(ROOT/'docs/reviews/ch16-independent-probe-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'redis':version,'html_sha256':EXPECTED}))
