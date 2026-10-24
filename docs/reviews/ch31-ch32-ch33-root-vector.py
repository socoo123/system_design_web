"""New integration inputs against the actual Ch31 SQLite adapter, not a mirror."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "examples/ch31"))
from catalog import Catalog, Rejected, gather

rows = []


def check(name, condition):
    rows.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


def reject(name, call):
    try:
        call()
    except Rejected:
        check(name, True)
    else:
        check(name, False)


def point(tenant, version=1, deleted=False):
    return dict(tenant=tenant, id="shared-id", version=version, deleted=deleted,
                category="science", vector=[3., 0., 4.])


def response(pinned, shard, attempt, hits):
    root = pinned["roots"][shard]
    return dict(query=pinned["query"], bundle=pinned["bundle"], shard=shard,
                root=root["hash"], epoch=root["epoch"], cut=root["cut"],
                attempt=attempt, hits=hits)


with tempfile.TemporaryDirectory() as temp:
    dbfile = str(Path(temp) / "vectors.db")
    c = Catalog(dbfile)
    c.add_space("science-v1", "embedding-a", dimensions=3, shards=(3, 7))
    initial_token = c.accept("science-v1", 3, "blue-action", point("blue"))
    c.accept("science-v1", 3, "red-action", point("red", 9))
    c.drain("science-v1", 3)
    c.create_bundle("before-delete", "science-v1")
    c.stage_root("before-delete", 3, 2)
    c.stage_root("before-delete", 7, 0)
    c.publish("search", 0, "before-delete", {3: (1, 2), 7: (1, 0)})
    first = c.pin("search", "reader-one")
    second = c.pin("search", "reader-two")
    data = json.loads(first["roots"][3]["document"])
    check("same external ID remains separated by tenant", len(data["points"]) == 2)
    check("cosine vectors normalized before durable snapshot", data["points"][0]["vector"] == [0.6, 0., 0.8])

    delete_token = c.accept("science-v1", 3, "blue-delete", point("blue", 5, True))
    c.accept("science-v1", 3, "late-blue-v2", point("blue", 2))
    c.drain("science-v1", 3)
    c.create_bundle("after-delete", "science-v1", codebook="pq-v4")
    c.stage_root("after-delete", 3, 4)
    c.stage_root("after-delete", 7, 0)
    c.publish("search", 1, "after-delete", {3: (1, 4), 7: (1, 0)})
    newest = c.pin("search", "reader-new", {3: delete_token})
    check("pin keeps original immutable bytes after new publication", first["roots"][3]["document"] == second["roots"][3]["document"] and first["roots"][3]["cut"] == 2)
    latest = json.loads(newest["roots"][3]["document"])["points"]
    by_tenant = {p["tenant"]: p for p in latest}
    check("late upsert cannot reverse only one tenant tombstone", by_tenant["blue"]["deleted"] and by_tenant["blue"]["version"] == 5 and by_tenant["red"]["version"] == 9)
    c.release("reader-one")
    reject("a second reader still prevents retirement", lambda: c.retire("before-delete"))
    c.release("reader-two")
    c.retire("before-delete")
    check("retired root removed only after both releases", c.db.execute("SELECT count(*) FROM root WHERE bundle='before-delete'").fetchone()[0] == 0)

    attempts = {3: "selected-3", 7: "selected-7"}
    good = response(newest, 3, "selected-3", [dict(id="z", distance=0.25)])
    stale = response(newest, 7, "old-attempt", [dict(id="untrusted-late", distance=-100)])
    check("a late reply cannot complete missing coverage", gather(newest, attempts, [good, stale])["status"] == "UNAVAILABLE")
    empty = response(newest, 7, "selected-7", [])
    merged = gather(newest, attempts, [stale, good, empty], k=1)
    check("valid empty shard still completes a globally nonempty query", merged["complete"] and merged["covered"] == [3, 7] and merged["hits"][0]["id"] == "z")
    corrupt = dict(empty, root=first["roots"][3]["hash"])
    reject("correct bundle cannot hide wrong read-root digest", lambda: gather(newest, attempts, [good, corrupt]))
    future = dict(empty, cut=1)
    reject("higher minimum watermark is not the pinned exact cut", lambda: gather(newest, attempts, [good, future]))
    reject("different shard token cannot silently map to new layout", lambda: c.pin("search", "bad-map", {0: ("science-v1", 1, 1)}))

    c.close()
    c = Catalog(dbfile)
    check("new connection sees durable delete receipt", c.accept("science-v1", 3, "blue-delete", point("blue", 5, True)) == delete_token)
    restored = c.pin("search", "after-reopen", {3: delete_token})
    check("catalog reopen retains exact published root bytes", restored["roots"][3]["hash"] == newest["roots"][3]["hash"])
    c.release("reader-new")
    c.release("after-reopen")
    reject("serving alias prevents retirement without any query pin", lambda: c.retire("after-delete"))

    c.add_space("science-v2", "embedding-b", dimensions=3, shards=(3, 7))
    new_model_token = c.accept("science-v2", 3, "reembedded-blue", point("blue"))
    c.drain("science-v2", 3)
    c.create_bundle("other-model", "science-v2")
    c.stage_root("other-model", 3, 1)
    c.stage_root("other-model", 7, 0)
    c.publish("search", 2, "other-model", {3: (1, 1), 7: (1, 0)})
    check("cross-model counterexample actually has matching epoch and LSN", initial_token[1:] == new_model_token[1:])
    reject("same-number old-space token cannot authorize a new-model read", lambda: c.pin("search", "cross-space", {3: initial_token}))
    new_model = c.pin("search", "new-model-reader", {3: new_model_token})
    check("correct-space token pins the newly published model", json.loads(new_model["roots"][3]["document"])["schema"]["model"] == "embedding-b")
    c.close()

with tempfile.TemporaryDirectory() as compiled:
    jdk = Path("/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin")
    compile_run = subprocess.run([str(jdk / "javac"), "--release", "17", "-d", compiled,
                                 str(ROOT / "examples/ch31/VectorCandidates.java"),
                                 str(ROOT / "docs/reviews/ch31-ch32-ch33-VectorProbe.java")], capture_output=True, text=True)
    if compile_run.returncode:
        raise AssertionError(compile_run.stderr)
    java_run = subprocess.run([str(jdk / "java"), "-cp", compiled, "VectorProbe"], capture_output=True, text=True)
    if java_run.returncode:
        raise AssertionError(java_run.stderr)

result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "files": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in (
        "examples/ch31/catalog.py", "examples/ch31/VectorCandidates.java", "docs/reviews/ch31-ch32-ch33-VectorProbe.java")},
    "checks": rows, "passed": all(r["passed"] for r in rows),
    "java": {"release": 17, "compileExit": compile_run.returncode, "exit": java_run.returncode, "stdout": java_run.stdout},
    "limits": "Actual local SQLite adapter with new inputs and process-connection reopen. No ANN, server restart, distributed WAL or physical file-GC experiment.",
}
(ROOT / "docs/reviews/ch31-ch32-ch33-root-vector-results.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "sqliteChecks": len(rows), "java": java_run.stdout.strip()}))
