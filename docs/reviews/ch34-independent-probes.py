"""Independent new-input probes. Imports actual Runtime/Gateway; never edits them."""
from pathlib import Path
import sys, tempfile, json, hashlib, copy, sqlite3, threading, traceback
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,str(Path('examples/ch34').resolve()))
from model import Runtime, Gateway, Rejected, transaction, connect
checks=[]
def ck(name,yes,value=None):
    checks.append({'name':name,'passed':bool(yes),'observed':value})
    assert yes,(name,value)
def no(name,fn):
    try:fn()
    except (Rejected,sqlite3.IntegrityError) as e:ck(name,True,str(e))
    else:ck(name,False)
def hashes():
    paths=[Path('chapters/ch34.html')]+sorted(p for p in Path('examples/ch34').rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
    return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=hashes();out={'before':before}
try:
 with tempfile.TemporaryDirectory(prefix='ch34-independent-') as folder:
    r=Runtime(Path(folder)/'r.db');g=Gateway(Path(folder)/'g.db');seq=[0]
    def scalar(dbpath,sql,args=()):
        db=connect(dbpath)
        try:return db.execute(sql,args).fetchone()[0]
        finally:db.close()
    def bind(intent,amount=37,tool='charge',original=None):
        b={'tenant':'orchid','actor':'buyer-17','agent':'support','intent':intent,'tool':tool,'tool_revision':'r9','route':'ledger-secondary','resource':'acct-19','resource_version':19,'policy_revision':'p31','args':{'amount':amount}}
        if original:b['args']['original_key']=original
        return b
    def run():
        seq[0]+=1;rid=r.admit('orchid','buyer-17',f'fresh-{seq[0]}',{'case':'purchase','n':seq[0]})
        return r.claim(rid,'north',r.row(rid)['version'])
    def prep(n=1,amount=37):
        t=run();rid=t['run_id'];s=r.start_step(t,{'model_revision':'m27','evidence':'doc-43','time':714,'random':83},1800)
        r.usage(s['attempt'],243)
        actions=[{'id':rid+f':a{i}','key':rid+f':k{i}','binding':bind(rid+f':intent{i}',amount)} for i in range(n)]
        r.commit_output(s['token'],s['n'],{'tool_calls':[a['id'] for a in actions]},actions)
        return r.row(rid),actions
    def expire(t):
        with transaction(r.path) as db:db.execute('UPDATE runs SET lease_until=0 WHERE run_id=?',(t['run_id'],))
        return r.claim(t['run_id'],'south',r.row(t['run_id'])['version'])
    def obs_event(rid):
        return json.loads(scalar(r.path,"SELECT payload FROM events WHERE run_id=? AND kind='OBSERVED' ORDER BY seq DESC LIMIT 1",(rid,)))
    # Normal attemptVersion flow, independent inputs and ownership dimensions.
    t=run();rid=t['run_id'];s=r.start_step(t,{'evidence':'doc-91','time':817,'random':52},1600)
    ck('admission bumps version and returns attempt token',s['token']['version']==t['version']+1)
    no('entry version cannot commit after bump',lambda:r.commit_output(t,s['n'],{'answer':'wrong token'}))
    r.usage(s['attempt'],319);r.commit_output(s['token'],s['n'],{'answer':'saved-91'})
    saved=r.start_step(r.row(rid),{'evidence':'new evidence'})
    ck('normal output committed with attemptVersion and reused',saved['saved']=={'answer':'saved-91'})
    ck('saved reuse keeps one physical attempt',scalar(r.path,'SELECT count(*) FROM attempts WHERE run_id=?',(rid,))==1)
    for field,value in [('owner','intruder'),('epoch',0),('version',-7),('role_rev',9)]:
        no('reject mismatched '+field,lambda f=field,v=value:r.start_step({**r.row(rid),f:v},{}))
    t=run();s=r.start_step(t,{'evidence':'pinned-29','recorded_time':819,'random':99},1400);new=expire(s['token'])
    retry=r.start_step(new,{'evidence':'changed','recorded_time':999,'random':1},1200)
    ck('recovery pins input and logical identity',retry['input']==s['input'] and retry['n']==s['n'])
    ck('missing usage retains physical holds',r.row(t['run_id'])['token_hold']==2600)
    no('stale epoch result cannot commit',lambda:r.commit_output(s['token'],s['n'],{'answer':'old'}))
    r.usage(s['attempt'],301);ck('trusted usage settles late once',r.row(t['run_id'])['token_hold']==1200)
    r.usage(s['attempt'],301);no('usage cannot change',lambda:r.usage(s['attempt'],302))
    renew=r.renew(retry['token']);no('renew invalidates prior output CAS token',lambda:r.commit_output(retry['token'],retry['n'],{'answer':'late version'}))
    r.commit_output(renew,retry['n'],{'answer':'new owner fixed input'})
    t,aa=prep();rid=t['run_id']
    with transaction(r.path) as db:db.execute("UPDATE runs SET role='billing',role_rev=role_rev+1 WHERE run_id=?",(rid,))
    no('new role cannot dispatch old Agent-bound action',lambda:r.dispatch(r.row(rid),aa[0]['id']))
    t=run();st=r.start_step(t,{'evidence':'revision-51'});rid=t['run_id']
    with transaction(r.path) as db:db.execute("UPDATE runs SET workflow_rev='workflow-new' WHERE run_id=?",(rid,))
    no('unfinished step requires explicit workflow migration',lambda:r.start_step(r.row(rid),{}))
    rid=r.admit('orchid','buyer-17','four-claim-race',{'case':'claim race'})
    v=r.row(rid)['version'];barrier=threading.Barrier(4)
    def claim_contender(i):
        barrier.wait();return r.claim(rid,'claim-'+str(i),v)
    with ThreadPoolExecutor(4) as pool:claimed=list(pool.map(claim_contender,range(4)))
    ck('four independent claim transactions choose one owner',sum(x is not None for x in claimed)==1)
    # Exact binding, early approval and identity/expiry/status consistency.
    t,aa=prep();rid=t['run_id'];a=aa[0];d=g.approve('review-'+rid,a['binding']);pause=r.park(t,a['id'],'review-'+rid)
    ck('early durable approval survives parking',g.decision('review-'+rid)==d)
    for field in ['tenant','actor','agent','intent','tool','tool_revision','route','resource','resource_version','policy_revision','args']:
        changed=copy.deepcopy(d);changed['binding'][field]={'bad':True}
        no('full approval binding '+field,lambda x=changed:r.resume(rid,pause,r.row(rid)['version'],x))
    expired=copy.deepcopy(d);expired['expires']=0
    no('expired early decision cannot resume',lambda:r.resume(rid,pause,r.row(rid)['version'],expired))
    wrong=copy.deepcopy(d);wrong['approval_id']='other-review'
    no('approval id cannot be swapped',lambda:r.resume(rid,pause,r.row(rid)['version'],wrong))
    v=r.row(rid)['version'];ck('exact decision resumes once',r.resume(rid,pause,v,d)=='ACCEPTED')
    ck('duplicate decision is idempotent',r.resume(rid,pause,v,d)=='ALREADY_ACCEPTED')
    r.cancel(rid);ck('late duplicate accepted decision cannot revive',r.resume(rid,pause,v,d)=='ALREADY_ACCEPTED' and r.row(rid)['status']=='CANCELLED')
    # Race both directions with distinct requests and a real SQLite writer.
    for k in range(4):
        t,aa=prep();rid=t['run_id'];a=aa[0];p=r.park(t,a['id'],'race-'+rid);d=g.approve('race-'+rid,a['binding']);v=r.row(rid)['version'];barrier=threading.Barrier(2)
        def contender(i):
            barrier.wait()
            try:return r.cancel(rid) if i else r.resume(rid,p,v,d)
            except Rejected:return 'rejected'
        with ThreadPoolExecutor(2) as pool:res=list(pool.map(contender,[0,1]))
        ck('cancel/resume race keeps cancellation '+str(k),r.row(rid)['cancelled']==1 and r.row(rid)['status']=='CANCELLED')
    # Main historical P1: serial dispatch and legacy multi-flight obligations.
    t,aa=prep(2);rid=t['run_id'];sent=r.dispatch(t,aa[0]['id'])
    no('P1 new version does not authorize concurrent dispatch',lambda:r.dispatch(r.row(rid),aa[1]['id']))
    r.unknown(r.row(rid),aa[0]['id']);no('P1 UNKNOWN prevents later dispatch',lambda:r.dispatch(r.row(rid),aa[1]['id']))
    no('UNKNOWN blocks a new model step',lambda:r.start_step(r.row(rid),{}))
    # Explicit migration fixture permits testing old multi-flight state, not new dispatch.
    with transaction(r.path) as db:db.execute("UPDATE actions SET status='DISPATCHING' WHERE id=?",(aa[1]['id'],))
    r.cancel(rid);owner=r.claim(rid,'reconcile-two',r.row(rid)['version'])
    fail={'key':aa[0]['key'],'binding':aa[0]['binding'],'outcome':'FAILED_KNOWN'};r.observe(owner,aa[0]['id'],fail)
    ck('P1 first failure retains second in-flight obligation',r.row(rid)['status']=='CANCEL_REQUESTED')
    ck('P1 failure event retains action outcome',obs_event(rid)['outcome']=='FAILED_KNOWN',obs_event(rid))
    owner=expire(r.row(rid));ck('P1 remaining obligation is claimable after lease expiry',owner is not None)
    rec=g.execute(aa[1]['key'],aa[1]['binding']);r.observe(owner,aa[1]['id'],rec)
    ck('late success transitions to compensation',r.row(rid)['status']=='COMPENSATING')
    ck('P1 success event is SUCCESS, not run status',obs_event(rid)['outcome']=='SUCCESS',obs_event(rid))
    # New P1: cancel after prior SUCCESS observation, with no in-flight action.
    t,aa=prep(amount=43);rid=t['run_id'];sent=r.dispatch(t,aa[0]['id']);rec=g.execute(**sent);r.observe(r.row(rid),aa[0]['id'],rec);r.cancel(rid)
    ck('P1 already-observed success cancels into COMPENSATING',r.row(rid)['status']=='COMPENSATING')
    owner=r.claim(rid,'undo-confirmed',r.row(rid)['version']);r.observe(owner,aa[0]['id'],rec)
    ck('idempotent observation preserves compensation route',r.row(rid)['status']=='COMPENSATING')
    r.compensate(r.row(rid),aa[0]['id'],rid+':undo',bind('undo-'+rid,43,'refund',aa[0]['key']))
    usent=r.dispatch(r.row(rid),rid+':undo');urec=g.execute(**usent);r.unknown(r.row(rid),rid+':undo')
    no('UNKNOWN undo prevents false completion',lambda:r.finish_compensation(r.row(rid)))
    r.observe(r.row(rid),rid+':undo',g.query(usent['key']));ck('compensation receipt event remains SUCCESS',obs_event(rid)['outcome']=='SUCCESS')
    r.finish_compensation(r.row(rid));r.cancel(rid);ck('repeat cancel preserves COMPENSATED',r.row(rid)['status']=='COMPENSATED')
    # All known failures have no effect to compensate.
    t,aa=prep();rid=t['run_id'];r.dispatch(t,aa[0]['id']);r.observe(r.row(rid),aa[0]['id'],{'key':aa[0]['key'],'binding':aa[0]['binding'],'outcome':'FAILED_KNOWN'});r.cancel(rid)
    ck('all-known-failed cancellation needs no compensation',r.row(rid)['status']=='CANCELLED')
    # Unknown action cannot be compensated from speculation; dependency blocks undo2.
    t,aa=prep(2,amount=17);rid=t['run_id']
    for a in aa:
        sent=r.dispatch(r.row(rid),a['id']);rec=g.execute(**sent);r.observe(r.row(rid),a['id'],rec)
    r.cancel(rid);owner=r.claim(rid,'undo-dependency',r.row(rid)['version'])
    u1=rid+':undo1';u2=rid+':undo2'
    r.compensate(owner,aa[1]['id'],u1,bind(u1,17,'refund',aa[1]['key']))
    r.compensate(r.row(rid),aa[0]['id'],u2,bind(u2,17,'refund',aa[0]['key']),dependency=u1)
    no('prepared dependency blocks undo2 dispatch',lambda:r.dispatch(r.row(rid),u2))
    u=r.dispatch(r.row(rid),u1);rec=g.execute(**u);r.unknown(r.row(rid),u1)
    no('UNKNOWN dependency blocks undo2',lambda:r.dispatch(r.row(rid),u2))
    r.observe(r.row(rid),u1,g.query(u['key']));u=r.dispatch(r.row(rid),u2);r.observe(r.row(rid),u2,g.execute(**u));r.finish_compensation(r.row(rid))
    ck('resolved dependency completes business compensation',r.row(rid)['status']=='COMPENSATED')
    # Separate remote transaction dedupe/rollback proof within this fixture only.
    one=g.execute('isolated-charge',bind('isolated-charge',23));ck('same-key receipt immutable',g.execute('isolated-charge',bind('isolated-charge',23))==one)
    no('same-key changed amount rejected',lambda:g.execute('isolated-charge',bind('isolated-charge',24)))
    with transaction(g.path) as db:db.execute("CREATE TRIGGER force_receipt_rollback BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'independent failure'); END")
    balance=scalar(g.path,'SELECT balance FROM account WHERE id=1');no('receipt insert failure aborts effect',lambda:g.execute('rollback-new',bind('rollback-new',11)))
    ck('effect rollback matches failed receipt commit',scalar(g.path,'SELECT balance FROM account WHERE id=1')==balance)
    with transaction(g.path) as db:db.execute('DROP TRIGGER force_receipt_rollback')
    # Unknown obligation escalates durably; no receipt means no relay acknowledgment.
    t,aa=prep();rid=t['run_id'];r.dispatch(t,aa[0]['id']);r.unknown(r.row(rid),aa[0]['id']);case=r.escalate(r.row(rid),aa[0]['id'])
    no('speculative unknown effect cannot be compensated',lambda:r.compensate(r.row(rid),aa[0]['id'],rid+':undo',bind('unknown-undo',37,'refund',aa[0]['key'])))
    no('case relay waits for durable exact receipt',lambda:r.acknowledge_case(case,'transport sent'))
    r.acknowledge_case(case,g.case(case));ck('case acknowledgment retains UNKNOWN obligation',r.action(aa[0]['id'])['status']=='UNKNOWN')
 out['passed']=True
except BaseException as e:
 out.update(passed=False,failure=str(e),traceback=traceback.format_exc())
finally:
 out['checks']=checks;out['count']=len(checks);out['after']=hashes();out['unchanged']=before==out['after']
 Path('docs/reviews/ch34-independent-probe-results.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps({k:out.get(k) for k in ['passed','count','unchanged','failure']}))
 if not out.get('passed') or not out['unchanged']:raise SystemExit(1)
