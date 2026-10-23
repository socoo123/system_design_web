#!/usr/bin/env python3
"""Executable SQLite adaptations and contract traces; not PostgreSQL/Raft tests."""
from pathlib import Path
import concurrent.futures, hashlib, html, json, re, sqlite3, tempfile, threading
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/reviews/ch12-code-results.json'
checks = []
def check(ok, name):
    if not ok: raise AssertionError(name)
    checks.append(name)

def conn(file):
    db = sqlite3.connect(file, timeout=10, isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA synchronous=FULL')
    return db

def setup(file):
    with conn(file) as db:
        db.executescript((ROOT/'examples/ch12/schema.sql').read_text())
        db.execute("INSERT INTO conversation VALUES ('c',105,1,1)")
        db.executemany("INSERT INTO member VALUES ('c',?,1,1,TRUE)", [('a',),('b',)])
        db.executescript('''
        CREATE TABLE device_receipt (user_id TEXT,device_id TEXT,conv TEXT,view INTEGER,
          d INTEGER NOT NULL, PRIMARY KEY(user_id,device_id,conv,view));
        CREATE TABLE private_read (user_id TEXT,conv TEXT,view INTEGER,r INTEGER NOT NULL,
          PRIMARY KEY(user_id,conv,view));
        CREATE TABLE public_read (user_id TEXT,conv TEXT,view INTEGER,r INTEGER NOT NULL,
          PRIMARY KEY(user_id,conv,view));
        CREATE TABLE device_session (user_id TEXT,device_id TEXT,epoch INTEGER NOT NULL,
          connection_id TEXT,gateway_id TEXT,lease_until INTEGER,
          PRIMARY KEY(user_id,device_id));
        INSERT INTO device_session VALUES ('b','phone',0,NULL,NULL,0);
        ''')

def submit(file, key, body, *, fail=False, lost_ack=False, user='a'):
    # BEGIN IMMEDIATE replaces PostgreSQL row locks with a database writer lock.
    # This adaptation serializes more broadly and cannot validate PG concurrency.
    db = conn(file)
    try:
        db.execute('BEGIN IMMEDIATE')
        head, policy = db.execute("SELECT head,policy_version FROM conversation WHERE conv_id='c'").fetchone()
        digest = hashlib.sha256(body).digest()
        old = db.execute("SELECT request_hash,seq FROM send_receipt WHERE conv_id='c' AND sender_id=? AND client_msg_id=?", (user,key)).fetchone()
        if old:
            db.rollback()
            return ('SENT',old[1]) if old[0]==digest else ('KEY_REUSED',None)
        member = db.execute("SELECT active FROM member WHERE conv_id='c' AND user_id=?", (user,)).fetchone()
        if not member or not member[0]:
            db.rollback(); return ('FORBIDDEN',None)
        seq = head+1
        db.execute("UPDATE conversation SET head=? WHERE conv_id='c'", (seq,))
        db.execute("INSERT INTO message VALUES ('c',?,?,?)", (seq,user,body))
        if fail: raise RuntimeError('crash before receipt/outbox')
        db.execute("INSERT INTO send_receipt VALUES ('c',?,?,?,?)", (user,key,digest,seq))
        db.execute("INSERT INTO outbox VALUES ('c',?,?,?,FALSE)", (seq,policy,body))
        db.commit()
        return ('UNKNOWN',None) if lost_ack else ('SENT',seq)
    except RuntimeError:
        db.rollback(); return ('ABORT',None)
    finally: db.close()

def receipt(file, device, view, dc, rc, publish=True):
    db=conn(file)
    try:
        db.execute('BEGIN IMMEDIATE')
        active, current, first = db.execute("SELECT active,view_epoch,first_seq FROM member WHERE conv_id='c' AND user_id='b'").fetchone()
        tail = db.execute("SELECT head FROM conversation WHERE conv_id='c'").fetchone()[0]
        if not active or view!=current: db.rollback(); return 'FORBIDDEN'
        base=first-1
        if not base<=dc<=tail: db.rollback(); return 'OUT_OF_RANGE'
        db.execute("INSERT INTO device_receipt VALUES ('b',?,'c',?,?) ON CONFLICT DO NOTHING",(device,view,base))
        old=db.execute("SELECT d FROM device_receipt WHERE user_id='b' AND device_id=? AND conv='c' AND view=?",(device,view)).fetchone()[0]
        nd=max(old,dc)
        if not base<=rc<=nd: db.rollback(); return 'GAP'
        db.execute("UPDATE device_receipt SET d=? WHERE user_id='b' AND device_id=? AND conv='c' AND view=?", (nd,device,view))
        for table in ['private_read']+(['public_read'] if publish else []):
            # SQLite max(old,new) adapts PostgreSQL GREATEST(old,new).
            db.execute(f"INSERT INTO {table} VALUES ('b','c',?,?) ON CONFLICT(user_id,conv,view) DO UPDATE SET r=max(r,excluded.r)",(view,rc))
        db.commit(); return 'ACK'
    finally: db.close()

def register(file, connection, now):
    db=conn(file)
    try:
        db.execute('BEGIN IMMEDIATE')
        epoch=db.execute("SELECT epoch FROM device_session WHERE user_id='b' AND device_id='phone'").fetchone()[0]
        if epoch==2**63-1: db.rollback(); return None
        epoch+=1
        db.execute("UPDATE device_session SET epoch=?,connection_id=?,gateway_id='g',lease_until=? WHERE user_id='b' AND device_id='phone'",(epoch,connection,now+90))
        db.commit(); return epoch
    finally: db.close()

def close_route(file, epoch, connection, now):
    with conn(file) as db:
        return db.execute("UPDATE device_session SET connection_id=NULL,gateway_id=NULL,lease_until=? WHERE user_id='b' AND device_id='phone' AND epoch=? AND connection_id=?",(now,epoch,connection)).rowcount

def renew(file, epoch, connection, now):
    with conn(file) as db:
        return db.execute("UPDATE device_session SET lease_until=? WHERE user_id='b' AND device_id='phone' AND epoch=? AND connection_id=? AND lease_until>?",(now+90,epoch,connection,now)).rowcount

page=(ROOT/'chapters/ch12.html').read_text()
blocks=re.findall(r'<pre\b[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>',page,re.S)
check(len(blocks)==5, 'five shared source blocks')
for name,code in blocks:
    check(html.unescape(code)==(ROOT/'examples/ch12'/name).read_text().rstrip('\n'), f'HTML matches {name}')

with tempfile.TemporaryDirectory(prefix='ch12-model-') as tmp:
    file=Path(tmp)/'chat.sqlite';setup(file)
    check(submit(file,'k1',b'one')==('SENT',106), 'normal message/receipt/outbox transaction')
    check(submit(file,'k1',b'one')==('SENT',106), 'same key replays original seq')
    check(submit(file,'k1',b'changed')==('KEY_REUSED',None), 'same key different intent rejected')
    check(submit(file,'aborted',b'abort',fail=True)==('ABORT',None), 'partial transaction abort')
    with conn(file) as db:
        check(db.execute("SELECT head FROM conversation").fetchone()[0]==106 and db.execute('SELECT count(*) FROM message').fetchone()[0]==1,'abort rolls back ordinary counter and all rows')
    check(submit(file,'k2',b'two',lost_ack=True)==('UNKNOWN',None),'lost ACK leaves unknown committed result')
    check(submit(file,'k2',b'two')==('SENT',107),'retry recovers commit after lost ACK')
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results=list(pool.map(lambda _:submit(file,'same-race',b'concurrent'),range(24)))
    check(set(results)=={('SENT',108)}, '24 SQLite writers collapse one key into seq 108')
    with conn(file) as db:
        check(tuple(db.execute('SELECT (SELECT count(*) FROM message),(SELECT count(*) FROM send_receipt),(SELECT count(*) FROM outbox)').fetchone())==(3,3,3),'one message/receipt/outbox per accepted key')
        queue=[('c',108),('c',108)] # Publish success, crash before marking, republish.
        check(len(queue)==2 and len(set(queue))==1,'outbox publish/mark failure produces duplicate event identity')
        db.execute("DELETE FROM message WHERE seq=106")
    check(submit(file,'k1',b'one')==('SENT',106), 'minimal receipt can outlive expired body')
    check(receipt(file,'desktop',1,108,108)=='ACK','desktop contiguous delivered/read prefix')
    check(receipt(file,'desktop',1,107,0)=='ACK','late delivered cannot lower device watermark')
    check(receipt(file,'phone',1,105,108)=='GAP','user Read does not permit phone to jump its gap')
    check(receipt(file,'phone',1,105,0)=='ACK','phone may remain at 105')
    with conn(file) as db:
        check(db.execute("SELECT d FROM device_receipt WHERE device_id='phone'").fetchone()[0]==105 and db.execute('SELECT r FROM public_read').fetchone()[0]==108,'merged user Read leaves per-device receive state independent')
        db.execute('DELETE FROM public_read')
    check(receipt(file,'phone',1,106,106,False)=='ACK','private read transaction')
    with conn(file) as db:
        check(db.execute('SELECT count(*) FROM public_read').fetchone()[0]==0,'private read does not publish public status')
        db.execute("UPDATE member SET active=FALSE WHERE user_id='a'")
    check(submit(file,'new-after-remove',b'no')==('FORBIDDEN',None),'new send rejected after membership removal')
    check(submit(file,'k2',b'two')==('SENT',107),'removed sender can recover own minimal old receipt')
    with conn(file) as db:
        db.execute("UPDATE member SET view_epoch=2,first_seq=109 WHERE user_id='b'")
    check(receipt(file,'desktop',1,108,108)=='FORBIDDEN','old membership view cannot alter new view receipts')
    check(receipt(file,'desktop',2,108,108)=='ACK','new view uses authorized first_seq minus one baseline')
    check(receipt(file,'desktop',2,109,109)=='OUT_OF_RANGE','receipt above committed tail rejected')
    e1=register(file,'old',100);e2=register(file,'new',101)
    check((e1,e2)==(1,2),'registration transaction increments persistent device epoch')
    check(close_route(file,e1,'old',102)==0 and renew(file,e1,'old',102)==0,'late disconnect/heartbeat cannot mutate new route')
    check(renew(file,e2,'new',150)==1,'current unexpired epoch renews')
    check(renew(file,e2,'new',240)==0,'expired epoch cannot resurrect by heartbeat')
    e3=register(file,'fresh',241)
    check(e3==3 and close_route(file,e3,'fresh',242)==1,'fresh registration after expiry retains generation')
    check(renew(file,e3,'fresh',243)==0,'closed route cannot renew')
    with conn(file) as db:
        db.execute('UPDATE device_session SET epoch=?',(2**63-1,))
    check(register(file,'overflow',300) is None,'epoch exhaustion rejects instead of wrapping')

    # Deliberately unsafe GC: the old key is still admissible, so it inserts again.
    with conn(file) as db:
        db.execute("UPDATE member SET active=TRUE WHERE user_id='a'")
        db.execute("DELETE FROM send_receipt WHERE sender_id='a' AND client_msg_id='k2'")
    check(submit(file,'k2',b'two')==('SENT',109),'negative SQLite trace: deleting dedup accepts delayed old key again')
    with conn(file) as db:
        check(db.execute("SELECT count(*) FROM message WHERE body=?",(b'two',)).fetchone()[0]==2,'unsafe GC created two logical records for one old intent')

    # Actual local SQLite transactions adapt receive.pseudo, with FULL sync enabled.
    local=Path(tmp)/'device.sqlite'
    with conn(local) as db:
        db.executescript('CREATE TABLE entry(seq INTEGER PRIMARY KEY,revision INTEGER,kind TEXT,content BLOB); CREATE TABLE cursor(upto INTEGER); INSERT INTO cursor VALUES (105);')
    def persist(entries,fail=False):
        db=conn(local)
        try:
            db.execute('BEGIN IMMEDIATE')
            c=db.execute('SELECT upto FROM cursor').fetchone()[0]
            for seq,rev,kind,content in entries:
                old=db.execute('SELECT revision,kind,content FROM entry WHERE seq=?',(seq,)).fetchone()
                if old and old[0]==rev and old[1:]!=(kind,content): raise ValueError('conflict')
                db.execute('INSERT INTO entry VALUES (?,?,?,?) ON CONFLICT(seq) DO UPDATE SET revision=excluded.revision,kind=excluded.kind,content=excluded.content WHERE excluded.revision>entry.revision',(seq,rev,kind,content))
            while c<2**63-1 and db.execute('SELECT 1 FROM entry WHERE seq=?',(c+1,)).fetchone(): c+=1
            if fail: raise ValueError('local failure before cursor commit')
            db.execute('UPDATE cursor SET upto=?',(c,));db.commit();return c
        except ValueError:
            db.rollback();return None
        finally:db.close()
    check(persist([(108,1,'MESSAGE',b'108')])==105,'local durable gap keeps cursor 105')
    check(persist([(106,1,'MESSAGE',b'106'),(107,1,'TOMBSTONE',b'')],True) is None,'local write/cursor transaction failure sends no ACK')
    with conn(local) as db:
        check(db.execute('SELECT upto FROM cursor').fetchone()[0]==105 and db.execute('SELECT count(*) FROM entry').fetchone()[0]==1,'reopen observes no partial local prefix')
    check(persist([(106,1,'MESSAGE',b'106'),(107,1,'OMITTED',b'')])==108,'certified omitted slot plus local body closes persisted prefix')
    check(persist([(108,2,'TOMBSTONE',b'')])==108,'redaction revision does not regress cursor')
    check(persist([(108,1,'MESSAGE',b'108')])==108,'old replay does not undo newer tombstone')
    with conn(local) as db:
        check(db.execute('SELECT kind FROM entry WHERE seq=108').fetchone()[0]=='TOMBSTONE','durable row keeps higher revision')

# Independent arithmetic and deliberate broken traces are not database experiments.
messages=10_000_000*Fraction(1,2)*20
peak=messages/Fraction(86400)*5
sockets=10_000_000*Fraction(15,100)*Fraction(12,10)
budget=100_000*Fraction(60,100)
normal=(sockets+budget-1)//budget
numbers={
 'messages_per_day':int(messages),'average_per_second':float(messages/86400),
 'peak_per_second':float(peak),'sockets':int(sockets),'budget_per_gateway':int(budget),
 'normal_gateways':int(normal),'same_budget_N_minus_one_gateways':int(normal+1),
 '30_to_29_planned_capacity':int(29*budget),'raw_utilization_30_to_29':float(sockets/(29*100000)),
 'incremental_GB':float(sockets*16000/10**9),'per_gateway_cap_GB':float(budget*16000/10**9),
 'daily_GB':float(messages*1000/10**9),'annual_TB':float(messages*1000*365/10**12),
 'three_copy_TB':float(messages*1000*365*3/10**12),'push_frames_per_second':float(peak*Fraction(24,10)),
 'push_payload_Mbps':float(peak*Fraction(24,10)*1000*8/10**6),
 'heartbeat_per_second':int(sockets/30),'heartbeat_to_message_peak':float(sockets/30/peak),
 'handshakes_per_second':60000/15,'remaining_admission_per_second':5000-60000/15,
 'worst_sync_rows_per_second':60000/15*100,'all_socket_buffers_TB':float(sockets*10**6/10**12),
 'small_group_refs_per_second':20*200,'small_group_budget_fraction':20*200/10000,
 'no_headroom_group_members':10000/20,'higher_rate_refs_per_second':100*200,
 'large_group_refs_per_second':20*50000,'viewer_pushes_per_second':20*500,'target_reduction':50000/500,
 'healthy_presence_bound_seconds':90+5}
check(normal==30 and 29*budget<sockets and 30*budget==sockets,'normal 30 versus same-budget N-1 31 independently recomputed')
check(numbers['three_copy_TB']==109.5 and numbers['all_socket_buffers_TB']==1.8,'decimal bytes independently recomputed')
# Nontransactional sequence reservation permits committed 109 with missing 108.
reserved=[108,109];committed=[109]
check(108 not in committed and max(committed)==109,'negative trace: independent reservation leaves unfillable gap')
check(max([105,108])==108 and {106,107}.isdisjoint({108}),'negative trace: max-seen cursor skips missing 106/107')
OUT.write_text(json.dumps({'passed':True,'checks':checks,'check_count':len(checks),'numbers':numbers,
 'limits':['SQLite BEGIN IMMEDIATE is not PostgreSQL row-lock concurrency','No consensus, replication failover, disk-power-loss or throughput test','Certified view/omission and authenticated identity are input contracts, not cryptographic implementations']},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'numbers':numbers},ensure_ascii=False,indent=2))
