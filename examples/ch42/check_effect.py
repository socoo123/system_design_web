"""Exercise the SQL embedded in effect.pseudo against a real SQLite file.

No in-memory lock is used. This verifies this local transaction boundary,
not Kafka, a distributed database, storage hardware, or a payment provider.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile

SOURCE = Path(__file__).with_name("effect.pseudo").read_text()
SQL = [long or short for long, short in re.findall(r'SQL\("""(.*?)"""\)|SQL\("([^"\n]*)"\)', SOURCE, re.S)]
assert len(SQL) == 4


def connect(file):
    db = sqlite3.connect(file, isolation_level=None, timeout=5)
    db.execute("PRAGMA synchronous=FULL")
    return db


def apply(file, scope, event, account, delta, fault=None):
    if any(not isinstance(value, str) or not value or value != value.strip()
           for value in (scope, event, account)):
        raise ValueError("PERMANENT_SCHEMA_ERROR")
    # Digest is computed from canonical operation data, never trusted from a caller.
    digest = hashlib.sha256(json.dumps(["credit-v1", account, delta], separators=(",", ":")).encode()).hexdigest()
    values = dict(scope=scope, event=event, account=account, delta=delta, digest=digest)
    db = connect(file)
    try:
        db.execute("BEGIN IMMEDIATE")
        claimed = db.execute(SQL[0], values).fetchone()
        if claimed:
            db.execute(SQL[1], values)
            changed = db.execute(SQL[2], values).rowcount
            if changed != 1:
                raise ValueError("MISSING_ACCOUNT")
            if fault == "before_commit":
                raise RuntimeError("crash window before commit")
            db.commit()
            if fault == "after_commit":
                os._exit(42)  # real process exit before any acknowledgment
            return "APPLIED"
        saved = db.execute(SQL[3], values).fetchone()
        if saved[0] != digest:
            raise ValueError("IDENTITY_CONFLICT")
        db.commit()
        return saved[1]
    except BaseException:
        if db.in_transaction:
            db.rollback()
        raise
    finally:
        db.close()


def state(file):
    with connect(file) as db:
        return dict(balance=db.execute("SELECT balance FROM account WHERE account_id='a'").fetchone()[0],
                    effects=db.execute("SELECT COUNT(*) FROM ledger").fetchone()[0],
                    inbox=db.execute("SELECT COUNT(*) FROM inbox").fetchone()[0])


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--commit-and-exit":
        apply(sys.argv[2], "ledger", "lost-reply", "a", 7, "after_commit")
        raise AssertionError("expected process exit")
    report = {"sqlite": sqlite3.sqlite_version, "source": "effect.pseudo", "cases": []}
    with tempfile.TemporaryDirectory(prefix="ch42-effect-") as tmp:
        file = str(Path(tmp) / "effect.db")
        with connect(file) as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
              CREATE TABLE account(account_id TEXT PRIMARY KEY, balance INTEGER NOT NULL);
              INSERT INTO account VALUES ('a', 0);
              CREATE TABLE inbox(scope TEXT NOT NULL CHECK(length(trim(scope))>0),
                                 event_id TEXT NOT NULL CHECK(length(trim(event_id))>0),
                                 digest TEXT NOT NULL, result TEXT NOT NULL,
                                 PRIMARY KEY(scope,event_id));
              CREATE TABLE ledger(scope TEXT NOT NULL CHECK(length(trim(scope))>0),
                                  event_id TEXT NOT NULL CHECK(length(trim(event_id))>0),
                                  account_id TEXT NOT NULL, delta INTEGER NOT NULL,
                                  PRIMARY KEY(scope,event_id));
            """)
        assert apply(file, "ledger", "e7", "a", 100) == "APPLIED"
        assert apply(file, "ledger", "e7", "a", 100) == "APPLIED"
        assert state(file) == dict(balance=100, effects=1, inbox=1)
        report["cases"].append("normal and same-identity replay: one durable effect")
        try:
            apply(file, "ledger", "e7", "a", 200)
            raise AssertionError("conflicting identity accepted")
        except ValueError as error:
            assert str(error) == "IDENTITY_CONFLICT"
        assert state(file)["balance"] == 100
        report["cases"].append("same identity, changed operation: rejected without mutation")
        with ThreadPoolExecutor(max_workers=2) as pool:
            answers = list(pool.map(lambda _: apply(file, "ledger", "concurrent", "a", 11), range(2)))
        assert answers == ["APPLIED", "APPLIED"]
        assert state(file) == dict(balance=111, effects=2, inbox=2)
        report["cases"].append("two connections race: SQLite uniqueness/transaction applies one delta")
        try:
            apply(file, "ledger", "rollback", "a", 99, "before_commit")
        except RuntimeError:
            pass
        assert state(file) == dict(balance=111, effects=2, inbox=2)
        assert apply(file, "ledger", "rollback", "a", 3) == "APPLIED"
        report["cases"].append("failure after mutation before commit: claim and effect roll back")
        child = subprocess.run([sys.executable, __file__, "--commit-and-exit", file], check=False)
        assert child.returncode == 42
        assert apply(file, "ledger", "lost-reply", "a", 7) == "APPLIED"
        assert state(file) == dict(balance=121, effects=4, inbox=4)
        report["cases"].append("actual process exit after commit before reply: replay reads original outcome")
        try:
            apply(file, "ledger", "missing", "absent", 10)
            raise AssertionError("missing account accepted")
        except ValueError as error:
            assert str(error) == "MISSING_ACCOUNT"
        assert state(file) == dict(balance=121, effects=4, inbox=4)
        report["cases"].append("missing target: inbox and ledger insert roll back together")
        for scope, event in [(None, "bad-id"), ("ledger", None), ("", "bad-id"), ("ledger", ""),
                             (" ", "bad-id"), ("ledger", " e7 ")]:
            try:
                apply(file, scope, event, "a", 17)
                raise AssertionError("malformed identity accepted")
            except ValueError as error:
                assert str(error) == "PERMANENT_SCHEMA_ERROR"
        with connect(file) as db:
            for table in ["inbox", "ledger"]:
                try:
                    db.execute(f"INSERT INTO {table} VALUES (NULL,'bad-id','a','1')")
                    raise AssertionError("database accepted null identity")
                except sqlite3.IntegrityError:
                    pass
        assert state(file) == dict(balance=121, effects=4, inbox=4)
        report["cases"].append("NULL/empty/noncanonical identity rejected; NOT NULL also guards both tables")
        report["final"] = state(file)
    report["passed"] = True
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
