"""Run real SQLite transactions and new-input failure schedules on catalog.py."""
import copy
import json
import pathlib
import tempfile
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from catalog import Catalog, Rejected, gather

results = []


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    results.append(dict(name=name, passed=True))


def rejects(name, work):
    try:
        work()
    except Rejected:
        check(name, True)
        return
    raise AssertionError(name + ": accepted")


def point(version=1, deleted=False, tenant="t1", id="a", vector=None):
    return dict(tenant=tenant, id=id, version=version, deleted=deleted,
                category="public", vector=vector or [1.0, 0.0])


def reply(p, shard, attempt="a", hits=None):
    root = p["roots"][shard]
    return dict(query=p["query"], bundle=p["bundle"], shard=shard, root=root["hash"],
                epoch=root["epoch"], cut=root["cut"], attempt=attempt, hits=hits or [])


with tempfile.TemporaryDirectory() as temp:
    path = str(pathlib.Path(temp) / "catalog.sqlite")
    c = Catalog(path)
    c.add_space("s1", "m1")
    t1 = c.accept("s1", 0, "op1", point())
    check("durable receipt before apply", t1 == ("s1", 1, 1) and c.db.execute("SELECT applied FROM progress WHERE space='s1' AND shard=0").fetchone()[0] == 0)
    check("lost ACK retry returns original token", c.accept("s1",0,"op1",point()) == t1)
    rejects("operation payload conflict", lambda:c.accept("s1",0,"op1",point(version=2)))
    rejects("accept rollback", lambda:c.accept("s1",0,"failed",point(version=2),True))
    check("rollback leaves no durable gap", c.db.execute("SELECT durable FROM progress WHERE space='s1' AND shard=0").fetchone()[0] == 1)
    rejects("apply rollback", lambda:c.apply_next("s1",0,True))
    check("apply rollback hides vector and watermark", c.db.execute("SELECT count(*) FROM mvcc").fetchone()[0] == 0 and c.db.execute("SELECT applied FROM progress WHERE space='s1' AND shard=0").fetchone()[0] == 0)
    c.close()
    c = Catalog(path)
    check("reopen receipt survives", c.accept("s1",0,"op1",point()) == t1)
    check("replay after process reopen", c.apply_next("s1",0))
    check("empty prefix does not advance", not c.apply_next("s1",0))
    delete = c.accept("s1",0,"delete",point(version=3,deleted=True))
    c.accept("s1",0,"stale",point(version=2))
    c.drain("s1",0)
    c.create_bundle("g1","s1")
    rejects("route cannot mutate inside a token-bound space", lambda:c.create_bundle("bad-route","s1",route="hash-v2"))
    c.stage_root("g1",0,3)
    rejects("cannot stage unapplied cut", lambda:c.stage_root("g1",1,1))
    rejects("all-shard publication blocks missing shard", lambda:c.publish("main",0,"g1",{0:(1,3),1:(1,0)}))
    check("failed first publication leaves no alias", c.db.execute("SELECT count(*) FROM alias").fetchone()[0] == 0)
    c.stage_root("g1",1,0)
    check("publish complete bundle", c.publish("main",0,"g1",{0:(1,3),1:(1,0)}) == 1)
    old = c.pin("main","old",{0:delete})
    oldpoints=json.loads(old["roots"][0]["document"])["points"]
    check("stale upsert cannot resurrect delete", len(oldpoints)==1 and oldpoints[0]["deleted"] and oldpoints[0]["version"]==3)
    rejects("published roots immutable", lambda:c.stage_root("g1",0,3))
    rejects("old epoch token rejected", lambda:c.pin("main","wrongepoch",{0:("s1",2,1)}))
    rejects("unknown shard token needs translation", lambda:c.pin("main","wrongmap",{2:("s1",1,1)}))
    newtoken=c.accept("s1",0,"new",point(version=4))
    rejects("durable token ahead of bundle cannot be silently searched", lambda:c.pin("main","too-fresh",{0:newtoken}))
    c.drain("s1",0)
    c.create_bundle("g2","s1",codebook="pq-v2")
    c.stage_root("g2",0,4); c.stage_root("g2",1,0)
    check("new publication", c.publish("main",1,"g2",{0:(1,4),1:(1,0)}) == 2)
    current=c.pin("main","current",{0:newtoken})
    check("old query still pins old cut", old["bundle"]=="g1" and old["roots"][0]["cut"]==3 and current["roots"][0]["cut"]==4)
    rejects("pinned old root cannot retire", lambda:c.retire("g1"))
    rejects("old rollback fails current freshness barrier", lambda:c.publish("main",2,"g1",{0:(1,4),1:(1,0)}))
    rejects("stale publisher CAS loses", lambda:c.publish("main",1,"g1",{0:(1,3),1:(1,0)}))
    attempts={0:"a",1:"b"}
    r0=reply(current,0,"a",[dict(id="a",distance=0.2)])
    r1=reply(current,1,"b",[dict(id="b",distance=0.1)])
    merged=gather(current,attempts,[r0,r1],k=1)
    check("complete query merge uses lower distance", merged["complete"] and merged["hits"][0]["id"]=="b" and len(merged["hits"])==1)
    check("missing shard is failure with no normal hits", gather(current,attempts,[r0])["status"]=="UNAVAILABLE" and gather(current,attempts,[r0])["hits"]==[])
    partial=gather(current,attempts,[r0],allow_partial=True)
    check("explicit partial keeps coverage", not partial["complete"] and partial["covered"]==[0] and partial["missing"]==[1])
    check("late old attempt does not fill missing shard", not gather(current,attempts,[r0,reply(current,1,"old")])["complete"])
    check("same attempt duplicate counts once", gather(current,attempts,[r0,r0,r1])["covered"]==[0,1])
    mixed=copy.deepcopy(r1); mixed["bundle"]="g1"
    rejects("mixed bundle rejected", lambda:gather(current,attempts,[r0,mixed]))
    moving=copy.deepcopy(r1); moving["cut"]+=1
    rejects("minimum watermark is not fixed read cut", lambda:gather(current,attempts,[r0,moving]))
    conflicting=copy.deepcopy(r0); conflicting["hits"]=[]
    rejects("same attempt inconsistent second reply", lambda:gather(current,attempts,[r0,conflicting,r1]))
    invalid=copy.deepcopy(r1); invalid["hits"]=[dict(id="nan",distance=float("nan"))]
    rejects("NaN score rejected", lambda:gather(current,attempts,[r0,invalid]))
    check("complete empty result differs from missing", gather(current,attempts,[reply(current,0,"a"),reply(current,1,"b")])["complete"])
    c.release("old"); c.retire("g1")
    check("retire after old query release", c.db.execute("SELECT count(*) FROM bundle WHERE id='g1'").fetchone()[0]==0)
    rejects("active bundle cannot retire", lambda:c.retire("g2"))

    # Actual separate connections race on the same durable operation.
    barrier=Barrier(2)
    def competing_accept(_):
        local=Catalog(path)
        barrier.wait()
        try: return local.accept("s1",1,"race",point(id="race"))
        finally: local.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        tokens=list(pool.map(competing_accept,range(2)))
    check("concurrent duplicate accepts share one receipt", tokens==[("s1",1,1),("s1",1,1)])
    check("concurrent duplicate created one event", c.db.execute("SELECT count(*) FROM event WHERE space='s1' AND shard=1").fetchone()[0]==1)
    c.drain("s1",1)
    for b in ("g3a","g3b"):
        c.create_bundle(b,"s1"); c.stage_root(b,0,4); c.stage_root(b,1,1)
    barrier=Barrier(2)
    def competing_publish(b):
        local=Catalog(path)
        barrier.wait()
        try:
            return local.publish("main",2,b,{0:(1,4),1:(1,1)})
        except Rejected:
            return "CAS_LOST"
        finally: local.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcome=list(pool.map(competing_publish,("g3a","g3b")))
    check("concurrent full publications have exactly one CAS winner", sorted(map(str,outcome))==["3","CAS_LOST"])
    c.add_space("s2","m2")
    c.accept("s2",0,"embedded-m2",point(vector=[0.,1.])); c.drain("s2",0)
    c.create_bundle("model2","s2"); c.stage_root("model2",0,1); c.stage_root("model2",1,0)
    check("model migration publishes a separate supplied-vector space", c.publish("main",3,"model2",{0:(1,1),1:(1,0)})==4)
    rejects("old-space token with coincident epoch and LSN rejected after alias switch", lambda:c.pin("main","foreign-token",{0:t1}))
    pinned2=c.pin("main","model-query")
    check("model migration schema remains bound", json.loads(pinned2["roots"][0]["document"])["schema"]["model"]=="m2")
    check("old query remains m1 after model swap", json.loads(current["roots"][0]["document"])["schema"]["model"]=="m1")
    c.release("current")
    c.retire("g2")
    check("old model root released and reclaimed", c.db.execute("SELECT count(*) FROM root WHERE bundle='g2'").fetchone()[0]==0)

    # Same-version conflicts halt apply rather than skip an unsearchable prefix.
    c.accept("s2",0,"bad-version",point(vector=[1.,0.]))
    rejects("same version changed content stops apply", lambda:c.apply_next("s2",0))
    check("conflict does not advance searchable prefix", c.db.execute("SELECT applied FROM progress WHERE space='s2' AND shard=0").fetchone()[0]==1)
    c.add_space("guard","m1",shards=(0,))
    c.accept("guard",0,"v3",point(version=3,deleted=True))
    c.accept("guard",0,"old-v2",point(version=2))
    c.accept("guard",0,"old-v2-conflict",point(version=2,vector=[0.,1.]))
    c.apply_next("guard",0); c.apply_next("guard",0)
    rejects("version identity also covers stale no-op events", lambda:c.apply_next("guard",0))
    c.close()

output=dict(passed=True, checks=len(results), results=results,
            limitations="SQLite local authority only; no ANN, replication, embedding, network or crash fsync fault experiment")
destination=pathlib.Path(__file__).resolve().parents[2]/"docs/reviews/ch31-sqlite-results.json"
destination.write_text(json.dumps(output,indent=2)+"\n")
print(json.dumps(dict(passed=True,checks=len(results),evidence=str(destination))))
