from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import sqlite3
import subprocess
import tempfile
import threading

root = Path(__file__).resolve().parents[2]
commands = []
checks = []


def check(value, label):
    if not value:
        raise AssertionError(label)
    checks.append(label)


def run(argv):
    result = subprocess.run([str(x) for x in argv], cwd=root, capture_output=True, text=True,
                            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
    commands.append({"argv": [str(x) for x in argv], "exitCode": result.returncode,
                     "stdout": result.stdout, "stderr": result.stderr})
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


report = {"passed": False, "commands": commands, "checks": checks, "findings": []}
try:
    jdk = Path("/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin")
    with tempfile.TemporaryDirectory(prefix="ch43-independent-java-") as compiled:
        run([jdk / "javac", "--release", "17", "-d", compiled, "examples/ch43/ExternalAggregate.java",
             "docs/reviews/ch43-independent-Probe.java"])
        report["java"] = json.loads(run([jdk / "java", "-Xmx16m", "-cp", compiled, "Ch43IndependentProbe"]))
    spec = importlib.util.spec_from_file_location("ch43_catalog_source", root / "examples/ch43/catalog_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    publish = module.publish
    with tempfile.TemporaryDirectory(prefix="ch43-independent-sql-") as tmp:
        file = Path(tmp) / "catalog.sqlite"
        db = sqlite3.connect(file, isolation_level=None)
        db.executescript("""PRAGMA journal_mode=WAL;
            CREATE TABLE catalog(table_id TEXT PRIMARY KEY NOT NULL,current TEXT NOT NULL);
            CREATE TABLE accepted(table_id TEXT NOT NULL,batch_id TEXT NOT NULL,digest TEXT NOT NULL,
              snapshot TEXT NOT NULL,PRIMARY KEY(table_id,batch_id));
            INSERT INTO catalog VALUES('sales','m100'),('returns','m100');""")
        check(publish(db, "sales", "chunk-A", "hash-A", "m100", "m101") == "m101", "new table/batch publication")
        check(publish(db, "sales", "chunk-B", "hash-B", "m101", "m102") == "m102", "pointer advances after original result")
        check(publish(db, "sales", "chunk-A", "hash-A", "m100", "reconstructed-A") == "m101", "lost ACK recovery after pointer advanced")
        check(db.execute("SELECT current FROM catalog WHERE table_id='sales'").fetchone()[0] == "m102", "replay never rewinds current pointer")
        try:
            publish(db, "sales", "chunk-A", "different", "m102", "bad")
            raise AssertionError("digest reuse accepted")
        except ValueError:
            checks.append("same batch different digest rejected")
        check(publish(db, "returns", "chunk-A", "different", "m100", "r101") == "r101", "table identity prevents cross-table collision")
        db.execute("CREATE TRIGGER reject_identity BEFORE INSERT ON accepted WHEN new.batch_id='reject' "
                   "BEGIN SELECT RAISE(ABORT,'forced identity insert failure'); END")
        try:
            publish(db, "sales", "reject", "hash", "m102", "m-bad")
            raise AssertionError("trigger should abort")
        except sqlite3.IntegrityError:
            pass
        check(db.execute("SELECT current FROM catalog WHERE table_id='sales'").fetchone()[0] == "m102", "identity insert failure rolls pointer back")
        check(db.execute("SELECT count(*) FROM accepted WHERE batch_id='reject'").fetchone()[0] == 0, "identity insert failure leaves no accepted result")
        check(publish(db, "sales", "stale-C", "hash-C", "m100", "m103") == "CONFLICT", "stale expected pointer rejected")
        check(db.execute("SELECT count(*) FROM accepted WHERE batch_id='stale-C'").fetchone()[0] == 0, "stale candidate creates no batch result")
        # Pause the actual source function after pointer UPDATE, before identity INSERT.
        reached, release = threading.Event(), threading.Event()
        def inflight():
            writer = sqlite3.connect(file, isolation_level=None)
            def trace(sql):
                if sql.startswith("INSERT INTO accepted"):
                    reached.set()
                    if not release.wait(5):
                        raise RuntimeError("review barrier timeout")
            writer.set_trace_callback(trace)
            try:
                return publish(writer, "sales", "in-flight-D", "hash-D", "m102", "m103")
            finally:
                writer.close()
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(inflight)
            if not reached.wait(5):
                raise AssertionError("writer did not reach uncommitted update")
            absent = db.execute("SELECT snapshot FROM accepted WHERE table_id='sales' AND batch_id='in-flight-D'").fetchone()
            visible = db.execute("SELECT current FROM catalog WHERE table_id='sales'").fetchone()[0]
            release.set()
            check(future.result(timeout=5) == "m103", "observed-absent in-flight transaction can later commit")
        check(absent is None and visible == "m102", "reader cannot observe uncommitted pointer/identity partial state")
        barrier = threading.Barrier(2)
        def same_batch(index):
            writer = sqlite3.connect(file, isolation_level=None)
            try:
                barrier.wait(timeout=5)
                return publish(writer, "sales", "same-E", "hash-E", "m103", "candidate-" + str(index))
            finally:
                writer.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(same_batch, [0, 1]))
        check(outcomes[0] == outcomes[1] and outcomes[0].startswith("candidate-"), "two connections same batch recover one result")
        check(db.execute("SELECT count(*) FROM accepted WHERE batch_id='same-E'").fetchone()[0] == 1, "same-batch concurrent candidates produce one identity")
        db.close()
    numeric = {
        "daily_bytes": (10**9 * 10**3, 10**12),
        "annual_raw_tb": (Decimal(10**9) * 10**3 * 365 / 10**12, 365),
        "average_events_per_second_rounded": (int((Decimal(10**9) / 86400).quantize(Decimal(1))), 11574),
        "all_hot_cost": (365 * 100, 36500),
        "tiered_cost": (100 + 364 * 10, 3740),
        "cost_saved_percent_rounded": ((Decimal(36500 - 3740) / 36500 * 100).quantize(Decimal("0.1")), Decimal("89.8")),
        "whole_table_three_column_gb": (Decimal(1000) * 3 / 20 / 4, Decimal("37.5")),
        "tenant_four_column_gb": (Decimal(1000) * 4 / 20 / 4, 50),
        "byte_ratio": (Decimal(30000) / Decimal("37.5"), 800),
        "three_column_solo_seconds": (Decimal("37.5") / 2, Decimal("18.75")),
        "three_column_shared_seconds": (Decimal("37.5") / 1, Decimal("37.5")),
        "tenant_solo_seconds": (Decimal(50) / 2, 25),
        "tenant_shared_seconds": (Decimal(50) / 1, 50),
        "hour_gb_rounded": ((Decimal(1000) / 24).quantize(Decimal("0.1")), Decimal("41.7")),
        "dremel_byte_ratio": (Decimal(87) / Decimal("0.5"), 174),
        "files_per_day": (100 * 1440, 144000),
        "files_30days": (100 * 1440 * 30, 4320000),
        "encoded_gb_per_day": (Decimal(100) * 1440 * 4 / 1000, 576),
        "rewrite_gb": (Decimal(128) * 4 * 2 / 1000, Decimal("1.024")),
        "serial_open_seconds": (Decimal(128) * Decimal("0.010"), Decimal("1.280")),
        "replay_seconds": (Decimal(1000000) / (100 - 20), 12500),
        "replay_new_gb": (Decimal(12500) * 20 / 1000, 250),
        "replay_hours_rounded": ((Decimal(12500) / 3600).quantize(Decimal("0.01")), Decimal("3.47")),
        "naive_replay_hours_rounded": ((Decimal(10000) / 3600).quantize(Decimal("0.01")), Decimal("2.78")),
    }
    for label, (actual, expected) in numeric.items():
        check(actual == expected, label)
    report["numbers"] = {label: str(actual) for label, (actual, _) in numeric.items()}
    completed = set()
    next_offset = 210
    trace = []
    for offset in [212, 210, 214, 211, 213]:
        completed.add(offset)
        while next_offset in completed:
            next_offset += 1
        trace.append({"completed": offset, "next": next_offset})
    check([r["next"] for r in trace] == [210, 211, 211, 213, 215], "new out-of-order sequence advances only a contiguous prefix")
    report["manualProtocolWalks"] = {
        "offsets": trace,
        "pinNormal": "Register s41 protection in the retention coordinator before expiry can select it; release only after all readers stop.",
        "pinFailure": "Pointer fetched before protection; GC expires s41 first. Coordinator must reject pin; reader refreshes/replans instead of GET on deleted files.",
        "publicationFence": "An unreferenced candidate selected for GC must be fenced against future writer publication before deletion. A late CAS cannot make a deleted candidate authoritative.",
        "cutover": "View v2 durable through H={p0:215,p1:71}; checkpoint and continuation ownership at those next offsets persist before publishing read entry. Reaching H without assigning continuation leaves a gap.",
        "limitation": "These are explicit protocol walk-throughs; no deployed retention coordinator, GC, stream engine or Iceberg implementation was executed."
    }
    run(["python3", "examples/ch43/check_source.py"])
    run(["node", "tools/audit-chapter.mjs", "ch43"])
    if report["java"]["singleRunMissingCandidate"]:
        report["findings"].append({"id": "R43-01", "severity": "P1", "status": "open",
                                   "case": "single spill run removed before final hasNext returns false",
                                   "observed": "aggregate returns a missing candidate path"})
    report["passed"] = not report["findings"]
except Exception as error:
    report["failure"] = repr(error)
finally:
    files = [root / "chapters/ch43.html"] + sorted(p for p in (root / "examples/ch43").rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    report["sourceHashes"] = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (root / "docs/reviews/ch43-independent-check-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"passed": report["passed"], "failure": report.get("failure"), "checks": len(checks), "java": report.get("java")}))
if not report["passed"]:
    raise SystemExit(1)
