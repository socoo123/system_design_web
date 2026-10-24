"""Independent Ch22 adversarial inputs; never writes the author's files/results."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch22'))
from model import Authority,Data,Conflict,Denied,NotFound,Unknown,namespace
from hashlib import sha256
from tempfile import TemporaryDirectory
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import threading
import json
import time

checks=[]
def ok(name,condition):
    checks.append({'name':name,'passed':bool(condition)})
    if not condition:raise AssertionError(name)
def rejects(name,kind,fn):
    try:fn()
    except kind:ok(name,True)
    else:ok(name,False)
def digest(body):return sha256(body).hexdigest()

with TemporaryDirectory(prefix='ch22-independent-') as tmp:
    d=Data();a=Authority(Path(tmp)/'independent.sqlite',d)
    for actor,tenant,bucket in [('alice','t1','public'),('bob','t1','public'),('alice','t1','private'),('eve','t2','public')]:
        a.grant(actor,tenant,bucket)
    def start(scope,req,body=b'\x00cat\xff\n',actor='alice',**kwargs):
        return a.begin(actor,scope,req,len(body),digest(body),**kwargs)
    def ready(u,body=b'\x00cat\xff\n',numbers=(1,),copies=None):
        selected=[];n=len(numbers)
        for index,number in enumerate(numbers):
            segment=body[index*len(body)//n:(index+1)*len(body)//n]
            receipt=d.stage(u['id'],u['fence'],number,segment,copies=copies or u['required_copies'])
            selected.append(a.register(u['owner'],u['id'],u['fence'],receipt))
        return a.freeze(u['owner'],u['id'],u['fence'],selected)
    def publish(u,parts,**kwargs):return a.publish(u['owner'],u['id'],u['fence'],parts,**kwargs)
    def current(scope):return a.resolve('alice',scope,now=100)[0]['id']

    # Name identity: do not silently trim, case fold, normalize or collapse null bytes.
    keys=['asset',' asset','Asset','é','e\u0301','a\x00b']
    uploads=[start(('t1','public',key),'same-operation') for key in keys]
    ok('six exact Unicode/space/case/NUL names allocate six identities',len({u['ns'] for u in uploads})==6 and len({u['id'] for u in uploads})==6)
    ok('normal identity preserves exact original key bytes as UTF-8 sequence',json.loads(uploads[4]['ns'])[2]=='e\u0301')
    bob=start(('t1','public','asset'),'same-operation',actor='bob')
    ok('same name and request under another principal is a distinct upload',bob['id']!=uploads[0]['id'])
    other=start(('t1','private','asset'),'same-operation')
    ok('same principal request key in another bucket is distinct',other['id']!=uploads[0]['id'])
    rejects('changed replication policy cannot reuse request',Conflict,lambda:start(('t1','public','asset'),'same-operation',copies=6))
    rejects('changed generation prerequisite cannot reuse request',Conflict,lambda:start(('t1','public','asset'),'same-operation',expected=0))
    rejects('tenant B cannot query tenant A upload',Denied,lambda:a.query('eve',uploads[0]['id']))
    rejects('bucket writer Bob cannot operate Alice upload',Denied,lambda:a.abort('bob',uploads[0]['id']))

    # Independent normal binary payload: two sparse but ordered part numbers, 6-copy gate.
    scope=('t1','public','binary');body=b'\x00\xffABCD\x80\n'
    first=start(scope,'binary-1',body,copies=6);parts=ready(first,body,numbers=(2,7),copies=6)
    rejects('FINALIZING binary content is invisible',NotFound,lambda:a.resolve('alice',scope))
    rejects('whole-object publication rollback is not a visible partial version',RuntimeError,lambda:publish(first,parts,fail_before_current=True))
    with a.connection() as db:
        ok('rollback has no version and no original result',db.execute('SELECT count(*) FROM versions WHERE id=?',(first['version_id'],)).fetchone()[0]==0 and db.execute('SELECT result FROM uploads WHERE id=?',(first['id'],)).fetchone()[0] is None)
    rejects('successful binary publication with lost reply is UNKNOWN',Unknown,lambda:publish(first,parts,lost_ack=True))
    saved=a.query('alice',first['id'])[1]
    ok('unknown resolves original allocated immutable version',saved==['CREATED',first['version_id']] and current(scope)==first['version_id'])
    v,lease=a.resolve('alice',scope,now=100)
    selected=json.loads(v['manifest'])
    ok('ordered sparse parts read as exactly original binary object',b''.join(d.blobs[p['blob_id']] for p in selected)==body and [p['part_no'] for p in selected]==[2,7])
    rejects('same bucket reader cannot renew another principal lease',Conflict,lambda:a.renew_read('bob',scope,lease,110))

    newer=start(scope,'binary-2',b'new');newparts=ready(newer,b'new');publish(newer,newparts)
    a.release_retention(first['version_id']);a.claim_version(first['version_id'])
    rejects('explicit old version cannot get a new lease after RECLAIMING',NotFound,lambda:a.resolve('alice',scope,version=first['version_id'],now=101))
    rejects('existing reader cannot renew after version fencing',Conflict,lambda:a.renew_read('alice',scope,lease,110))
    ok('active old read delays physical delete at 159',a.sweep_version(first['version_id'],159) is False)
    ok('at exact expiry 160 physical delete is permitted',a.sweep_version(first['version_id'],160) is True)
    ok('old payload really removed',all(p['blob_id'] not in d.blobs for p in parts))
    ok('old success replays after GC without current resurrection',publish(first,parts)==saved and current(scope)==newer['version_id'])
    rejects('saved result does not waive exact frozen manifest binding',Conflict,lambda:publish(first,list(reversed(parts))))
    a.grant('alice','t1','public',write=False)
    rejects('saved result does not waive fresh authorization after revocation',Denied,lambda:publish(first,parts))
    a.grant('alice','t1','public')
    ok('restored authorization can replay original without old bytes',publish(first,parts)==saved)
    rejects('same payload version cannot cross to another authorized bucket',NotFound,lambda:a.resolve('alice',('t1','private','binary'),version=newer['version_id']))

    # Conditional loser gets a permanent decision despite later marker/current updates and GC.
    loser=start(scope,'conditional-loser',b'nope',expected=0);lp=ready(loser,b'nope')
    ok('stale-generation publish stores rejection',publish(loser,lp)==['CONFLICT',None])
    a.delete_marker('alice',scope)
    rejects('marker hides current for new unversioned reads',NotFound,lambda:a.resolve('alice',scope))
    ok('retained prior version remains explicitly readable',a.resolve('alice',scope,version=newer['version_id'])[0]['id']==newer['version_id'])
    gf=a.claim_upload(loser['id'],600);ok('loser candidate swept after fence',a.sweep_upload(loser['id'],gf))
    ok('rejected terminal replay does not need candidate bytes',publish(loser,lp)==['CONFLICT',None])

    # Race complete versus abort with real SQLite contention, not a copied implementation.
    outcomes=[]
    for i in range(8):
        u=start(('t1','public',f'race-{i}'),'race',b'x')
        receipt=d.stage(u['id'],1,1,b'x');row=a.register('alice',u['id'],1,receipt)
        barrier=threading.Barrier(2)
        def freeze():
            barrier.wait()
            try:a.freeze('alice',u['id'],1,[row]);return 'FROZEN'
            except Conflict:return 'CONFLICT'
        def abort():
            barrier.wait()
            try:return a.abort('alice',u['id'])
            except Conflict:return 'CONFLICT'
        with ThreadPoolExecutor(max_workers=2) as pool:
            f=pool.submit(freeze);b=pool.submit(abort);pair=(f.result(),b.result())
        outcomes.append(pair)
        ok('complete/abort same-state race has exactly one winner '+str(i),pair in [('FROZEN','CONFLICT'),('CONFLICT','ABORTED')])
    complete_first=start(('t1','public','complete-priority'),'complete-priority',b'c')
    complete_parts=ready(complete_first,b'c')
    rejects('opposite order: frozen completion excludes a later abort',Conflict,lambda:a.abort('alice',complete_first['id']))
    ok('winner completion still publishes its original frozen parts',publish(complete_first,complete_parts)==['CREATED',complete_first['version_id']])
    # A durable fence is not a drain acknowledgement. Preserve a late admitted writer.
    orphan=start(('t1','public','late'),'late',b'q');ticket=d.start(orphan['id'],1,1,b'q')
    rejects('quarantine boundary 599 not enough',Conflict,lambda:a.claim_upload(orphan['id'],599))
    f=a.claim_upload(orphan['id'],600)
    ok('fence is durable and idempotently reclaimed',a.claim_upload(orphan['id'],1000)==f)
    ok('in-flight admitted writer blocks sweep',a.sweep_upload(orphan['id'],f) is False)
    late=d.finish(ticket)
    rejects('late old part may land but cannot register',Conflict,lambda:a.register('alice',orphan['id'],1,late,now=601))
    rejects('Data refuses new old-generation writer after close',Conflict,lambda:d.start(orphan['id'],1,1,b'q'))
    ok('after admitted writer drains exact late debris is swept',a.sweep_upload(orphan['id'],f) and late.blob not in d.blobs)

    # Completed selection permanently distinguishes selected data from a late unselected try.
    u=start(('t1','public','extra'),'extra',b'keep');selected=ready(u,b'keep')
    late_ticket=d.start(u['id'],1,1,b'late');publish(u,selected);late=d.finish(late_ticket)
    a.sweep_extra(u['id'],late.blob)
    ok('late unselected attempt cleanup preserves selected immutable blob',late.blob not in d.blobs and selected[0]['blob_id'] in d.blobs)
    rejects('selected immutable blob never swept as extra',Conflict,lambda:a.sweep_extra(u['id'],selected[0]['blob_id']))

    five=start(('t1','public','five-of-six'),'five',b'coded',copies=6);five_parts=ready(five,b'coded',copies=5)
    rejects('five acknowledgements do not satisfy frozen six-fragment policy',Conflict,lambda:publish(five,five_parts))
    ok('failed redundancy gate publishes neither version nor result',a.query('alice',five['id'])==('FINALIZING',None))
    unknown=start(('t1','public','unknown-drain'),'unknown-drain',b'z')
    physical=d.stage(unknown['id'],1,1,b'z');f=a.claim_upload(unknown['id'],600)
    real_drain=d.close_and_drain
    def no_drain_reply(*_):raise Unknown('Data drain acknowledgement unavailable')
    d.close_and_drain=no_drain_reply
    rejects('unknown Data drain does not become delete authorization',Unknown,lambda:a.sweep_upload(unknown['id'],f))
    ok('unknown drain preserves physical bytes for retry',physical.blob in d.blobs)
    d.close_and_drain=real_drain

    result={'passed':True,'checks':checks,'count':len(checks),'raceOutcomes':outcomes,
            'sourceHashes':{str(p.relative_to(ROOT)):sha256(p.read_bytes()).hexdigest() for p in [ROOT/'chapters/ch22.html',*sorted((ROOT/'examples/ch22').iterdir())] if p.is_file()},
            'limits':['SQLite writer serialization is local, not PG row-lock/consensus evidence.',
                      'Data is the author explicit memory contract adapter; no signature, fsync, real drain RPC or shared-pack implementation was tested.']}
    (ROOT/'docs/reviews/ch22-independent-probe-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'{len(checks)} independent model boundary probes passed')
