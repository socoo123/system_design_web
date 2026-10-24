"""Run normal paths and adversarial schedules against the SQLite contract model."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
from tempfile import TemporaryDirectory
from model import Authority, Data, Conflict, Denied, NotFound, Unknown, namespace

checks = []
def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append({"name": name, "passed": True})
def raises(name, kind, action):
    try: action()
    except kind: checks.append({"name": name, "passed": True})
    else: raise AssertionError(name + " did not reject")
scope = ("tenant-a", "photos", "cat.jpg")
digest = lambda b: sha256(b).hexdigest()

with TemporaryDirectory(prefix="ch22-") as work:
    data = Data(); a = Authority(Path(work)/"authority.sqlite", data)
    a.grant("alice", *scope[:2]); a.grant("bob", *scope[:2]); a.grant("eve", "tenant-b", "photos")
    def begin(request, payload=b"cat", target=scope, **kwargs):
        return a.begin("alice", target, request, len(payload), digest(payload), **kwargs)
    def prepare(u, payload=b"cat", copies=3):
        r = data.stage(u["id"], u["fence"], 1, payload, copies=copies)
        p = a.register("alice", u["id"], u["fence"], r)
        return a.freeze("alice", u["id"], u["fence"], [p]), r
    def publish(u, parts, **kwargs): return a.publish("alice", u["id"], u["fence"], parts, **kwargs)
    u = begin("normal"); parts, receipt = prepare(u)
    raises("frozen upload invisible before publication", NotFound, lambda: a.resolve("alice", scope))
    result = publish(u, parts)
    check("normal publish returns allocated version", result == ["CREATED", u["version_id"]])
    version, lease = a.resolve("alice", scope)
    check("normal read pins exact manifest", json.loads(version["manifest"]) == parts)
    check("create identity replays same upload", begin("normal")["id"] == u["id"])
    raises("same identity different content hash rejects", Conflict, lambda: begin("normal", b"dog"))
    raises("same identity changed generation precondition rejects", Conflict, lambda: begin("normal", expected=9))
    raises("same identity changed size rejects", Conflict, lambda: begin("normal", b"cats"))
    check("two scopes do not collide on request text", begin("normal", target=("tenant-a","photos","other.jpg"))["id"] != u["id"])
    raises("cross-tenant initiate rejected", Denied, lambda: a.begin("eve", scope, "x", 3, digest(b"cat")))
    raises("other owner cannot query result despite bucket write", Denied, lambda: a.query("bob", u["id"]))
    raises("other owner cannot renew read lease", Conflict, lambda: a.renew_read("bob", scope, lease, now=10))
    a.renew_read("alice", scope, lease, now=10)
    check("own active read lease renews", True)

    crash = begin("rollback", b"new"); pcrash, _ = prepare(crash, b"new")
    raises("injected before current update rolls back entire metadata transaction", RuntimeError,
           lambda: publish(crash, pcrash, fail_before_current=True))
    with a.connection() as db:
        check("rollback leaves no inserted version", db.execute("SELECT count(*) FROM versions WHERE id=?", (crash["version_id"],)).fetchone()[0] == 0)
    check("rollback preserves old current", a.resolve("alice", scope)[0]["id"] == u["version_id"])
    raises("simulated successful COMMIT with lost ACK is unknown", Unknown, lambda: publish(crash, pcrash, lost_ack=True))
    check("unknown resolves fixed result", a.query("alice", crash["id"]) == ("COMPLETED", ["CREATED", crash["version_id"]]))
    check("replay old success never resets current", publish(u, parts) == result and a.resolve("alice", scope)[0]["id"] == crash["version_id"])

    race_scope = ("tenant-a", "photos", "conditional.jpg")
    contenders = [begin("cas-"+str(i), target=race_scope, expected=0) for i in range(12)]
    prepared = [prepare(x)[0] for x in contenders]
    with ThreadPoolExecutor(max_workers=12) as pool:
        outcomes = list(pool.map(lambda pair: publish(*pair), zip(contenders,prepared)))
    check("12 SQLite writers with expected_generation=0: one publication", sum(x[0] == "CREATED" for x in outcomes) == 1)
    loser_index = next(i for i,x in enumerate(outcomes) if x[0] == "CONFLICT")
    loser, ploser = contenders[loser_index], prepared[loser_index]
    a.delete_marker("alice", race_scope)
    check("rejected precondition outcome stays rejected after later mutation", publish(loser, ploser) == ["CONFLICT", None])
    plain_scope = ("tenant-a", "photos", "unconditional.jpg")
    x, y = begin("plain-x", target=plain_scope), begin("plain-y", b"dog", target=plain_scope)
    px, _ = prepare(x); py, _ = prepare(y,b"dog")
    publish(y,py); publish(x,px)
    check("unconditional current follows serialized publication, not init time", a.resolve("alice", plain_scope)[0]["id"] == x["version_id"])

    weak = begin("weak"); pw, _ = prepare(weak, copies=2)
    raises("two copies do not satisfy three-copy receipt", Conflict, lambda: publish(weak,pw))
    six = begin("ec-six", copies=6); psix, _ = prepare(six,copies=6)
    check("six-fragment policy count accepted by model", publish(six,psix)[0] == "CREATED")
    wrong = begin("wrong-content"); pwrong,_ = prepare(wrong,b"dog")
    raises("same-length wrong full content rejected", Conflict, lambda: publish(wrong,pwrong))
    forged = replace(receipt, upload=wrong["id"])
    raises("forged Data receipt rejected", Conflict, lambda: a.register("alice",wrong["id"],1,forged))

    multi = begin("multi", b"abcdef")
    r1 = data.stage(multi["id"],1,1,b"old"); p1 = a.register("alice",multi["id"],1,r1)
    rnew = data.stage(multi["id"],1,1,b"abc"); pnew = a.register("alice",multi["id"],1,rnew,previous=1)
    r2 = data.stage(multi["id"],1,2,b"def"); p2 = a.register("alice",multi["id"],1,r2)
    raises("stale same-number part selection cannot freeze", Conflict, lambda: a.freeze("alice",multi["id"],1,[p1,p2]))
    raises("reordered manifest cannot freeze", Conflict, lambda: a.freeze("alice",multi["id"],1,[p2,pnew]))
    raises("missing part cannot freeze", Conflict, lambda: a.freeze("alice",multi["id"],1,[pnew]))
    selected = a.freeze("alice",multi["id"],1,[pnew,p2])
    raises("part replacement after freeze rejects", Conflict, lambda: a.register("alice",multi["id"],1,data.stage(multi["id"],1,1,b"abc"),previous=2))
    raises("abort after FINALIZING loses", Conflict, lambda: a.abort("alice",multi["id"]))
    raises("ordinary GC cannot claim FINALIZING even after a long delay", Conflict, lambda: a.claim_upload(multi["id"],now=10000))
    check("frozen recovery preserves selected parts", a.freeze("alice",multi["id"],1,selected,now=10000) == selected)
    check("multipart publishes full ordered content", publish(multi,selected)[0] == "CREATED")
    raises("different completion manifest never returns old success", Conflict, lambda: a.freeze("alice",multi["id"],1,[p1,p2]))
    raises("published selected part cannot be swept as extra", Conflict, lambda: a.sweep_extra(multi["id"],rnew.blob))
    a.sweep_extra(multi["id"],r1.blob)
    check("unselected old attempt swept, selected data survives", r1.blob not in data.blobs and rnew.blob in data.blobs and r2.blob in data.blobs)

    aborted = begin("abort-first"); pa,ra = prepare(aborted)
    # prepare froze it; use a fresh OPEN session to test the opposite serial order.
    aborted = begin("abort-open"); ra = data.stage(aborted["id"],1,1,b"cat")
    a.register("alice",aborted["id"],1,ra)
    check("abort wins OPEN", a.abort("alice",aborted["id"]) == "ABORTED")
    raises("late complete after abort rejects", Conflict, lambda: a.freeze("alice",aborted["id"],1,a.parts("alice",aborted["id"])))
    late = data.stage(aborted["id"],1,2,b"late")
    raises("late physical bytes cannot register after abort", Conflict, lambda: a.register("alice",aborted["id"],1,late))
    raises("quarantine still protects an aborted session", Conflict, lambda: a.claim_upload(aborted["id"],now=100))
    fence = a.claim_upload(aborted["id"],now=600)
    check("abort cleanup sweeps exact upload after fence/drain", a.sweep_upload(aborted["id"],fence) and ra.blob not in data.blobs and late.blob not in data.blobs)

    orphan = begin("late-writer")
    ticket = data.start(orphan["id"],1,1,b"cat")
    gc_fence = a.claim_upload(orphan["id"],now=600)
    check("GC waits for a Data writer admitted before fencing", a.sweep_upload(orphan["id"],gc_fence) is False)
    late_receipt = data.finish(ticket)
    raises("late old receipt cannot become visible after GC claim", Conflict, lambda: a.register("alice",orphan["id"],1,late_receipt,now=600))
    raises("Data stops new old-generation writes", Conflict, lambda: data.start(orphan["id"],1,1,b"cat"))
    check("retry after writer drain removes late debris", a.sweep_upload(orphan["id"],gc_fence) and late_receipt.blob not in data.blobs)
    raises("GC skips completed session", Conflict, lambda: a.claim_upload(u["id"],now=10000))

    retire = begin("retire", target=("tenant-a","photos","retire.jpg")); pretire,rretire = prepare(retire)
    publish(retire,pretire)
    rv,rlease = a.resolve("alice",("tenant-a","photos","retire.jpg"),now=10)
    raises("current is never reclaimable", Conflict, lambda: a.claim_version(rv["id"]))
    a.delete_marker("alice",("tenant-a","photos","retire.jpg"))
    raises("delete marker hides unversioned GET", NotFound, lambda: a.resolve("alice",("tenant-a","photos","retire.jpg")))
    check("explicit retained version survives marker", a.resolve("alice",("tenant-a","photos","retire.jpg"),version=rv["id"],now=11)[0]["id"] == rv["id"])
    raises("retention reference still prevents GC", Conflict, lambda: a.claim_version(rv["id"]))
    raises("explicit version cannot cross namespace", NotFound, lambda: a.resolve("alice",scope,version=rv["id"]))
    a.release_retention(rv["id"]); a.claim_version(rv["id"])
    raises("resolve cannot create lease after GC fencing", NotFound, lambda: a.resolve("alice",("tenant-a","photos","retire.jpg"),version=rv["id"]))
    raises("old read lease cannot renew after GC fencing", Conflict, lambda: a.renew_read("alice",("tenant-a","photos","retire.jpg"),rlease,now=12))
    check("preexisting leases delay physical deletion", a.sweep_version(rv["id"],now=70) is False and rretire.blob in data.blobs)
    check("all leases expired at 71 allows physical deletion", a.sweep_version(rv["id"],now=71) and rretire.blob not in data.blobs)
    check("completed replay after lawful payload GC returns original receipt", publish(retire,pretire) == ["CREATED", retire["version_id"]])
    rejected_fence = a.claim_upload(loser["id"],now=600)
    check("rejected candidate physically swept", a.sweep_upload(loser["id"],rejected_fence))
    # RECLAIMING is cleanup state: the durable terminal result must survive it too.
    check("rejected fixed result is still queryable after candidate GC", a.query("alice",loser["id"])[1] == ["CONFLICT", None])
    check("rejected replay after candidate GC is independent of Data", publish(loser,ploser) == ["CONFLICT", None])
    check("capacity decimal weighted mean", 0.8*10_000+0.2*499_960_000 == 100_000_000)
    check("mixed redundancy bytes and API N-1", 20*3+80*1.5 == 180 and 20*5 >= 96 and 19*5 < 96)
    check("repair budgets and multipart arithmetic", 4_000_000/500 == 8000 and 1_000_000/500 == 2000 and 5*1024/64 == 80 and 10_000*64/1024 == 625)

result = {"checks": checks, "passed": True, "count": len(checks), "source_hashes": {str(p):sha256(p.read_bytes()).hexdigest() for p in Path(__file__).parent.iterdir() if p.is_file()}}
destination = Path(__file__).resolve().parents[2]/"docs/reviews/ch22-code-results.json"
destination.write_text(json.dumps(result,indent=2)+"\n")
print(f"{len(checks)} checks passed")
