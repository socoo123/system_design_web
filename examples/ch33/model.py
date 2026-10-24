"""Local teaching adapter: two independent SQLite databases, no real tool/MCP.

Every write() opens a new connection and a single-file BEGIN IMMEDIATE transaction.
The trusted fixture clock is sampled after acquiring that database's write lock.
Auth contexts and gateway-to-backend authenticated immutable envelopes are fixtures;
this is not a token issuer, JSON Schema engine, distributed quota or RPC library.
"""
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import hashlib
import json
import re
import sqlite3
import uuid


class Denied(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Denied(message)


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def canonical_args(raw):
    """A closed, flat ticket.close r7 schema, not a general JSON Schema validator."""
    require(isinstance(raw, bytes) and len(raw) <= 16 * 1024, "input_bytes")
    text = raw.decode("utf-8", errors="strict")
    depth, quoted, escaped = 0, False, False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            require(depth <= 8, "input_depth")
        elif char in "]}":
            depth -= 1
    def no_duplicates(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate_key")
            result[key] = value
        return result
    def no_constant(value):
        raise Denied("non_json_number:" + value)
    try:
        args = json.loads(text, object_pairs_hook=no_duplicates, parse_constant=no_constant)
    except (ValueError, RecursionError) as error:
        raise Denied("invalid_json") from error
    require(type(args) is dict and set(args) == {"ticket_id", "expected_version", "reason"}, "closed_schema")
    require(type(args["ticket_id"]) is str and re.fullmatch(r"T-[0-9]{1,12}", args["ticket_id"]), "ticket_id")
    require(type(args["expected_version"]) is int and 1 <= args["expected_version"] <= 2**31 - 1, "integer_version")
    require(type(args["reason"]) is str and 1 <= len(args["reason"]) <= 160, "reason")
    # Reject lone surrogates; no Unicode normalization, defaults or numeric coercion.
    canonical = encode(args)
    canonical.encode("utf-8", errors="strict")
    return canonical, args


@dataclass(frozen=True)
class Context:
    tenant: str = "acme"
    actor: str = "alice"
    agent: str = "support-agent"


@dataclass(frozen=True)
class Action:
    tenant: str
    actor: str
    agent: str
    intent: str
    tool: str
    revision: str
    route: str
    policy: str
    args: str
    resource: str
    version: int
    grant: str
    expires: int
    replay_until: int

    @property
    def binding(self):
        # This domain-specific JSON encoding is shared by these two fixtures only.
        return hashlib.sha256(encode(["ch33-action-v1", asdict(self)]).encode()).hexdigest()

    @property
    def key(self):
        return self.tenant, self.intent

    @property
    def proposal(self):
        return {key: value for key, value in asdict(self).items()
                if key not in {"grant", "expires", "replay_until"}}


@contextmanager
def write(path):
    connection = sqlite3.connect(path, timeout=5, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
        connection.execute("COMMIT")
    except BaseException:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()


def read(path, query, params=()):
    with sqlite3.connect(path) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(query, params).fetchone()
        return dict(row) if row is not None else None


def event(db, key, kind, detail=""):
    db.execute("INSERT INTO Audit(tenant,intent,kind,detail) VALUES(?,?,?,?)", (*key, kind, detail))


class Gateway:
    def __init__(self, path, clock):
        self.path, self.clock = str(path), clock
        with write(self.path) as db:
            db.executescript("""
CREATE TABLE IF NOT EXISTS Principal(tenant,actor,agent,user_allow INTEGER,agent_allow INTEGER,
  PRIMARY KEY(tenant,actor,agent));
CREATE TABLE IF NOT EXISTS Tool(name PRIMARY KEY,revision,route,policy,enabled INTEGER);
CREATE TABLE IF NOT EXISTS Approver(tenant,subject,PRIMARY KEY(tenant,subject));
CREATE TABLE IF NOT EXISTS Resource(id PRIMARY KEY,tenant,observed_version INTEGER);
CREATE TABLE IF NOT EXISTS Intent(tenant,intent,snapshot TEXT NOT NULL,binding TEXT NOT NULL,
  state TEXT NOT NULL,epoch INTEGER NOT NULL DEFAULT 0,cancel INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,body TEXT,reason TEXT,PRIMARY KEY(tenant,intent));
CREATE TABLE IF NOT EXISTS GrantToken(grant_id PRIMARY KEY,tenant,intent,binding,
  consumed INTEGER NOT NULL DEFAULT 0,approver,
  UNIQUE(tenant,intent),FOREIGN KEY(tenant,intent) REFERENCES Intent(tenant,intent));
CREATE TABLE IF NOT EXISTS Audit(event_id INTEGER PRIMARY KEY AUTOINCREMENT,tenant,intent,kind,detail);
""")
            # executescript commits before the script in Python, so begin a new
            # explicit transaction for fixture initialization after DDL.
            db.execute("BEGIN IMMEDIATE")
            db.execute("INSERT OR IGNORE INTO Principal VALUES('acme','alice','support-agent',1,1)")
            db.execute("INSERT OR IGNORE INTO Tool VALUES('ticket.close','r7','tickets-v1','p9',1)")
            db.execute("INSERT OR IGNORE INTO Approver VALUES('acme','reviewer')")
            db.execute("INSERT OR IGNORE INTO Resource VALUES('T-1','acme',4)")
            db.execute("INSERT OR IGNORE INTO Resource VALUES('T-2','foreign',4)")

    @staticmethod
    def action(row):
        return Action(**json.loads(row["snapshot"]))

    @staticmethod
    def caller(action, context):
        require((action.tenant, action.actor, action.agent) ==
                (context.tenant, context.actor, context.agent), "caller_mismatch")

    @staticmethod
    def live(db, action):
        principal = db.execute("SELECT * FROM Principal WHERE tenant=? AND actor=? AND agent=?",
                               (action.tenant, action.actor, action.agent)).fetchone()
        tool = db.execute("SELECT * FROM Tool WHERE name=?", (action.tool,)).fetchone()
        resource = db.execute("SELECT * FROM Resource WHERE id=?", (action.resource,)).fetchone()
        return bool(principal and principal["user_allow"] and principal["agent_allow"] and tool and tool["enabled"]
                    and resource and resource["tenant"] == action.tenant
                    and (tool["revision"], tool["route"], tool["policy"]) ==
                    (action.revision, action.route, action.policy))

    def submit(self, context, intent, raw, revision="r7"):
        args, parsed = canonical_args(raw)
        with write(self.path) as db:
            old = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", (context.tenant, intent)).fetchone()
            if old:
                action = self.action(old)
                self.caller(action, context)
                require((action.args, action.revision) == (args, revision), "intent_conflict")
                return action, old["state"]
            tool = db.execute("SELECT * FROM Tool WHERE name='ticket.close'").fetchone()
            require(tool and tool["revision"] == revision, "unreviewed_revision")
            now = self.clock()
            action = Action(context.tenant, context.actor, context.agent, intent, tool["name"], revision,
                            tool["route"], tool["policy"], args, parsed["ticket_id"], parsed["expected_version"],
                            str(uuid.uuid4()), now + 300, now + 86400)
            require(self.live(db, action), "access_denied")
            db.execute("INSERT INTO Intent(tenant,intent,snapshot,binding,state) VALUES(?,?,?,?, 'PENDING')",
                       (*action.key, encode(asdict(action)), action.binding))
            db.execute("INSERT INTO GrantToken(grant_id,tenant,intent,binding) VALUES(?,?,?,?)",
                       (action.grant, *action.key, action.binding))
            event(db, action.key, "pending")
            return action, "PENDING"

    def approve(self, key, binding, approver="reviewer"):
        with write(self.path) as db:
            row = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", key).fetchone()
            require(row is not None, "intent_missing")
            action = self.action(row)
            require(db.execute("SELECT 1 FROM Approver WHERE tenant=? AND subject=?", (key[0], approver)).fetchone(),
                    "approver_scope")
            require(binding == row["binding"] == action.binding, "approval_binding")
            if row["state"] != "PENDING":
                return row["state"]
            if self.clock() >= action.expires or not self.live(db, action):
                db.execute("UPDATE Intent SET state='DENIED',reason='expired_or_revoked' WHERE tenant=? AND intent=?", key)
                event(db, key, "denied")
                return "DENIED"
            changed = db.execute("UPDATE GrantToken SET consumed=1,approver=? WHERE grant_id=? AND binding=? AND consumed=0",
                                 (approver, action.grant, binding)).rowcount
            require(changed == 1, "grant_consumed")
            db.execute("UPDATE Intent SET state='APPROVED' WHERE tenant=? AND intent=?", key)
            event(db, key, "approved", approver)
            return "APPROVED"

    def claim(self, context, key):
        with write(self.path) as db:
            row = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", key).fetchone()
            require(row is not None, "intent_missing")
            action = self.action(row)
            self.caller(action, context)
            if row["state"] != "APPROVED":
                return None
            if self.clock() >= action.expires or row["cancel"] or not self.live(db, action):
                db.execute("UPDATE Intent SET state='DENIED',reason='dispatch_recheck' WHERE tenant=? AND intent=?", key)
                event(db, key, "denied")
                return None
            epoch = row["epoch"] + 1
            changed = db.execute("UPDATE Intent SET state='DISPATCH_INTENT',epoch=? WHERE tenant=? AND intent=? AND state='APPROVED'",
                                 (epoch, *key)).rowcount
            require(changed == 1, "claim_race")
            event(db, key, "dispatch", str(epoch))
            return action, epoch

    def unknown(self, key, epoch):
        with write(self.path) as db:
            changed = db.execute("UPDATE Intent SET state='UNKNOWN' WHERE tenant=? AND intent=? AND epoch=? AND state='DISPATCH_INTENT'",
                                 (*key, epoch)).rowcount
            if changed:
                event(db, key, "unknown")
            return bool(changed)

    def record(self, key, epoch, receipt):
        with write(self.path) as db:
            row = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", key).fetchone()
            require(row and receipt and receipt["binding"] == row["binding"], "receipt_binding")
            changed = db.execute("UPDATE Intent SET state=?,outcome=?,body=? WHERE tenant=? AND intent=? AND epoch=? AND state IN ('DISPATCH_INTENT','UNKNOWN')",
                                 (receipt["outcome"], receipt["outcome"], receipt["body"], *key, epoch)).rowcount
            if changed:
                event(db, key, "outcome", receipt["outcome"])
            return bool(changed)

    def cancel(self, context, key):
        with write(self.path) as db:
            row = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", key).fetchone()
            require(row is not None, "intent_missing")
            self.caller(self.action(row), context)
            if row["state"] in ("PENDING", "APPROVED"):
                state = "DENIED"
            elif row["state"] in ("DISPATCH_INTENT", "UNKNOWN"):
                state = "UNKNOWN"
            else:
                return row["state"]
            db.execute("UPDATE Intent SET cancel=1,state=?,reason='cancel_requested' WHERE tenant=? AND intent=?", (state, *key))
            event(db, key, "cancel_requested")
            return state

    def takeover(self, key):
        """Fence local result writers only; does not grant permission to redispatch."""
        with write(self.path) as db:
            changed = db.execute("UPDATE Intent SET epoch=epoch+1,state='UNKNOWN' WHERE tenant=? AND intent=? AND state IN ('DISPATCH_INTENT','UNKNOWN')", key).rowcount
            if changed:
                event(db, key, "recovery_owner")
        return self.status(key)

    def status(self, key):
        # Trusted internal recovery read. Public status must separately authorize.
        return read(self.path, "SELECT * FROM Intent WHERE tenant=? AND intent=?", key)

    def recover(self, key, backend):
        row, receipt = self.status(key), backend.lookup(key)
        if receipt:
            self.record(key, row["epoch"], receipt)
        return self.status(key)["state"]

    def replay_unknown(self, context, key, backend):
        with write(self.path) as db:
            row = db.execute("SELECT * FROM Intent WHERE tenant=? AND intent=?", key).fetchone()
            require(row and row["state"] == "UNKNOWN", "not_unknown")
            action = self.action(row)
            self.caller(action, context)
            now = self.clock()
            require(not row["cancel"] and now < min(action.expires, action.replay_until) and self.live(db, action), "replay_forbidden")
            epoch = row["epoch"]
            event(db, key, "same_key_replay", str(epoch))
        # This example backend permanently retains deduplication tombstones.
        receipt = backend.apply(context, action)
        self.record(key, epoch, receipt)
        return self.status(key)["state"]


class Business:
    def __init__(self, path):
        self.path = str(path)
        connection = sqlite3.connect(self.path)
        connection.executescript("""
CREATE TABLE IF NOT EXISTS Ticket(tenant,id,version INTEGER,state,PRIMARY KEY(tenant,id));
CREATE TABLE IF NOT EXISTS Principal(tenant,actor,agent,user_allow INTEGER,agent_allow INTEGER,PRIMARY KEY(tenant,actor,agent));
CREATE TABLE IF NOT EXISTS Receipt(tenant,intent,binding,snapshot,outcome,body,retired INTEGER DEFAULT 0,PRIMARY KEY(tenant,intent));
INSERT OR IGNORE INTO Ticket VALUES('acme','T-1',4,'OPEN');
INSERT OR IGNORE INTO Ticket VALUES('foreign','T-2',4,'OPEN');
INSERT OR IGNORE INTO Principal VALUES('acme','alice','support-agent',1,1);
""")
        connection.commit()
        connection.close()

    def apply(self, context, action):
        # The envelope comes from an authenticated trusted Adapter; cryptography
        # and delegation validation are production dependencies, not implemented.
        Gateway.caller(action, context)
        require((action.tool, action.revision, action.route, action.policy) ==
                ("ticket.close", "r7", "tickets-v1", "p9"), "backend_contract")
        canonical, args = canonical_args(action.args.encode())
        require((canonical, args["ticket_id"], args["expected_version"]) ==
                (action.args, action.resource, action.version), "resource_binding")
        with write(self.path) as db:
            old = db.execute("SELECT * FROM Receipt WHERE tenant=? AND intent=?", action.key).fetchone()
            if old:
                require(old["binding"] == action.binding, "business_key_conflict")
                return dict(old)
            principal = db.execute("SELECT * FROM Principal WHERE tenant=? AND actor=? AND agent=?",
                                   (action.tenant, action.actor, action.agent)).fetchone()
            require(principal and principal["user_allow"] and principal["agent_allow"], "backend_access")
            changed = db.execute("UPDATE Ticket SET state='CLOSED',version=version+1 WHERE tenant=? AND id=? AND version=? AND state='OPEN'",
                                 (action.tenant, action.resource, action.version)).rowcount
            outcome = "SUCCEEDED" if changed == 1 else "FAILED_KNOWN"
            body = encode({"ticket": action.resource, "status": "closed" if changed else "stale_precondition"})
            db.execute("INSERT INTO Receipt(tenant,intent,binding,snapshot,outcome,body) VALUES(?,?,?,?,?,?)",
                       (*action.key, action.binding, encode(asdict(action)), outcome, body))
        return self.lookup(action.key)

    def lookup(self, key):
        return read(self.path, "SELECT * FROM Receipt WHERE tenant=? AND intent=?", key)

    def compact(self, key):
        # A fixture maintenance operation after the advertised replay window:
        # retain key+binding+outcome indefinitely, never free key identity.
        with write(self.path) as db:
            db.execute("UPDATE Receipt SET snapshot=NULL,body=NULL,retired=1 WHERE tenant=? AND intent=?", key)
