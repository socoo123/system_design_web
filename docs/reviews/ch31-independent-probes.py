"""Independent new inputs; imports actual author code without modifying its files."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import copy
import hashlib
import json
import sqlite3
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch31'))
from catalog import Catalog, Rejected, gather

checks=[]
def check(name, actual, expected=True):
    checks.append(dict(name=name,actual=actual,expected=expected,passed=actual==expected))
    assert actual==expected,(name,actual,expected)
def rejects(call):
    try: call(); return False
    except Rejected: return True
def point(id, version, vector=(3.,4.,0.), deleted=False):
    return dict(tenant='review-tenant',id=id,version=version,vector=list(vector),category='allowed',deleted=deleted)
def roots(c,bundle,space,cuts):
    c.create_bundle(bundle,space)
    for shard,cut in cuts.items():c.stage_root(bundle,shard,cut)
def response(pin,shard,attempt='now',hits=()):
    root=pin['roots'][shard]
    return dict(query=pin['query'],bundle=pin['bundle'],shard=shard,root=root['hash'],epoch=root['epoch'],cut=root['cut'],attempt=attempt,hits=list(hits))

passed=False
try:
  with tempfile.TemporaryDirectory(prefix='ch31-independent-') as directory:
    path=str(Path(directory)/'actual.sqlite')
    c=Catalog(path)
    c.add_space('review-a','encoder-A-17',dimensions=3,shards=(0,2,7),route='review-route-a')
    first=c.accept('review-a',0,'first',point('p',1))
    c.accept('review-a',0,'second',point('p',2,(0.,0.,5.)))
    deleted=c.accept('review-a',0,'delete',point('p',3,deleted=True))
    c.accept('review-a',2,'q',point('q',11,(0.,5.,0.)))
    c.drain('review-a',0);c.drain('review-a',2)
    roots(c,'historical','review-a',{0:1,2:1,7:0})
    check('all required noncontiguous shards publish',c.publish('review',0,'historical',{0:(1,1),2:(1,1),7:(1,0)}),1)
    old=c.pin('review','old-query',{0:first})
    oldpoint=json.loads(old['roots'][0]['document'])['points'][0]
    check('historical cut constructed after apply-3 still has v1',oldpoint['version'],1)
    check('historical original vector normalized from 3/4/0',oldpoint['vector'],[.6,.8,0.])
    check('token is minimum but cut exact',old['roots'][0]['cut'],1)
    check('fresh deletion token cannot read old bundle',rejects(lambda:c.pin('review','too-fresh',{0:deleted})))
    check('route change cannot reuse same token space',rejects(lambda:c.create_bundle('wrong-route','review-a',route='review-route-b')))
    check('unsupported shard token rejected',rejects(lambda:c.pin('review','bad-shard',{1:('review-a',1,0)})))

    roots(c,'deleted-root','review-a',{0:3,2:1,7:0})
    c.publish('review',1,'deleted-root',{0:(1,3),2:(1,1),7:(1,0)})
    current=c.pin('review','new-query',{0:deleted})
    check('new pinned cut has tombstone',json.loads(current['roots'][0]['document'])['points'][0]['deleted'])
    check('old pin remains v1 after publication',json.loads(old['roots'][0]['document'])['points'][0]['version'],1)
    check('old fresh rollback rejected',rejects(lambda:c.publish('review',2,'historical',{0:(1,3),2:(1,1),7:(1,0)})))
    check('alias retained after failed rollback',c.db.execute("SELECT bundle FROM alias WHERE name='review'").fetchone()[0],'deleted-root')
    check('old pinned generation cannot retire',rejects(lambda:c.retire('historical')))

    attempts={0:'now',2:'now',7:'now'}
    p0=response(current,0,hits=[dict(id='far',distance=.8)])
    p2=response(current,2,hits=[dict(id='near',distance=.1)])
    p7=response(current,7)
    full=gather(current,attempts,[p7,p0,p2,p0],k=1)
    check('unordered all-shard replies dedupe and merge',full['hits'],[dict(id='near',distance=.1)])
    check('complete is coverage not approximate nearest proof',full['complete'])
    absent=gather(current,attempts,[p0,p2])
    check('missing required empty shard is not empty success',(absent['status'],absent['hits'],absent['missing']),('UNAVAILABLE',[],[7]))
    partial=gather(current,attempts,[p0,p2],allow_partial=True)
    check('opt-in partial explicitly lists coverage',(partial['status'],partial['covered'],partial['missing']),('PARTIAL',[0,2],[7]))
    late=response(current,7,attempt='retired-attempt')
    check('late old attempt cannot fill empty required shard',gather(current,attempts,[p0,p2,late])['complete'],False)
    wrong_query=copy.deepcopy(p7);wrong_query['query']='old-query'
    check('old query cannot fill new query coverage',gather(current,attempts,[p0,p2,wrong_query])['complete'],False)
    moved=copy.deepcopy(p7);moved['cut']=1
    check('higher-than-minimum but wrong exact cut rejected',rejects(lambda:gather(current,attempts,[p0,p2,moved])))
    mixed=response(old,7);mixed['query']='new-query'
    check('old bundle cannot fill current attempt',rejects(lambda:gather(current,attempts,[p0,p2,mixed])))
    altered=copy.deepcopy(p2);altered['hits']=[dict(id='different',distance=.01)]
    check('inconsistent repeated same attempt rejected',rejects(lambda:gather(current,attempts,[p0,p2,altered,p7])))
    check('complete empty differs from missing',gather(current,attempts,[response(current,s) for s in (0,2,7)])['status'],'OK')

    c.add_space('review-b','encoder-B-23',dimensions=3,shards=(0,2,7),route='review-route-b')
    other=c.accept('review-b',0,'new-encoding',point('p',1,(0.,5.,0.)))
    c.drain('review-b',0)
    roots(c,'model-b','review-b',{0:1,2:0,7:0})
    c.publish('review',2,'model-b',{0:(1,1),2:(1,0),7:(1,0)})
    check('numeric epoch/LSN collide across models',first[1:],other[1:])
    check('fixed cross-space token bug independently rejected',rejects(lambda:c.pin('review','old-space-token',{0:first})))
    new=c.pin('review','new-model-query',{0:other})
    check('new model pin uses actual new supplied vectors',json.loads(new['roots'][0]['document'])['schema']['model'],'encoder-B-23')
    check('old query still keeps encoder A',json.loads(old['roots'][0]['document'])['schema']['model'],'encoder-A-17')
    c.release('old-query');c.retire('historical')
    check('release permits retired old file generation',c.db.execute("SELECT COUNT(*) FROM root WHERE bundle='historical'").fetchone()[0],0)
    check('serving new model cannot retire',rejects(lambda:c.retire('model-b')))

    for name in ('return-a-1','return-a-2'):roots(c,name,'review-a',{0:3,2:1,7:0})
    barrier=Barrier(2)
    def publish(name):
      local=Catalog(path)
      try:
        barrier.wait(timeout=10)
        try:return local.publish('review',3,name,{0:(1,3),2:(1,1),7:(1,0)})
        except Rejected:return 'CAS_LOST'
      finally:local.close()
    with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(publish,('return-a-1','return-a-2')))
    check('rollback using caught-up full bundle has one concurrent winner',sorted(map(str,outcomes)),['4','CAS_LOST'])
    check('loser publication flag rolls back',sum(row[0] for row in c.db.execute("SELECT published FROM bundle WHERE id IN ('return-a-1','return-a-2')")),1)
    c.accept('review-b',0,'same-version-other-vector',point('p',1,(1.,0.,0.)))
    check('version conflict stops prefix',rejects(lambda:c.apply_next('review-b',0)))
    check('conflict leaves applied before durable',tuple(c.db.execute("SELECT durable,applied FROM progress WHERE space='review-b' AND shard=0").fetchone()),(2,1))
    c.create_bundle('conflict-root','review-b')
    check('conflicted later durable cut not search-ready',rejects(lambda:c.stage_root('conflict-root',0,2)))
    c.accept('review-a',2,'stale-six',point('q',6,(1.,0.,0.)))
    c.apply_next('review-a',2)
    check('old no-op version identity is retained',c.db.execute("SELECT COUNT(*) FROM seen_version WHERE space='review-a' AND shard=2 AND id='q' AND version=6").fetchone()[0],1)
    c.accept('review-a',2,'stale-six-conflict',point('q',6,(0.,0.,1.)))
    check('old no-op version with changed body halts too',rejects(lambda:c.apply_next('review-a',2)))
    check('old no-op conflict preserves previous applied cut',c.db.execute("SELECT applied FROM progress WHERE space='review-a' AND shard=2").fetchone()[0],2)
    c.close()
  passed=True
finally:
  source=ROOT/'examples/ch31/catalog.py'
  report=dict(passed=passed,count=len(checks),checks=checks,source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),sqlite_version=sqlite3.sqlite_version,
              limits='Actual local SQLite multi-connection model only; trusted router/versions/replica results, no external vector engine or replication')
  (ROOT/'docs/reviews/ch31-independent-sql-results.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(dict(passed=passed,checks=len(checks))))
