"""Executable local adapter. No RPC, replicated log or distributed lock."""
from pathlib import Path
import json
import re
import sqlite3

HERE = Path(__file__).resolve().parent
STATEMENTS = dict(re.findall(r"-- name: (\w+)\n(.*?)(?=\n-- name: |\Z)",
                             (HERE / "submit.sql").read_text(), re.S))


class Rejected(Exception):
    pass


def connect(path):
    if sqlite3.sqlite_version_info < (3, 35, 0):
        raise RuntimeError("SQLite 3.35+ is required for RETURNING")
    con = sqlite3.connect(path, timeout=5, isolation_level=None)
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    return con


def initialize(path, quantity=1, order_ids=("o1", "o2")):
    con = connect(path)
    try:
        con.executescript((HERE / "schema.sql").read_text())
        con.execute("INSERT INTO stock VALUES ('t1','sku1',?)", (quantity,))
        con.executemany("INSERT INTO orders VALUES ('t1',?,'sku1',1,'DRAFT',0)",
                        [(order_id,) for order_id in order_ids])
        con.execute("INSERT INTO range_owner VALUES ('r1',7,'ACTIVE')")
        con.execute("INSERT INTO range_data VALUES ('r1',0)")
    finally:
        con.close()


def submit(path, tenant, caller, key, order_id, expected_version, fault=None):
    # Tenant/caller and authorization are trusted inputs from the service.
    if not all(isinstance(v, str) and v for v in (tenant, caller, key, order_id)):
        raise ValueError("nonempty identifiers required")
    if type(expected_version) is not int or expected_version < 0:
        raise ValueError("nonnegative integer version required")
    request = json.dumps([tenant, order_id, expected_version], separators=(",", ":"))
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        saved = con.execute("""SELECT request, response FROM request_result
            WHERE tenant=? AND caller=? AND request_key=?""", (tenant, caller, key)).fetchone()
        if saved:
            if saved[0] != request:
                raise Rejected("KEY_CONFLICT")
            con.commit()
            return json.loads(saved[1])
        params = dict(tenant=tenant, order_id=order_id, expected_version=expected_version)
        row = con.execute(STATEMENTS["submit_order"], params).fetchone()
        if row is None:
            raise Rejected("STATE_CONFLICT")
        params.update(sku=row[0], qty=row[1], version=row[2])
        if con.execute(STATEMENTS["take_stock"], params).rowcount != 1:
            raise Rejected("SOLD_OUT")
        if fault == "after_stock":
            raise RuntimeError("injected crash before event/result")
        response = dict(tenant=tenant, order_id=order_id, sku=row[0], qty=row[1],
                        state="SUBMITTED", version=row[2])
        encoded = json.dumps(response, sort_keys=True, separators=(",", ":"))
        params.update(event_id=json.dumps([tenant, order_id, row[2], "submitted"]),
                      payload=encoded, caller=caller, key=key, request=request, response=encoded)
        con.execute(STATEMENTS["event"], params)
        con.execute(STATEMENTS["result"], params)
        con.commit()
        return response
    except BaseException:
        if con.in_transaction:
            con.rollback()
        raise
    finally:
        con.close()


def guarded_increment(path, revision):
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        owner = con.execute("SELECT revision,state FROM range_owner WHERE range_id='r1'").fetchone()
        if owner != (revision, "ACTIVE"):
            raise Rejected("STALE_ROUTE")
        con.execute("UPDATE range_data SET value=value+1 WHERE range_id='r1'")
        con.commit()
    except BaseException:
        if con.in_transaction:
            con.rollback()
        raise
    finally:
        con.close()


def freeze(path, revision):
    con = connect(path)
    try:
        con.execute("BEGIN IMMEDIATE")
        changed = con.execute("""UPDATE range_owner SET state='FROZEN'
            WHERE range_id='r1' AND revision=? AND state='ACTIVE'""", (revision,)).rowcount
        if changed != 1:
            raise Rejected("FENCE_CONFLICT")
        con.commit()
    except BaseException:
        if con.in_transaction:
            con.rollback()
        raise
    finally:
        con.close()
