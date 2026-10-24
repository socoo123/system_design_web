"""Executable SQLite contract adapter, not a replicated database service."""
import json
import os
from pathlib import Path
import sqlite3
import uuid

HERE = Path(__file__).resolve().parent
PUBLICATION = (HERE / "publication.sql").read_text().split(";", 2)
PUBLISH_SQL, CLEANUP_SQL = PUBLICATION[0] + ";", PUBLICATION[1] + ";"


class KeyConflict(ValueError):
    pass


class LostReply(ConnectionError):
    pass


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA synchronous=FULL")
    return db


def initialize(path, stock):
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript((HERE / "schema.sql").read_text())
        db.executemany("INSERT INTO inventory VALUES (?, ?)", sorted(stock.items()))
    db.close()


def canonical(request):
    if not isinstance(request, dict) or set(request) != {"lines", "delivery_ref"}:
        raise ValueError("request fields")
    delivery = request["delivery_ref"]
    raw = request["lines"]
    if not isinstance(delivery, str) or not 1 <= len(delivery) <= 128:
        raise ValueError("delivery_ref")
    if not isinstance(raw, (list, tuple)) or not 1 <= len(raw) <= 32:
        raise ValueError("lines")
    merged = {}
    for line in raw:
        if not isinstance(line, (list, tuple)) or len(line) != 2:
            raise ValueError("line")
        sku, qty = line
        if not isinstance(sku, str) or not 1 <= len(sku) <= 128:
            raise ValueError("sku")
        if type(qty) is not int or not 1 <= qty <= 1_000_000:
            raise ValueError("qty")
        merged[sku] = merged.get(sku, 0) + qty
    if sum(merged.values()) > 1_000_000:
        raise ValueError("total qty")
    lines = sorted(merged.items())
    return json.dumps({"delivery_ref": delivery, "lines": lines},
                      sort_keys=True, separators=(",", ":")), lines


def checkout(path, caller, key, request, failpoint=None):
    """caller is a trusted, globally scoped authenticated identity, never model input."""
    if any(not isinstance(v, str) or not 1 <= len(v) <= 128 for v in (caller, key)):
        raise ValueError("identity/key")
    binding, lines = canonical(request)
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        prior = db.execute("SELECT binding,outcome,order_id FROM idempotency "
                           "WHERE caller=? AND key=?", (caller, key)).fetchone()
        if prior:
            if prior["binding"] != binding:
                raise KeyConflict("same key, different canonical request")
            db.commit()
            return {"outcome": prior["outcome"], "order_id": prior["order_id"]}
        db.execute("INSERT INTO idempotency VALUES (?,?,?,'PENDING',NULL)",
                   (caller, key, binding))
        db.execute("SAVEPOINT effect")
        order_id, outcome = str(uuid.uuid4()), "CREATED"
        db.execute("INSERT INTO orders(order_id,caller,delivery_ref) VALUES (?,?,?)",
                   (order_id, caller, request["delivery_ref"]))
        for sku, qty in lines:
            changed = db.execute("UPDATE inventory SET on_hand = on_hand - :qty "
                                 "WHERE sku = :sku AND on_hand >= :qty",
                                 {"sku": sku, "qty": qty}).rowcount
            if changed != 1:
                db.execute("ROLLBACK TO effect")
                order_id, outcome = None, "OUT_OF_STOCK"
                break
            db.execute("INSERT INTO order_line VALUES (?,?,?)", (order_id, sku, qty))
        db.execute("RELEASE effect")
        db.execute("UPDATE idempotency SET outcome=?,order_id=? WHERE caller=? AND key=?",
                   (outcome, order_id, caller, key))
        if failpoint == "exit_before_commit":
            os._exit(23)
        db.commit()
        if failpoint == "exit_after_commit":
            os._exit(24)
        if failpoint == "lost_reply":
            raise LostReply("commit succeeded; response lost")
        return {"outcome": outcome, "order_id": order_id}
    except BaseException:
        if db.in_transaction:
            db.rollback()
        raise
    finally:
        db.close()


def publication(path, caller, upload_id, proof=None):
    """proof is trusted HEAD verification bound to caller/upload_id/object_key/version.

    object_key includes its store/bucket namespace, is immutable, and belongs to
    this upload session. A raw client object/version/checksum is never a proof.

    With no proof, this is the internal expiry cleaner. It returns deletion ownership
    only for its own successful PENDING -> ABORTED transition, never for a retry.
    """
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        params = {"caller": caller, "id": upload_id}
        sql = CLEANUP_SQL
        if proof is not None:
            if set(proof) != {"caller", "upload_id", "object_key", "version", "size", "checksum"}:
                raise ValueError("verified proof required")
            if proof["caller"] != caller or proof["upload_id"] != upload_id:
                raise KeyConflict("proof belongs to another session")
            if not proof["version"] or not proof["object_key"]:
                raise ValueError("exact object identity required")
            params.update({k: proof[k] for k in ("object_key", "version", "size", "checksum")})
            sql = PUBLISH_SQL
        row = db.execute(sql, params).fetchall()
        if not row and proof is not None:
            stored = db.execute("SELECT * FROM upload WHERE caller=? AND upload_id=?",
                                (caller, upload_id)).fetchone()
            if stored and stored["state"] == "COMMITTED":
                if (stored["object_key"], stored["object_version"], stored["expected_size"], stored["checksum"]) != (
                        proof["object_key"], proof["version"], proof["size"], proof["checksum"]):
                    raise KeyConflict("different object proof")
                row = [stored]
        db.commit()
        return None if not row else {k: row[0][k] for k in ("upload_id", "state", "object_version")}
    except BaseException:
        if db.in_transaction:
            db.rollback()
        raise
    finally:
        db.close()
