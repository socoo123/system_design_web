"""Independent transitions/numbers; no import of the author's verifier."""
from pathlib import Path
import hashlib, html, itertools, json, re, sqlite3, tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[2]
checks=[]
def check(v,n):
    assert v,n
    checks.append(n)
def event(v,deleted=False,payload='body'):
    obj={'id':'d','v':v,'deleted':deleted,'payload':None if deleted else payload}
    obj['digest']=hashlib.sha256(json.dumps(obj,sort_keys=True).encode()).hexdigest()
    return obj
def db_at(path):
    db=sqlite3.connect(path,isolation_level=None,timeout=10)
    db.row_factory=sqlite3.Row
    return db
def apply(db,e,unknown=False):
    db.execute('BEGIN IMMEDIATE')
    row=db.execute('''INSERT INTO idx VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      v=excluded.v,digest=excluded.digest,deleted=excluded.deleted,payload=excluded.payload
      WHERE excluded.v>idx.v RETURNING v''',
      (e['id'],e['v'],e['digest'],e['deleted'],e['payload'])).fetchone()
    db.execute('COMMIT')
    if unknown:return 'RETRY'
    if row:return 'ACK'
    current=db.execute('SELECT * FROM idx WHERE id=?',(e['id'],)).fetchone()
    if not current or current['v']<e['v']:return 'STOP'
    if current['v']==e['v'] and current['digest']!=e['digest']:return 'STOP'
    return 'ACK'
def setup(db):db.execute('CREATE TABLE idx(id TEXT PRIMARY KEY,v INTEGER,digest TEXT,deleted INTEGER,payload TEXT)')
with tempfile.TemporaryDirectory(prefix='ch13-independent-') as td:
    f=Path(td)/'index.sqlite';db=db_at(f);setup(db)
    check(apply(db,event(12))=='ACK','normal source v12 apply')
    check(apply(db,event(13,True))=='ACK','logical deletion v13 indexed')
    check(apply(db,event(12))=='ACK','late v12 is superseded rather than applied')
    check(tuple(db.execute('SELECT v,deleted,payload FROM idx').fetchone())==(13,1,None),'tombstone retains version and clears old body')
    check(apply(db,event(13,True))=='ACK','identical version/digest replay')
    check(apply(db,event(13,False,'different'))=='STOP','same version different intent stops partition')
    check(apply(db,event(14),unknown=True)=='RETRY','lost write ACK cannot advance source checkpoint')
    check(apply(db,event(14))=='ACK','lost write ACK safe replay')
    for order in itertools.permutations([event(11),event(12),event(13,True),event(13,True)]):
        db.execute('DELETE FROM idx')
        for e in order:check(apply(db,e)=='ACK','out-of-order canonical event acknowledged safely')
        check(tuple(db.execute('SELECT v,deleted FROM idx').fetchone())==(13,1),'all orderings end at retained v13 deletion')
    db.execute('DELETE FROM idx') # unsafe prune of logical version fence
    apply(db,event(12))
    check(db.execute('SELECT deleted FROM idx').fetchone()[0]==0,'negative witness: physically removed version permits stale resurrection')
    db.execute('DELETE FROM idx')
    def worker(e):
        local=db_at(f)
        try:return apply(local,e)
        finally:local.close()
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(worker,[event(13,True),event(12)]))
    check(tuple(db.execute('SELECT v,deleted FROM idx').fetchone())==(13,1),'two connections atomically compare and replace highest version')
    db.close()

class PageFailure(Exception):pass
def page(after=0,limit=20,allowed=range(101,106),fail_authority_at=None,fail_round=None):
    out=[];scanned=0;exhausted=False;rounds=0
    while len(out)<limit and scanned<100 and not exhausted:
        n=min(limit-len(out),100-scanned);rounds+=1
        if rounds==fail_round:raise PageFailure('503 missing shard; no page/cursor')
        hits=list(range(after+1,min(after+n,150)+1))
        for hit in hits:
            after=hit;scanned+=1
            if hit==fail_authority_at:raise PageFailure('503 authority; discard buffered hits')
            if hit in allowed:out.append(hit)
        exhausted=len(hits)<n
    return {'hits':out,'after':None if exhausted else after,'truncated':scanned==100 and len(out)<limit and not exhausted,'latest_pit':'p'+str(rounds)}
p=page()
check(p['hits']==[] and p['after']==100 and p['truncated'],'100 denied hits return empty but advancing cursor')
q=page(after=p['after'])
check(q['hits']==[101,102,103,104,105] and q['after'] is None,'next page finds allowed documents and true exhaustion')
check(p['latest_pit']=='p5','refills return latest renewed PIT identity')
for params in [{'allowed':range(1,151),'fail_authority_at':3},{'fail_round':2}]:
    try:page(**params)
    except PageFailure:check(True,'unknown authority or missing shard produces no success page')
    else:raise AssertionError('failed dependency escaped as a page')
# Reproduce the old incorrect last-returned anchor: no hit means no progress.
check((None if not p['hits'] else p['hits'][-1]) is None and p['after']==100,
      'negative witness: returned-only anchor cannot progress a fully filtered page')

s=(ROOT/'chapters/ch13.html').read_text()
blocks=re.findall(r'<pre\b([^>]*)><code>([\s\S]*?)</code></pre>',s)
check(len(blocks)==3,'three page mechanisms present')
for attrs,body in blocks:
    source=re.search(r'data-source="([^"]+)"',attrs)[1]
    text=(ROOT/'examples/ch13'/source).read_text()
    if source.endswith('.java'):text=text.split('// BEGIN PAGE\n')[1].split('  // END PAGE')[0]
    check(html.unescape(body).strip()==text.strip(),'independent HTML/source comparison: '+source)

numbers={
 'average_qps':10_000_000*8/86400,'peak_qps':10_000_000*8/86400*10,
 'origin_qps':10_000*(1-.6),'aggregate_shard_tasks':10_000*(1-.6)*4,
 'per_copy_normal':4000/3,'per_copy_one_failure':4000/2,
 'per_copy_failure_at_40pct_hits':10_000*(1-.4)/2,
 'body_GB':100_000_000*2000/10**9,'three_index_copies_GB':100_000_000*2000*3/10**9,
 'api_MB_s':10_000*20_000/10**6,'candidate_bytes_offset':4*(10_000+20)*32,
 'candidate_bytes_cursor_round':4*20*32,'amplification':(10_000+20)/20,
 'all_shards_timely_probability':.99**4,'backlog':200*600,
 'drain_seconds':200*600/(600-200),'prefix_id_MB':2_000_000*5*8/10**6,
 'BM25_TF3':3*2.2/(3+1.2)}
check(numbers['amplification']==501 and numbers['drain_seconds']==300,'independent cost and catch-up arithmetic')
check(round(numbers['BM25_TF3'],4)==1.5714,'independent equal-length BM25 saturation factor')
result={'passed':True,'checks':checks,'count':len(checks),'numbers':numbers,
        'page_sha256':hashlib.sha256(s.encode()).hexdigest(),
        'limitations':['SQLite conditional replacement is not an Elasticsearch durability experiment',
                       'PIT/authority model assumes adapters; no live ES, cache, IAM, failover or load test']}
(ROOT/'docs/reviews/ch13-independent-probe-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'assertions':len(checks),'numbers':numbers},indent=2))
