"""SQLite transaction exercises for the custom teaching catalog, not an Iceberg SDK test.
SQLite's one-writer transactions exercise pointer+identity atomicity and rollback.
No network, object-store, distributed-database durability or fault-injection claim.
"""
import hashlib
import json
import sqlite3
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def publish(db, table, batch, digest, expected, candidate, fail_before_commit=False):
    db.execute("BEGIN IMMEDIATE")
    try:
        known = db.execute("SELECT digest,snapshot FROM accepted WHERE table_id=? AND batch_id=?",
                           (table, batch)).fetchone()
        if known:
            if known[0] != digest:
                raise ValueError("identity digest mismatch")
            db.commit()
            return known[1]
        changed = db.execute("UPDATE catalog SET current=? WHERE table_id=? AND current=?",
                             (candidate, table, expected)).rowcount
        if changed != 1:
            db.rollback()
            return "CONFLICT"
        db.execute("INSERT INTO accepted VALUES(?,?,?,?)", (table, batch, digest, candidate))
        if fail_before_commit:
            raise RuntimeError("simulated application abort before COMMIT")
        db.commit()
        return candidate
    except BaseException:
        db.rollback()
        raise


def verify():
    checks = []
    with tempfile.TemporaryDirectory(prefix="ch43-catalog-") as directory:
        file = str(Path(directory) / "catalog.sqlite")
        a = sqlite3.connect(file, isolation_level=None)
        a.executescript("""
            CREATE TABLE catalog(table_id TEXT PRIMARY KEY NOT NULL, current TEXT NOT NULL);
            CREATE TABLE accepted(table_id TEXT NOT NULL, batch_id TEXT NOT NULL,
              digest TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(table_id,batch_id));
            INSERT INTO catalog VALUES('events','meta40'),('other','meta40');
        """)
        b = sqlite3.connect(file, isolation_level=None)
        digest = hashlib.sha256(b"events|append|p0:[0,5)|logic-v1").hexdigest()
        assert publish(a, "events", "b17", digest, "meta40", "meta41") == "meta41"
        checks.append("normal publication commits pointer and accepted identity")
        assert publish(b, "events", "b18", "other-digest", "meta41", "meta42") == "meta42"
        # Model an ACK discarded by the caller, then a retry after another commit.
        assert publish(a, "events", "b17", digest, "meta40", "duplicate-candidate") == "meta41"
        assert a.execute("SELECT current FROM catalog WHERE table_id='events'").fetchone()[0] == "meta42"
        assert a.execute("SELECT count(*) FROM accepted WHERE table_id='events' AND batch_id='b17'").fetchone()[0] == 1
        checks.append("lost caller ACK and newer current pointer still recover original batch")
        assert publish(b, "events", "stale", "stale-digest", "meta40", "stale-output") == "CONFLICT"
        assert a.execute("SELECT count(*) FROM accepted WHERE batch_id='stale'").fetchone()[0] == 0
        checks.append("stale expected pointer cannot overwrite newer snapshot")
        try:
            publish(a, "events", "b19", "abort-digest", "meta42", "meta43", True)
            raise AssertionError("abort expected")
        except RuntimeError:
            pass
        assert b.execute("SELECT current FROM catalog WHERE table_id='events'").fetchone()[0] == "meta42"
        assert b.execute("SELECT count(*) FROM accepted WHERE batch_id='b19'").fetchone()[0] == 0
        checks.append("abort before COMMIT rolls back pointer and identity together")
        try:
            publish(a, "events", "b17", "changed-operation", "meta42", "meta44")
            raise AssertionError("mismatch expected")
        except ValueError:
            pass
        assert publish(b, "other", "b17", "other-table", "meta40", "other41") == "other41"
        checks.append("same table/batch binds digest; another table has separate identity")
        # A read before the operation starts sees absence. The later writer can still commit.
        assert b.execute("SELECT count(*) FROM accepted WHERE batch_id='inflight'").fetchone()[0] == 0
        assert publish(a, "events", "inflight", "pending", "meta42", "meta43") == "meta43"
        checks.append("an absent lookup is not terminal proof of nonpublication")
        barrier = threading.Barrier(2)
        def compete(index):
            db = sqlite3.connect(file, isolation_level=None)
            try:
                barrier.wait()
                return publish(db, "events", f"race-{index}", f"race-op-{index}", "meta43", f"race-{index}")
            finally:
                db.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(compete, [0, 1]))
        assert outcomes.count("CONFLICT") == 1 and sum(value.startswith("race-") for value in outcomes) == 1
        assert a.execute("SELECT count(*) FROM accepted WHERE batch_id LIKE 'race-%'").fetchone()[0] == 1
        checks.append("two concurrent writers on one expected pointer produce one winner and one conflict")
        a.close()
        b.close()
    return checks


if __name__ == "__main__":
    checks = verify()
    print(json.dumps({"passed": True, "checks": checks, "count": len(checks)}, indent=2))
