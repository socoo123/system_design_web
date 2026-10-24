from pathlib import Path
import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import threading
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ch30_review_model', ROOT/'examples/ch30/model.py')
module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
Catalog, Denied = module.Catalog, module.Denied
rows=[]
def check(name, ok):
    rows.append({'name':name,'passed':bool(ok)})
    if not ok: raise AssertionError(name)
def reject(name, call):
    try: call()
    except (Denied,ValueError): check(name,True)
    else: check(name,False)
def receipt(manifest,pool):
    return dict(text=manifest['text'],bm25=manifest['children'],dense=manifest['children'],pool=pool,splitter='s1')

result={'passed':False,'checks':rows,'limits':['Actual SQLite transactions, trusted visibility/auth fixtures; no PG/index/LLM/production clock implementation.']}
try:
    with tempfile.TemporaryDirectory(prefix='ch30-independent-') as temp:
        db=str(Path(temp)/'authority.sqlite'); a=Catalog(db); b=Catalog(db)
        tenant,subject='tenant-green','reader-42'
        a.membership(tenant,subject,['staff'])
        sequence={}
        def make(doc, rev=11, pool='alpha', parents=False, publish=True):
            sequence[doc]=sequence.get(doc,0)+1; seq=sequence[doc]
            job=a.accept(f'{doc}/{seq}',tenant,doc,seq,rev,'fixture-source-'+str(rev),(pool,))[0]
            epoch=a.claim(job,'author',lease=1_000)
            child=f'{tenant}/{doc}/r{rev}/{pool}/s1/0:128'
            digest=a.put_chunk(child,tenant,doc,rev,pool,0,128,'fixture-child-'+str(rev))
            manifest={'children':{child:digest},'text':{child:digest}}
            if parents:
                parent=f'{tenant}/{doc}/r{rev}/{pool}/s1/0:256'
                manifest['text'][parent]=a.put_chunk(parent,tenant,doc,rev,pool,0,256,'fixture-child-and-parent-'+str(rev))
            a.freeze_manifest(job,manifest['children'],manifest['text'])
            a.policy(tenant,doc,['staff'],[(0,256 if parents else 128,['staff'])],rev=rev)
            if publish:a.publish(job,'author',epoch,receipt(manifest,pool))
            return job,epoch,child,manifest
        job,epoch,child,m=make('manual',parents=True,publish=False)
        check('durable accept precedes published visibility',a.db.execute('SELECT count(*) FROM published').fetchone()[0]==0)
        for lane in ['text','bm25','dense']:
            partial=receipt(m,'alpha');partial[lane]={}
            reject('partial '+lane+' receipt blocks publication',lambda r=partial:a.publish(job,'author',epoch,r))
        check('partial receipts leave no current or done job',a.db.execute('SELECT count(*) FROM published').fetchone()[0]==0 and a.db.execute('SELECT state FROM job WHERE id=?',(job,)).fetchone()[0]=='running')
        a.publish(job,'author',epoch,receipt(m,'alpha'))
        pack=a.pin(tenant,subject,'alpha',[child]); check('normal published child pack valid',a.check_pack(tenant,subject,'alpha',pack))
        sent=[];a.release(tenant,subject,'alpha',pack,[1],lambda:'SUPPORTED',lambda:sent.append('approved'))
        check('normal support plus full-pack recheck emits',sent==['approved'])
        # Close the root's actual P1 with an even stronger alias: identical bytes/hash.
        extra=f'{tenant}/manual/r11/alpha/s1/staging-alias'
        extra_hash=a.put_chunk(extra,tenant,'manual',11,'alpha',0,128,'fixture-child-11')
        check('staging alias deliberately has exact published digest',extra_hash==m['children'][child])
        reject('root P1 recheck: extra same-rev/pool child ID denied',lambda:a.pin(tenant,subject,'alpha',[extra]))
        reject('root P1 recheck: extra same-rev/pool text ID denied',lambda:a.pin(tenant,subject,'alpha',[extra],indexed=False))
        parent=next(k for k in m['text'] if k not in m['children'])
        check('manifest parent remains readable as text',a.pin(tenant,subject,'alpha',[parent],indexed=False)[0].end==256)
        reject('manifest text-only parent cannot be indexed child',lambda:a.pin(tenant,subject,'alpha',[parent]))
        a.policy(tenant,'manual',['staff'],[(0,128,['staff']),(128,256,['executive'])],rev=11)
        check('child readable under mixed parent policy',len(a.pin(tenant,subject,'alpha',[child]))==1)
        reject('parent whole-span check detects private second range',lambda:a.pin(tenant,subject,'alpha',[parent],indexed=False))
        a.policy(tenant,'manual',['staff'],[(0,127,['staff']),(128,256,['staff'])],rev=11)
        reject('one-unit ACL coverage hole rejects even otherwise readable child',lambda:a.pin(tenant,subject,'alpha',[child]))
        a.policy(tenant,'manual',['staff'],[(0,256,['staff'])],rev=11)
        pack=a.pin(tenant,subject,'alpha',[child])
        for bad in [[],[0],[2],[True],[1.0]]:
            reject('citation identity blocked '+repr(bad),lambda ids=bad:a.release(tenant,subject,'alpha',pack,ids,lambda:'SUPPORTED',lambda:sent.append('bad')))
        reject('support UNKNOWN does not release',lambda:a.release(tenant,subject,'alpha',pack,[1],lambda:'UNKNOWN',lambda:sent.append('bad')))
        check('failed identities/support produced no bytes',sent==['approved'])
        # New counterexamples: ACL and membership ABA during a slow judge.
        _,_,public,_=make('public-note');_,_,private,_=make('private-note')
        def slow_case(name, mutate):
            full=a.pin(tenant,subject,'alpha',[public,private]); started=threading.Event(); changed=threading.Event();out=[]
            def worker():
                c=Catalog(db)
                def judge():started.set();check_wait=changed.wait(4);return 'SUPPORTED' if check_wait else 'UNKNOWN'
                try:c.release(tenant,subject,'alpha',full,[1],judge,lambda:out.append('SENT'))
                except Denied:out.append('blocked')
                finally:c.db.close()
            t=threading.Thread(target=worker);t.start()
            check(name+' judge actually paused',started.wait(4));mutate();changed.set();t.join(5)
            check(name+' full draft blocked with no send',not t.is_alive() and out==['blocked'])
        def acl_aba():
            b.policy(tenant,'private-note',['executive'],[(0,128,['executive'])],rev=11)
            b.policy(tenant,'private-note',['staff'],[(0,128,['staff'])],rev=11)
        slow_case('uncited dependency ACL revoke/regrant ABA',acl_aba)
        def member_aba():
            b.membership(tenant,subject,[],False);b.membership(tenant,subject,['staff'])
        slow_case('membership remove/regrant ABA',member_aba)
        slow_case('uncited dependency deletion',lambda:b.delete(tenant,'private-note'))
        # Publication lease/target fencing, under new input IDs.
        j,e,k,mm=make('lease-review',publish=False);a.time(1_000)
        new_epoch=b.claim(j,'takeover',lease=1_000)
        check('lease equality allows takeover and larger epoch',new_epoch==e+1)
        reject('stale owner and epoch cannot publish correct complete receipts',lambda:a.publish(j,'author',e,receipt(mm,'alpha')))
        check('current owner can publish same immutable manifest',bool(b.publish(j,'takeover',new_epoch,receipt(mm,'alpha'))))
        j,e,k,mm=make('target-review',publish=False)
        a.accept('target-review/new',tenant,'target-review',2,12,'new source',('alpha',))
        reject('older worker cannot publish after target advances',lambda:a.publish(j,'author',e,receipt(mm,'alpha')))
        j,e,k,mm=make('expired-review',publish=False);a.time(2_000)
        reject('locked-time lease equality blocks publication',lambda:a.publish(j,'author',e,receipt(mm,'alpha')))
        # Pool-specific current is independent; global tombstone still denies both.
        a.time(0); jobs=a.accept('two-pools',tenant,'dual-review',1,5,'same source',('alpha','beta'))
        per_pool={}
        for j,pool in zip(jobs,['alpha','beta']):
            ep=a.claim(j,'worker-'+pool,lease=1_000);key=f'{tenant}/dual-review/r5/{pool}/s1/0:128'
            digest=a.put_chunk(key,tenant,'dual-review',5,pool,0,128,'dual source')
            sets={'text':{key:digest},'children':{key:digest}};a.freeze_manifest(j,sets['children'])
            a.policy(tenant,'dual-review',['staff'],[(0,128,['staff'])],rev=5)
            a.publish(j,'worker-'+pool,ep,receipt(sets,pool));per_pool[pool]=key
        alpha_pack=a.pin(tenant,subject,'alpha',[per_pool['alpha']]);beta_pack=a.pin(tenant,subject,'beta',[per_pool['beta']])
        check('both pool currents initially qualify separately',a.check_pack(tenant,subject,'alpha',alpha_pack) and a.check_pack(tenant,subject,'beta',beta_pack))
        # Prepare new beta ACL before capturing alpha again, then only change content current.
        beta_job=a.accept('two-pools/beta-new',tenant,'dual-review',2,6,'new beta',('beta',))[0]
        beta_epoch=a.claim(beta_job,'beta-new',lease=1_000);new_beta=f'{tenant}/dual-review/r6/beta/s1/0:128'
        digest=a.put_chunk(new_beta,tenant,'dual-review',6,'beta',0,128,'new beta')
        sets={'text':{new_beta:digest},'children':{new_beta:digest}};a.freeze_manifest(beta_job,sets['children'])
        a.policy(tenant,'dual-review',['staff'],[(0,128,['staff'])],rev=6)
        alpha_pack=a.pin(tenant,subject,'alpha',[per_pool['alpha']]);beta_pack=a.pin(tenant,subject,'beta',[per_pool['beta']])
        a.publish(beta_job,'beta-new',beta_epoch,receipt(sets,'beta'))
        check('other pool publication does not change alpha current',a.check_pack(tenant,subject,'alpha',alpha_pack))
        reject('same pool current change invalidates old beta draft',lambda:a.check_pack(tenant,subject,'beta',beta_pack))
        b.delete(tenant,'dual-review')
        reject('global delete rejects old pool on rollback',lambda:a.pin(tenant,subject,'alpha',[per_pool['alpha']]))
        reject('global delete rejects new beta pool',lambda:a.pin(tenant,subject,'beta',[new_beta]))
        # Real release callback demonstrates the explicitly weaker check/send contract.
        _,_,gap,_=make('check-send-gap');gp=a.pin(tenant,subject,'alpha',[gap]);gap_sent=[]
        def after_check_send():
            b.delete(tenant,'check-send-gap');gap_sent.append('already-approved')
        a.release(tenant,subject,'alpha',gp,[1],lambda:'SUPPORTED',after_check_send)
        check('declared gap permits already-approved callback after revoke',gap_sent==['already-approved'])
        reject('next authority check after revoke denies',lambda:a.check_pack(tenant,subject,'alpha',gp))
        a.db.close();b.db.close()
        # Compile independent Java inputs against the author's unchanged class.
        java_bin=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        compiled=Path(temp)/'classes';compiled.mkdir()
        subprocess.run([str(java_bin/'javac'),'-d',str(compiled),str(ROOT/'examples/ch30/RagCore.java'),str(ROOT/'docs/reviews/ch30-independent-Probe.java')],check=True,capture_output=True,text=True)
        run=subprocess.run([str(java_bin/'java'),'-cp',str(compiled),'Ch30IndependentProbe'],check=True,capture_output=True,text=True)
        result['java']=json.loads(run.stdout)
    sizes=[];start=0
    while start<2_000:
        end=min(2_000,start+512);sizes.append(end-start)
        if end==2_000:break
        start+=448
    values={
      'chunksPerDoc':(len(sizes),5),'lastChunk':(sizes[-1],208),'embeddedPerDoc':(sum(sizes),2256),
      'overlapNumerator':(sum(sizes)-2000,256),'overlapFraction':(Fraction(64,512),Fraction(1,8)),
      'growth':(Fraction(sum(sizes)-2000,2000),Fraction(16,125)),
      'vectors':(100000*len(sizes),500000),'rawBytes':(100000*len(sizes)*768*4,1536000000),
      'twoCopies':(2*100000*len(sizes)*768*4,3072000000),'dualTwoCopies':(4*100000*len(sizes)*768*4,6144000000),
      'rerankPairs':(40*80,3200),'allPairs':(40*500000,20000000),'factor':(Fraction(500000,80),6250),
      'inputTokens':(40*5120,204800),'outputTokens':(40*512,20480),'context':(1024+4096+512,5632),
      'preparation':(30+60+max(80,100)+40+250+20,500),'remaining':(700-500,200),
      'dailyChunks':(100000//100*5,5000),'dailyTokens':(100000//100*2256,2256000),
      'RRF_B_wins':(Fraction(2,65)>Fraction(1,61)+Fraction(1,70),True)}
    result['numeric']={}
    for name,(value,expected) in values.items():
        check('numeric '+name,value==expected);result['numeric'][name]=str(value)
    result['rawGiB']=1536000000/(1024**3)
    result['passed']=True
finally:
    result['sourceHashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
      for p in [ROOT/'chapters/ch30.html',*sorted((ROOT/'examples/ch30').glob('*'))] if p.is_file()}
    (ROOT/'docs/reviews/ch30-independent-probe-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed':result['passed'],'checks':len(rows),'java':result.get('java')},ensure_ascii=False))
