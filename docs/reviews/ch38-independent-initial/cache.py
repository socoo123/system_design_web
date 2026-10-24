"""One SQLite file models a cache write authority shared by independent App processes.
This is not Redis replication or a CDN. App evidence is trusted and must come from
new primary snapshots, with read-start timestamp and tombstone revision on absence.
"""
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass

SCHEMA = """
CREATE TABLE IF NOT EXISTS runtime (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY, floor INTEGER NOT NULL DEFAULT 0,
  ticket TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cache_value (
  key TEXT PRIMARY KEY, version INTEGER NOT NULL, observed INTEGER NOT NULL,
  hard INTEGER NOT NULL, absent INTEGER NOT NULL, body TEXT NOT NULL);
"""

@dataclass(frozen=True)
class Token:
    epoch: str
    ticket: str

@dataclass(frozen=True)
class Evidence:
    version: int
    observed: int
    hard: int
    absent: bool = False
    body: str = ""

    @classmethod
    def primary(cls, version, started, absent=False, body=""):
        return cls(version, started, started + (5000 if absent else 20000), absent, body)

class Cache:
    def __init__(self, file, clock=None):
        self.db = sqlite3.connect(file, isolation_level=None, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.clock = clock or (lambda: time.time_ns() // 1_000_000)
        self.db.executescript(SCHEMA)
        self.db.execute("INSERT OR IGNORE INTO runtime VALUES (1,?)", (uuid.uuid4().hex,))

    @contextmanager
    def atomic(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def claim(self, key):
        with self.atomic():
            now = self.clock()  # do not sample before waiting for the write lock
            self.db.execute("INSERT OR IGNORE INTO metadata(key) VALUES (?)", (key,))
            val = self.db.execute("SELECT * FROM cache_value WHERE key=?", (key,)).fetchone()
            if val is not None and val["hard"] > now + 2000:
                return "HIT", Evidence(val["version"], val["observed"], val["hard"], bool(val["absent"]), val["body"])
            state = self.db.execute("SELECT * FROM metadata WHERE key=?", (key,)).fetchone()
            if state["lease_until"] > now:
                return "WAIT", None
            ticket = uuid.uuid4().hex
            self.db.execute("UPDATE metadata SET ticket=?,lease_until=? WHERE key=?", (ticket, now + 1000, key))
            epoch = self.db.execute("SELECT epoch FROM runtime WHERE id=1").fetchone()[0]
            return "LEADER", Token(epoch, ticket)

    def invalidate(self, key, version):
        with self.atomic():
            self.db.execute("INSERT OR IGNORE INTO metadata(key) VALUES (?)", (key,))
            self.db.execute("UPDATE metadata SET floor=max(floor,?),ticket=NULL,lease_until=0 WHERE key=?", (version, key))
            self.db.execute("DELETE FROM cache_value WHERE key=?", (key,))

    def fill(self, key, token, evidence):
        with self.atomic():
            now = self.clock()
            state = self.db.execute("SELECT * FROM metadata WHERE key=?", (key,)).fetchone()
            epoch = self.db.execute("SELECT epoch FROM runtime WHERE id=1").fetchone()[0]
            if state is None or token.epoch != epoch or token.ticket != state["ticket"]:
                return False
            life = 5000 if evidence.absent else 20000
            if (now >= state["lease_until"] or evidence.version < state["floor"]
                or evidence.hard - evidence.observed != life
                or evidence.observed > now + 2000 or now + 2000 >= evidence.hard):
                return False
            self.db.execute("INSERT OR REPLACE INTO cache_value VALUES (?,?,?,?,?,?)", (key,
                evidence.version, evidence.observed, evidence.hard, evidence.absent, evidence.body))
            self.db.execute("UPDATE metadata SET ticket=NULL,lease_until=0 WHERE key=?", (key,))
            return True

    def restart(self):
        with self.atomic():
            self.db.execute("UPDATE runtime SET epoch=? WHERE id=1", (uuid.uuid4().hex,))
            self.db.execute("UPDATE metadata SET ticket=NULL,lease_until=0")
            self.db.execute("DELETE FROM cache_value")

    def value(self, key):
        return self.db.execute("SELECT * FROM cache_value WHERE key=?", (key,)).fetchone()

    def close(self):
        self.db.close()
