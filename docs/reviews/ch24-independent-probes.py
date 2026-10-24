"""Independent inputs against the real chapter Store/SQLite, without author check outputs."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import hashlib,json,sqlite3,tempfile,threading
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'examples/ch24'))
from model import Store,Conflict,Crash,ProviderFixture,VerifiedQuote
checks=[];observations=[]
def check(name,condition):
    if not condition:raise AssertionError(name)
    checks.append({'name':name,'passed':True})
def rejects(name,types,fn):
    try:fn()
    except types as error:checks.append({'name':name,'passed':True,'exception':type(error).__name__})
    else:raise AssertionError(name+' did not reject')
sources=[root/'chapters/ch24.html',*sorted(p for p in (root/'examples/ch24').iterdir() if p.is_file())]
before={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
with tempfile.TemporaryDirectory(prefix='ch24-independent-') as directory:
    file=Path(directory)/'money.db';s=Store(file);s.install()
    create=lambda key,**kw:s.create(key,order='indigo-order-17',amount=19007,merchant='review-merchant',env='sandbox',account='review-acct',**kw)
    # Independent retest of the concrete raw-body boundary added for the review finding.
    quote=VerifiedQuote('sandbox','review-merchant','authorized-order-quote',7,5299,'CNY','hosted-card')
    body={'order':'authorized-order-quote','businessVersion':7,'method':'hosted-card'}
    raw_create=lambda key,payload=body,q=quote,**kw:s.create_request(key,payload,q,merchant='review-merchant',env='sandbox',account='review-acct',**kw)
    qp=raw_create('quote-normal')
    check('raw normal authorized quote stores accepted intent',s.one('SELECT amount FROM payment WHERE pay_no=?',(qp,))['amount']==5299)
    check('raw rotated header preserves authorized quote intent',raw_create('quote-rotated')==qp)
    counts=tuple(s.count(t) for t in ['payment','attempt','request_key','outbox'])
    rejects('raw body version7 to version8 cannot create second intent',Conflict,lambda:raw_create('quote-attack-version',dict(body,businessVersion=8)))
    rejects('raw body method replacement rejected before write',Conflict,lambda:raw_create('quote-attack-method',dict(body,method='other-method')))
    rejects('raw body foreign order rejected before write',Conflict,lambda:raw_create('quote-attack-order',dict(body,order='another-order')))
    check('all raw mismatch attempts leave all four tables unchanged',counts==tuple(s.count(t) for t in ['payment','attempt','request_key','outbox']))
    q1=VerifiedQuote('sandbox','review-merchant','bool-order',1,17,'CNY','hosted')
    rejects('boolean True does not pass authorized numeric version1',Conflict,lambda:raw_create('quote-bool',{'order':'bool-order','businessVersion':True,'method':'hosted'},q1))
    alien=VerifiedQuote('sandbox','alien-merchant',quote.order_ref,7,5299,'CNY','hosted-card')
    rejects('foreign merchant quote is not adopted by authenticated merchant',Conflict,lambda:raw_create('quote-alien',body,alien))
    wrong_env=VerifiedQuote('live','review-merchant',quote.order_ref,7,5299,'CNY','hosted-card')
    rejects('live quote cannot be used in sandbox scope',Conflict,lambda:raw_create('quote-env',body,wrong_env))
    ignored_price=raw_create('quote-extra-price',dict(body,amount=1,currency='USD',merchant_id='alien'))
    stored=s.one('SELECT * FROM payment WHERE pay_no=?',(ignored_price,))
    check('frozen price/currency/scope come from authorized quote, not extra client fields',ignored_price==qp and (stored['amount'],stored['currency'],stored['merchant_id'])==(5299,'CNY','review-merchant'))
    # Keep normal-path counts below independent of this separate quote scenario.
    acceptance_counts=tuple(s.count(t) for t in ['payment','attempt','outbox'])
    p=create('r-1');a=p+':a7'
    check('normal acceptance stores payment, attempt, command',tuple(s.count(t) for t in ['payment','attempt','outbox'])==tuple(n+1 for n in acceptance_counts))
    check('same header and rotated header preserve one intent',create('r-1')==p and create('r-2')==p and s.count('attempt')==acceptance_counts[1]+1)
    rejects('same header changed method rejected',Conflict,lambda:create('r-1',method='another-method'))
    rejects('same business intent changed method rejected',Conflict,lambda:create('new-header',method='another-method'))
    other=s.create('r-1',order='indigo-order-17',amount=19007,merchant='other-merchant',env='sandbox',account='other-acct')
    check('merchant scope separates identical header/order text',other!=p)
    immutable_body=s.one('SELECT payload_hash FROM attempt WHERE attempt_id=?',(a,))['payload_hash']
    send=s.prepare_send(a,17000123,777)
    check('before I/O SENT and original payload hash persisted',s.one('SELECT state FROM attempt WHERE attempt_id=?',(a,))['state']=='SENT' and send['hash']==immutable_body)
    provider=ProviderFixture();provider.call(send['key'],send['hash'],True)
    s.apply_non_success(a)
    repeated=s.prepare_send(a,17000124,99999)
    check('retry never extends original 777-second window',repeated['retry_before']==17000900)
    check('cached ambiguous response stays ambiguous',provider.call(repeated['key'],repeated['hash'])=='AMBIGUOUS_500' and provider.moves==1)
    s.apply_non_success(a)  # merge that ambiguous replay result before the deadline check
    check('at exact original deadline no further send',s.prepare_send(a,17000900,99999) is None)
    check('deadline did not turn unknown into declined',s.one('SELECT state FROM attempt WHERE attempt_id=?',(a,))['state']=='UNKNOWN')
    e=s.evidence(p,'capture-indigo-17')
    rejects('unverified webhook rejected before inbox',Conflict,lambda:s.receive('independent-event-1',e,verified=False,env='sandbox',account='review-acct'))
    check('invalid webhook leaves no accepted responsibility',s.count('inbox')==0)
    for event in ['independent-event-1','independent-event-1','independent-event-2']:
        check('receive persists before ACK '+event,s.receive(event,e,env='sandbox',account='review-acct')=='2xx')
    check('two distinct events for one capture stay two inbox records',s.count('inbox')==2)
    s.receive('independent-event-1',dict(e,amount=1),env='sandbox',account='review-acct')
    check('same receipt identity with altered body is retained as anomaly',s.count('inbox')==2 and s.count('review')==1)
    original_counts=[s.count(t) for t in ['posting','entry','outbox']]
    rejects('new input crash after first capture entry rolls back',Crash,lambda:s.post_capture(e,crash=True))
    check('capture crash leaves aggregate and all three tables unchanged',[s.count(t) for t in ['posting','entry','outbox']]==original_counts and s.one('SELECT captured FROM payment WHERE pay_no=?',(p,))['captured']==0)
    for field,value in [('environment','live'),('account_id','wrong-account'),('channel','wrong-PSP'),('currency','JPY'),('amount',19006)]:
        rejects('capture rejects '+field+' mismatch',Conflict,lambda field=field,value=value:s.post_capture(dict(e,**{field:value})))
    rejects('unbalanced template cannot commit',Conflict,lambda:s.post_capture(e,credit_delta=1))
    journal=s.post_capture(e)
    check('full captured amount posted once',s.one('SELECT captured FROM payment WHERE pay_no=?',(p,))['captured']==19007)
    check('one capture journal has two complete lines',s.one('SELECT count(*) n FROM entry WHERE posting_id=?',(journal,))['n']==2)
    check('different events same effect reuse original journal',s.post_capture(e)==journal and s.count('posting')==1)
    s.apply_non_success(a);s.apply_non_success(a,True)
    check('stale timeout/failure cannot downgrade confirmed',s.one('SELECT state FROM attempt WHERE attempt_id=?',(a,))['state']=='CONFIRMED')
    check('confirmed attempt never redispatches',s.prepare_send(a,17000125) is None)
    same_account=s.create('same-account-other-payment',order='other-bound-order',amount=19007,merchant='review-merchant',env='sandbox',account='review-acct')
    rejects('same scoped effect cannot settle another payment',Conflict,lambda:s.post_capture(s.evidence(same_account,'capture-indigo-17')))
    rejects('one full capture model rejects a second external capture',Conflict,lambda:s.post_capture(dict(e,object_id='capture-indigo-18')))
    check('second capture rejection created no extra journal',s.count('posting')==1)
    reserve=lambda key,amount:s.reserve_refund(key,p,amount,merchant='review-merchant',env='sandbox')
    r1=reserve('refund-alpha',5003);r2=reserve('refund-beta',4001)
    s.refund_result(r1,'refund-external-alpha','UNKNOWN')
    check('new UNKNOWN input retains both reservations',s.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved']==9004)
    check('refund replay does not reserve again',reserve('refund-alpha',5003)==r1 and s.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved']==9004)
    rejects('refund body changed on same key',Conflict,lambda:reserve('refund-alpha',5004))
    rejects('unknown reservation cannot be spent by another request',Conflict,lambda:reserve('overspend',10004))
    before_refund=[s.count(t) for t in ['posting','entry','outbox']]
    rejects('refund first-line crash rolls back conversion and event',Crash,lambda:s.refund_result(r1,'refund-external-alpha','SUCCEEDED',crash=True))
    check('refund rollback preserves 9004 reserved',[s.count(t) for t in ['posting','entry','outbox']]==before_refund and s.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved']==9004)
    s.refund_result(r1,'refund-external-alpha','SUCCEEDED')
    state=s.one('SELECT * FROM payment WHERE pay_no=?',(p,))
    check('success converts 5003 but keeps 10003 remaining',state['reserved']==4001 and state['refunded']==5003 and state['captured']-state['refunded']-state['reserved']==10003)
    before_collision=(state['reserved'],state['refunded'],s.count('entry'),s.count('outbox'))
    rejects('one external refund cannot settle a second local reservation',sqlite3.IntegrityError,lambda:s.refund_result(r2,'refund-external-alpha','SUCCEEDED'))
    state=s.one('SELECT * FROM payment WHERE pay_no=?',(p,))
    check('effect collision rollback leaves second reservation pending',before_collision==(state['reserved'],state['refunded'],s.count('entry'),s.count('outbox')) and s.one('SELECT state FROM refund WHERE refund_id=?',(r2,))['state']=='RESERVED')
    s.refund_result(r1,'refund-external-alpha','SUCCEEDED');s.refund_result(r1,'refund-external-alpha','FAILED')
    check('duplicate/contradictory terminal evidence never decrements twice',s.one('SELECT refunded FROM payment WHERE pay_no=?',(p,))['refunded']==5003 and s.count('review')==2)
    barrier=threading.Barrier(2)
    def compete(i):
        c=Store(file)
        try:
            barrier.wait()
            try:return c.reserve_refund('last-capacity-'+str(i),p,7000,merchant='review-merchant',env='sandbox')
            except Conflict:return 'CAPACITY_REJECTED'
        finally:c.close()
    with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(compete,range(2)))
    check('two independent DB connections competing for last capacity: one wins',outcomes.count('CAPACITY_REJECTED')==1)
    check('race aggregate remains bounded',s.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved']==11001)
    s.refund_result(r2,'refund-external-beta','FAILED');s.refund_result(r2,'refund-external-beta','FAILED')
    check('proved final no-refund releases exactly once',s.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved']==7000)
    q=s.create('reconcile-request',order='reconcile-order',amount=6173,merchant='review-merchant',env='sandbox',account='review-acct')
    qe=s.evidence(q,'reconcile-capture-93');n=s.count('posting')
    rejects('reconciliation commit before case close is replayable',Crash,lambda:s.reconcile_capture('case-93',qe,True))
    check('case survives but capture already committed',s.one('SELECT * FROM review WHERE case_key=?',('case-93',)) is not None and s.one('SELECT captured FROM payment WHERE pay_no=?',(q,))['captured']==6173)
    s.reconcile_capture('case-93',qe)
    check('reconcile same effect closes case with no extra movement',s.count('posting')==n+1 and s.one('SELECT * FROM review WHERE case_key=?',('case-93',)) is None)
    rejects('historical journal mutation blocked',sqlite3.IntegrityError,lambda:s.db.execute('UPDATE entry SET amount=amount+1 WHERE posting_id=?',(journal,)))
    check('all financial journals balanced in their currency',not s.db.execute("SELECT posting_id,currency FROM entry GROUP BY posting_id,currency HAVING SUM(CASE side WHEN 'DR' THEN amount ELSE -amount END)<>0 OR COUNT(*)<>2").fetchall())
    check('all stored refund budgets bounded',not s.db.execute('SELECT 1 FROM payment WHERE reserved<0 OR refunded<0 OR reserved+refunded>captured').fetchall())
    # Deliberately leave the verified-quote precondition: illustrates why API validation is required.
    fixture_v2=create('rotated-version-header',version=2)
    observations.append({'name':'trusted fixture accepts separately authorized version2','new_payment':fixture_v2!=p,'meaning':'Not an external API exploit: Store explicitly assumes an already-authorized immutable quote. The reviewed create_request now rejects unapproved raw-body versions/methods before any write; raw probes above independently close P1.'})
    s.close()
    # Raw DB users can bypass controlled Posting: documented limitation, not an implementation proof.
    raw=Store(Path(directory)/'unrestricted.db');raw.install();rp=raw.create('raw',amount=7)
    raw.db.execute("INSERT INTO posting VALUES ('raw-post',?,'live','psp','acct1','raw-object','raw-op','CAPTURE',7,'CNY')",(rp,))
    raw.db.execute("INSERT INTO entry VALUES ('raw-post',0,'PSP_RECEIVABLE','DR',7,'CNY')")
    check('negative control: row CHECK alone permits one-sided journal',raw.count('entry')==1)
    observations.append({'name':'production raw INSERT role restriction remains a required contract','established':'SQLite schema by itself does not enforce cross-row balance; controlled Store methods do.'})
    raw.close()

creates=Fraction(1_000_000*10,86400);success=creates*Fraction(7,10);receipts=success*2
check('independent yearly three-class decimal storage arithmetic',365+Fraction(700_000*365*2*200,10**9)+511==Fraction(9782,10))
check('independent 3-copy decimal TB arithmetic',Fraction(9782,10)*3/1000==Fraction(29346,10000))
check('288 seconds is nominal rounded drain estimate',287 < Fraction(162*600,500-162) < 288)
chapter=(root/'chapters/ch24.html').read_text()
check('P2 backlog statement now explicitly nominal in Chinese and English','按名义 162' in chapter and 'not hard bounds' in chapter and 'ten minutes yields at most' not in chapter)
observations.append({'name':'nominal callbacks are not a proven backlog upper bound','exact_peak_per_second':str(receipts),'exact_10_min_count':str(receipts*600),'nominal_rounded_rate':162,'nominal_backlog':97200,'finding':'P2 closed: both languages now describe a nominal estimate rather than an at-most bound'})
after={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
output={'passed':True,'count':len(checks),'checks':checks,'observations':observations,'source_hashes_before':before,'source_hashes_after':after,'unchanged_during_run':before==after,'limits':['No live PSP/signature/clock/deadline experiment','SQLite local transaction model, not PostgreSQL failover','ProviderFixture caching is an assumed provider contract']}
(root/'docs/reviews/ch24-independent-model-results.json').write_text(json.dumps(output,indent=2)+'\n')
print(f'{len(checks)} independent checks passed; source unchanged: {before==after}')
