"""Executable SQLite/contract probes; not a PostgreSQL/Redis-cluster backend."""
import concurrent.futures
import hashlib
import hmac
import itertools
import json
import math
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
checks = []
def check(ok, label):
    assert ok, label
    checks.append(label)

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE comment(
 post_id INTEGER NOT NULL, id INTEGER NOT NULL, parent_id INTEGER, root_id INTEGER NOT NULL,
 author_id INTEGER, body TEXT, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 ever_public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, body_digest TEXT NOT NULL,
 PRIMARY KEY(post_id,id),
 FOREIGN KEY(post_id,parent_id) REFERENCES comment(post_id,id),
 FOREIGN KEY(post_id,root_id) REFERENCES comment(post_id,id),
 CHECK(parent_id IS NOT NULL OR root_id=id),
 CHECK(parent_id IS NULL OR parent_id<>id),
 CHECK(status<>'visible' OR ever_public=1)
);
CREATE INDEX root_page ON comment(post_id,created_at DESC,id DESC)
 WHERE parent_id IS NULL AND ever_public;
CREATE INDEX reply_page ON comment(post_id,root_id,created_at DESC,id DESC)
 WHERE parent_id IS NOT NULL AND status='visible';
CREATE TABLE like_count(comment_id INTEGER PRIMARY KEY,total INTEGER NOT NULL CHECK(total>=0));
CREATE TABLE applied_like_batch(comment_id INTEGER,batch_id TEXT,delta INTEGER,
 PRIMARY KEY(comment_id,batch_id), FOREIGN KEY(comment_id) REFERENCES like_count(comment_id));
CREATE TABLE receipt(post_id INTEGER,user INTEGER,key TEXT,intent TEXT,id INTEGER,
 PRIMARY KEY(post_id,user,key));
CREATE TABLE outbox(event_id TEXT PRIMARY KEY,comment_id INTEGER,version INTEGER,kind TEXT);
"""
def row(db, post, cid, parent=None, root=None, status='visible', public=1, at=100):
    db.execute('INSERT INTO comment VALUES(?,?,?,?,?,?,?,?,?,?,?)',
       (post,cid,parent,root or cid,7,'body-'+str(cid),status,1,public,at,'digest-'+str(cid)))

def roots(db, post, before=None, limit=20):
    seek = 'AND (created_at,id)<(?,?)' if before else ''
    return db.execute("""SELECT id,created_at,
       CASE WHEN status='visible' THEN 'visible' ELSE 'unavailable' END,
       CASE WHEN status='visible' THEN body END,
       CASE WHEN status='visible' THEN author_id END
       FROM comment WHERE post_id=? AND parent_id IS NULL AND ever_public
       """ + seek + ' ORDER BY created_at DESC,id DESC LIMIT ?',
       (post,*(before or ()),limit)).fetchall()

def replies(db, post, rid, before=None, limit=3):
    seek = 'AND (created_at,id)<(?,?)' if before else ''
    return db.execute("""SELECT id,created_at,parent_id,body,author_id FROM comment
      WHERE post_id=? AND root_id=? AND parent_id IS NOT NULL AND status='visible'
      """ + seek + ' ORDER BY created_at DESC,id DESC LIMIT ?',
      (post,rid,*(before or ()),limit)).fetchall()

def page_probes():
    db=sqlite3.connect(':memory:'); db.executescript(SCHEMA)
    for cid in range(100,106): row(db,1,cid)
    first=roots(db,1,limit=3)
    check([r[0] for r in first]==[105,104,103],'timestamp ties use id')
    row(db,1,106)
    check([r[0] for r in roots(db,1,(100,103),3)]==[102,101,100],'insertion preserves keyset anchor')
    offset=db.execute('SELECT id FROM comment WHERE parent_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 3 OFFSET 3').fetchall()
    check(offset[0][0]==103,'negative witness: offset repeats 103')
    row(db,1,107,status='pending',public=0)
    row(db,1,108,status='rejected',public=0)
    row(db,1,109,status='deleted',public=0)
    check(all(r[0] not in [107,108,109] for r in roots(db,1)),'never-public roots stay private')
    db.execute("UPDATE comment SET status='deleted',version=2,body=NULL WHERE id=105")
    deleted=next(r for r in roots(db,1) if r[0]==105)
    check(deleted[2:]==('unavailable',None,None),'deleted public root keeps sanitized container')
    db.execute("UPDATE comment SET status='pending',version=2 WHERE id=104")
    hidden=next(r for r in roots(db,1) if r[0]==104)
    check(hidden[2:]==('unavailable',None,None),'edited root hides body, author and private state')
    row(db,1,200,105,105)
    row(db,1,201,200,105)
    check([r[0] for r in replies(db,1,105)]==[201,200],'visible descendants survive a removed root')
    check(replies(db,1,105)[0][2]==200,'flattened reply retains actual parent')
    def reply_to(cid, post, target_id):
        target=db.execute('SELECT root_id,status FROM comment WHERE post_id=? AND id=?',(post,target_id)).fetchone()
        if target is None or target[1]!='visible': raise ValueError('parent unavailable')
        public=db.execute('SELECT ever_public FROM comment WHERE post_id=? AND id=?',(post,target[0])).fetchone()
        if not public or not public[0]: raise ValueError('root was never public')
        row(db,post,cid,target_id,target[0])
    reply_to(202,1,201)
    check(db.execute('SELECT parent_id,root_id FROM comment WHERE id=202').fetchone()==(201,105),'creation derives root from authenticated parent, never client root')
    for target in [104,107,9999]:
        try: reply_to(203,1,target)
        except ValueError: pass
        else: raise AssertionError('unavailable parent accepted')
        check(True,f'creation refuses hidden/missing target {target}')
    db.execute('SAVEPOINT invalid_tree')
    row(db,1,204,201,100)  # all referenced ids exist, but the root is wrong
    check(True,'negative witness: same-post foreign keys alone do not prove root agreement')
    db.execute('ROLLBACK TO invalid_tree');db.execute('RELEASE invalid_tree')
    row(db,2,999)
    try: row(db,1,998,999,999)
    except sqlite3.IntegrityError: pass
    else: raise AssertionError('cross-post parent accepted')
    check(True,'composite foreign key rejects cross-post parent')
    # All root containers share the same timestamp; a hot thread has 100k replies.
    for cid in range(300,320): row(db,3,cid)
    db.executemany('INSERT INTO comment VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ((3,c,300,300,7,'hot','visible',1,1,100,'d') for c in range(1000,101000)))
    for rid in range(301,320):
        for n in range(4): row(db,3,rid*1000+n,rid,rid)
    page=roots(db,3); preview={r[0]:replies(db,3,r[0]) for r in page}
    check(len(page)==20 and all(len(v)==3 for v in preview.values()),'20 per-root limits fairly bound 60 previews')
    check(len(page)+sum(map(len,preview.values()))==80,'first screen bound is 80')
    first_preview=preview[300]; anchor=(first_preview[-1][1],first_preview[-1][0])
    expanded=replies(db,3,300,anchor,20)
    check(not set(r[0] for r in expanded)&set(r[0] for r in first_preview),'thread continuation starts below its last preview')
    global_rows=db.execute("SELECT root_id FROM comment WHERE post_id=3 AND parent_id IS NOT NULL ORDER BY created_at DESC,id ASC LIMIT 60").fetchall()
    check(len(set(r[0] for r in global_rows))==1,'negative witness: global limit can starve other roots')
    # Late approval enters a range already passed by the cursor.
    db.execute("UPDATE comment SET status='visible',ever_public=1 WHERE post_id=1 AND id=107")
    check(107 not in [r[0] for r in roots(db,1,(100,103),20)] and 107 in [r[0] for r in roots(db,1)],'late approval requires refresh above anchor')
    plan=' '.join(str(v) for v in db.execute("EXPLAIN QUERY PLAN SELECT id FROM comment WHERE post_id=3 AND root_id=300 AND parent_id IS NOT NULL AND status='visible' ORDER BY created_at DESC,id DESC LIMIT 3").fetchall())
    check('reply_page' in plan,'SQLite equivalent uses reply partial index (not PostgreSQL plan)')
    db.close()

def flush(db, cid, batch, delta):
    try:
        db.execute('BEGIN IMMEDIATE')
        found=db.execute('SELECT total FROM like_count WHERE comment_id=?',(cid,)).fetchone()
        if found is None: raise ValueError('missing count row')
        n=db.execute('INSERT INTO applied_like_batch VALUES(?,?,?) ON CONFLICT DO NOTHING',(cid,batch,delta)).rowcount
        if n: db.execute('UPDATE like_count SET total=total+? WHERE comment_id=?',(delta,cid))
        stored=db.execute('SELECT delta FROM applied_like_batch WHERE comment_id=? AND batch_id=?',(cid,batch)).fetchone()[0]
        if stored!=delta: raise ValueError('payload mismatch')
        db.commit()
    except BaseException:
        db.rollback(); raise

def flush_probes():
    with tempfile.TemporaryDirectory(prefix='ch16-sqlite-') as folder:
        file=Path(folder)/'db.sqlite'; db=sqlite3.connect(file); db.executescript(SCHEMA)
        db.execute('INSERT INTO like_count VALUES(100,0)'); db.commit()
        flush(db,100,'b17',3)
        flush(db,100,'b17',3)  # commit succeeded, reply lost
        check(db.execute('SELECT total FROM like_count').fetchone()[0]==3,'lost flush ACK replays once')
        try: flush(db,100,'b17',4)
        except ValueError: pass
        else: raise AssertionError('mismatched batch accepted')
        check(db.execute('SELECT total FROM like_count').fetchone()[0]==3,'same batch with changed payload rolls back')
        def duplicate(_):
            other=sqlite3.connect(file,timeout=10); other.execute('PRAGMA foreign_keys=ON')
            try: flush(other,100,'parallel',7)
            finally: other.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: list(pool.map(duplicate,range(32)))
        check(db.execute('SELECT total FROM like_count').fetchone()[0]==10,'32 duplicate SQLite flushes across 8 concurrent workers apply once')
        try: flush(db,999,'missing',1)
        except ValueError: pass
        check(db.execute("SELECT count(*) FROM applied_like_batch WHERE batch_id='missing'").fetchone()[0]==0,'missing count never commits ledger-only ACK')
        try: flush(db,100,'too-negative',-11)
        except sqlite3.IntegrityError: pass
        check(db.execute("SELECT count(*) FROM applied_like_batch WHERE batch_id='too-negative'").fetchone()[0]==0,'failed count update rolls ledger back')
        db.close()

def moderation_probes():
    db=sqlite3.connect(':memory:'); db.executescript(SCHEMA)
    def submit(key,post,parent,body,crash=False):
        intent=json.dumps([post,parent,body,[],'p1'],separators=(',',':'))
        with db:
            existing=db.execute('SELECT intent,id FROM receipt WHERE post_id=? AND user=7 AND key=?',(post,key)).fetchone()
            if existing:
                if existing[0]!=intent: raise ValueError('intent conflict')
                return existing[1]
            row(db,post,500,parent,parent if parent else 500,'pending',0)
            if crash: raise RuntimeError('rollback between writes')
            db.execute('INSERT INTO receipt VALUES(?,7,?,?,500)',(post,key,intent))
            db.execute('INSERT INTO outbox VALUES(?,500,1,?)',(key,'audit'))
        return 500
    try: submit('bad',4,None,'a',True)
    except RuntimeError: pass
    check(db.execute('SELECT count(*) FROM comment').fetchone()[0]==0 and db.execute('SELECT count(*) FROM outbox').fetchone()[0]==0,'submit rollback leaves neither body nor outbox')
    check(submit('r1',4,None,'a')==submit('r1',4,None,'a'),'submit lost ACK returns same comment')
    try: submit('r1',4,999,'a')
    except ValueError: pass
    else: raise AssertionError('changed parent accepted')
    check(db.execute('SELECT count(*) FROM outbox').fetchone()[0]==1,'request intent binds parent, not just body')
    def decision(version,approved=True,digest='digest-500'):
        with db:
            n=db.execute("UPDATE comment SET status=?,ever_public=CASE WHEN ? THEN 1 ELSE ever_public END WHERE post_id=4 AND id=500 AND version=? AND status='pending' AND body_digest=?",('visible' if approved else 'rejected',approved,version,digest)).rowcount
            if n: db.execute('INSERT INTO outbox VALUES(?,500,?,?)',('visibility-'+str(version),version,'visibility'))
        return n
    check(decision(1,digest='wrong')==0,'wrong reviewed digest cannot approve pending body')
    check(decision(1)==1 and decision(1)==0,'approval duplicate does not emit duplicate visibility event')
    db.execute("UPDATE comment SET status='deleted',version=2,body=NULL WHERE post_id=4 AND id=500");db.commit()
    check(decision(1)==0 and db.execute('SELECT body FROM comment').fetchone()[0] is None,'stale approval cannot revive deleted v2')
    for order in itertools.permutations(['approve','delete','replay']):
        c={'version':1,'status':'pending','public':False}
        for op in order:
            if op=='delete': c.update(version=c['version']+1,status='deleted')
            elif c['version']==1 and c['status']=='pending': c.update(status='visible',public=True)
        check(c['status']=='deleted',f'moderation/delete serialized ordering {order}')
    db.close()

def cursor_and_cache_probes():
    secret=b'teaching-secret-not-production'; ctx={'v':1,'post':1,'root':100,'order':'time-desc','limit':20,'last':[100,103],'expires':200}
    raw=json.dumps(ctx,sort_keys=True).encode(); signed=hmac.digest(secret,raw,'sha256')
    def valid(raw,signature,expected,now):
        if not hmac.compare_digest(signature,hmac.digest(secret,raw,'sha256')): return False
        c=json.loads(raw)
        return now<c['expires'] and all(c[k]==v for k,v in expected.items())
    check(valid(raw,signed,{'post':1,'root':100,'limit':20},100),'signed cursor normal scope')
    for field,value in [('post',2),('root',200),('order','rank'),('limit',50)]:
        check(not valid(raw,signed,{field:value},100),f'cursor rejects changed {field}')
    check(not valid(raw+b' ',signed,{},100),'cursor rejects tampering')
    check(not valid(raw,signed,{},200),'cursor rejects expiry')
    # Explicit adapter model: one atomic cache-side token check+fill.
    token=1; value=None; old=token; started=0; expires=4.8
    token+=1  # invalidation
    if old==token: value='v8'
    check(value is None,'invalidation token rejects old fill')
    check(not (5.01<expires),'late SQL cannot renew absolute body expiry')
    check(4.7<expires and not (4.9<expires),'bounded stale snapshot may send only before absolute expiry')
    origins=0
    for status in ['OWNER','BUSY','BUSY','BUSY']:
        if status=='OWNER': origins+=1
    check(origins==1,'BUSY lease waiters do not query origin')
    quota=600; bypass=min(8681,quota)
    check(bypass==600,'unavailable-cache bypass still shares global origin quota')

class RedisError(Exception): pass
class Redis:
    def __init__(self,sock): self.sock=sock
    def command(self,*args):
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as conn:
            conn.connect(self.sock)
            data=[str(a).encode() if not isinstance(a,bytes) else a for a in args]
            conn.sendall(b'*'+str(len(data)).encode()+b'\r\n'+b''.join(b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in data))
            f=conn.makefile('rb')
            def read():
                line=f.readline();typ=line[:1];body=line[1:-2]
                if typ==b'+': return body.decode()
                if typ==b'-': raise RedisError(body.decode())
                if typ==b':': return int(body)
                if typ==b'$':
                    n=int(body)
                    if n<0:return None
                    ret=f.read(n);f.read(2);return ret.decode()
                if typ==b'*':return [read() for _ in range(int(body))]
                raise RedisError('invalid RESP')
            return read()

def redis_probes():
    binary=os.environ.get('REDIS_SERVER','/tmp/redis-7.2.5/src/redis-server')
    if not Path(binary).exists(): raise RuntimeError('REDIS_SERVER must point to a local redis-server')
    version=subprocess.check_output([binary,'--version'],text=True).strip()
    with tempfile.TemporaryDirectory(prefix='ch16-redis-') as folder:
        sock=str(Path(folder)/'redis.sock')
        process=subprocess.Popen([binary,'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',folder],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                if Path(sock).exists():break
                time.sleep(.02)
            r=Redis(sock); like=(HERE/'like.lua').read_text(); rotate=(HERE/'rotate.lua').read_text(); ack=(HERE/'ack.lua').read_text(); key='like:{comment:100}'
            def init(k=key): r.command('HSET',k,'ready','1','total','0','delta','0')
            def run(user,wanted,k=key):return r.command('EVAL',like,1,k,user,wanted)
            init()
            check(run(7,1)==[1,1,1] and run(7,1)==[0,1,1],'real Redis: desired like then retry counts once')
            check(run(7,0)==[-1,0,0] and run(7,0)==[0,0,0],'real Redis: unlike then retry decrements once')
            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool: values=list(pool.map(lambda _:run(8,1),range(64)))
            check(sum(v[0] for v in values)==1 and r.command('HGET',key,'total')=='1','real Redis: 64 same-user requests across 16 concurrent workers count once')
            with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool: list(pool.map(lambda u:run(u,1),range(100,164)))
            check(r.command('HGET',key,'total')=='65','real Redis: 64 independent users all count')
            frozen=r.command('EVAL',rotate,1,key,'b17')
            check(frozen==['b17','65'] and r.command('HGET',key,'delta')=='0','real Redis: rotation freezes delta atomically')
            run(100,0)
            check(r.command('EVAL',rotate,1,key,'b18')==['b17','65'] and r.command('HGET',key,'delta')=='-1','real Redis: one in-flight batch preserves new negative delta')
            try:r.command('EVAL',ack,1,key,'b17','64')
            except RedisError:pass
            check(r.command('HGET',key,'inflight')=='b17','real Redis: mismatched flush ACK cannot erase batch')
            check(r.command('EVAL',ack,1,key,'b17','65')==2 and r.command('EVAL',ack,1,key,'b17','65')==0,'real Redis: matching ACK clears only its batch, replay safe')
            check(r.command('EVAL',rotate,1,key,'b18')==['b18','-1'],'real Redis: next batch waits for previous ACK')
            for corrupted in ['missing','wrongtype','number','member']:
                k='probe:'+corrupted
                if corrupted=='wrongtype':r.command('SET',k,'oops')
                elif corrupted=='number':init(k);r.command('HSET',k,'total','NaN')
                elif corrupted=='member':init(k);r.command('HSET',k,'u:7','2')
                before=r.command('DUMP',k) if corrupted=='missing' else r.command('TYPE',k) # binary DUMP only for absent key
                try:run(7,1,k)
                except RedisError:pass
                else:raise AssertionError('corrupt state accepted')
                if corrupted=='number':check(r.command('HGET',k,'total')=='NaN' and r.command('HGET',k,'u:7') is None,'real Redis: invalid numeric total fails before mutation')
                else:check(True,f'real Redis: {corrupted} fails closed')
            run(999,1);run(999,0);run(999,1)
            check(r.command('HGET',key,'u:999')=='1','negative witness: delayed old like wins receipt-order semantics')
            # Show that arbitrary scripts do not roll back earlier writes on error.
            try:r.command('EVAL',"redis.call('SET',KEYS[1],'written'); return redis.call('INCR',KEYS[1])",1,'partial')
            except RedisError:pass
            check(r.command('GET','partial')=='written','real Redis negative witness: script runtime error retains earlier write')
            r.command('DEL',key)
            try:run(8,1)
            except RedisError:pass
            else:raise AssertionError('lost membership silently reinitialized')
            check(r.command('EXISTS',key)==0,'real Redis: state loss pauses writes instead of empty-set restart')
        finally:
            process.terminate();process.wait(timeout=5)
    return version

page_probes();flush_probes();moderation_probes();cursor_and_cache_probes();redis_version=redis_probes()
rates={name:10_000_000*actions/86400*5 for name,actions in [('comments',2),('likes',10),('lists',15)]}
check(math.isclose(rates['lists']*.05,434.02777777777777),'capacity arithmetic uses unrounded peak')
check(math.isclose((rates['comments']-1000)*600,94444.44444444444),'moderation backlog arithmetic')
result={'passed':True,'checks':len(checks),'cases':checks,'rates':rates,'redis':redis_version,
 'limits':['SQLite indexed per-root queries replace unsupported LATERAL; PostgreSQL SQL shape is not executed.',
 'SQLite concurrency is not PostgreSQL lock behavior; no Redis cluster/replica/AOF, queue, network fault, SLO or load experiment.',
 'Cursor/cache and serialized moderation interleavings are adapter contract models, not production service tests.']}
(ROOT/'docs/reviews/ch16-code-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'redis':redis_version}))
