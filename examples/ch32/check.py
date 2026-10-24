"""Execute real file SQLite transactions. Protocol pseudocode is reviewed separately."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import os
import platform
import sqlite3
import subprocess
import sys
import tempfile
import threading

import ledger as L

RESULTS = []


def check(condition, label, details=None):
    if not condition:
        raise AssertionError(label + ": " + str(details))
    RESULTS.append({"check": label, "passed": True, "details": details})


def reserve(db, rid="r", owner="w1", allow=True, bound=3000):
    return L.reserve_first(db, "t", rid, "body:" + rid, "p1", "plan12", "A:r7",
                           bound, owner, allow)


def final(db, tenant, rid, n, input_tokens, output_tokens, evidence):
    a=L.attempt(db,tenant,rid,n)
    upstream_id=f"provider:{rid}:{n}"
    L.bind_upstream(db,tenant,rid,n,a["owner"],upstream_id,a["expected_model"])
    return L.settle(db,tenant,rid,n,input_tokens,output_tokens,evidence,
                    upstream_id=upstream_id,served_model=a["expected_model"])


def parallel(path, functions):
    barrier = threading.Barrier(len(functions))
    def call(fn):
        db = L.connect(path)
        barrier.wait()
        try:
            return fn(db)
        except L.Denied:
            return "DENIED"
        finally:
            db.close()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(call, functions))


def main():
    with tempfile.TemporaryDirectory(prefix="ch32-ledger-") as tmp:
        path = Path(tmp) / "normal.db"
        L.initialize(path)
        db = L.connect(path)
        check(reserve(db)["created"], "normal reservation owns first dispatch")
        check(L.balance(db)["held"] == 3000, "normal durable hold is 3000")
        check(L.claim_commit(db,"t","r",1,"w1"), "selected owner commits")
        check(not L.claim_commit(db,"t","r",1,"w1"), "repeat barrier does not reauthorize headers")
        check(not L.claim_commit(db,"t","r",1,"other"), "foreign owner cannot commit")
        check(final(db,"t","r",1,2000,400,"upstream-1:final"), "normal final usage settles")
        check((L.balance(db)["held"], L.balance(db)["settled"]) == (0,2400),
              "hold converts to 2400 and 600 becomes available")
        check(not final(db,"t","r",1,2000,400,"upstream-1:final"), "duplicate final no debit")
        try:
            final(db,"t","r",1,2000,401,"new-event-id")
            check(False, "conflicting usage must fail")
        except L.Conflict:
            check(L.balance(db)["settled"] == 2400, "new event ID cannot charge same attempt twice")
        for bad_id,bad_model in (("wrong-id","A:r7"),("provider:r:1","wrong-model")):
            try:
                L.settle(db,"t","r",1,2000,400,"upstream-1:final",
                         upstream_id=bad_id,served_model=bad_model)
                check(False,"wrong usage source accepted")
            except L.Conflict:
                check(L.balance(db)["settled"]==2400,"wrong request/model usage rejected",[bad_id,bad_model])
        q = reserve(db, owner="w2")
        check(not q["created"] and q["request"]["route"]=="plan12", "rid replay returns original request")
        try:
            L.reserve_first(db,"t","r","changed","p1","p13","A:r7",3000,"w9")
            check(False,"changed body must conflict")
        except L.Conflict:
            check(L.balance(db)["settled"] == 2400,"changed body rejected with unchanged balance")
        check(L.close_if_selected(db,"t","r",1,"w1"), "terminal closes selected request")
        db.close()

        path=Path(tmp)/"source-identity.db"; L.initialize(path)
        db=L.connect(path); reserve(db,"one"); reserve(db,"two")
        L.bind_upstream(db,"t","one",1,"w1","same-upstream","A:r7")
        try:
            L.bind_upstream(db,"t","two",1,"w1","same-upstream","A:r7")
            check(False,"same upstream must not belong to two attempts")
        except L.Conflict:
            check(L.attempt(db,"t","two",1)["upstream_id"] is None,
                  "same provider call cannot be bound to two attempts")
        try:
            L.settle(db,"t","two",1,None,None,"no-final",
                     upstream_id="unknown",served_model="A:r7")
            check(False,"missing usage must not become zero")
        except ValueError:
            check(L.balance(db)["held"]==6000,"missing usage preserves both holds")
        db.close()

        path = Path(tmp) / "last-budget.db"
        L.initialize(path,cap=3000)
        res=parallel(path,[lambda db,i=i: reserve(db,f"r{i}",f"w{i}")["created"] for i in range(12)])
        with L.connect(path) as db:
            check(res.count(True)==1 and res.count("DENIED")==11,
                  "12 connections race for last hold: exactly one winner", res)
            check(L.balance(db)["held"]==3000 and db.execute("SELECT count(*) FROM requests").fetchone()[0]==1,
                  "denied request insertion rolls back with hold")

        path = Path(tmp) / "same-rid.db"
        L.initialize(path,cap=50000)
        res=parallel(path,[lambda db,i=i: reserve(db,"same",f"w{i}")["created"] for i in range(12)])
        with L.connect(path) as db:
            check(res.count(True)==1 and res.count(False)==11,"12 connections same rid reserve once",res)
            check(L.balance(db)["held"]==3000,"same-rid competition keeps one hold")

        path = Path(tmp) / "fallback.db"
        L.initialize(path,cap=6000)
        db=L.connect(path); reserve(db)
        check(L.mark_failure(db,"t","r",1,"w1"),"timeout records UNKNOWN")
        check(L.balance(db)["held"]==3000,"timeout retains original hold")
        check(L.reserve_fallback(db,"t","r","w1","B:r3",3000,"w2")["created"],"explicit fallback owns new attempt")
        check(L.balance(db)["held"]==6000,"two unknown attempts require two holds")
        check(not L.claim_commit(db,"t","r",1,"w1"),"late a1 cannot commit after a2 selected")
        check(not L.close_if_selected(db,"t","r",1,"w1"),"late a1 cannot close a2")
        check(L.claim_commit(db,"t","r",2,"w2"),"a2 selected owner can commit")
        try:
            L.reserve_fallback(db,"t","r","w1","B:r3",3000,"w3")
            check(False,"third attempt must fail")
        except L.Denied:
            check(db.execute("SELECT count(*) FROM attempts").fetchone()[0]==2,"third attempt forbidden")
        db.execute("INSERT INTO budgets(tenant,period,cap) VALUES('t','p2',99999)")
        check(final(db,"t","r",2,2000,400,"b-final"),"settle a2 before a1")
        check(final(db,"t","r",1,2000,400,"a-final"),"late a1 usage still charges a1")
        check((L.balance(db)["held"],L.balance(db)["settled"])==(0,4800),"two actual attempts total4800")
        check(L.balance(db,period="p2")["settled"]==0,"late usage stays original budget period")
        db.close()

        path=Path(tmp)/"insufficient-extra.db"; L.initialize(path,cap=5000)
        db=L.connect(path); reserve(db); L.mark_failure(db,"t","r",1,"w1")
        try:
            L.reserve_fallback(db,"t","r","w1","B:r3",3000,"w2")
            check(False,"cannot reuse unknown hold")
        except L.Denied:
            check(L.balance(db)["held"]==3000 and L.request(db,"t","r")["selected"]==1,
                  "insufficient fallback rolls back without freeing a1")
        db.close()

        path=Path(tmp)/"no-extra.db"; L.initialize(path)
        db=L.connect(path); reserve(db,allow=False); L.mark_failure(db,"t","r",1,"w1")
        try:
            L.reserve_fallback(db,"t","r","w1","B:r3",3000,"w2")
            check(False,"policy forbids extra cost")
        except L.Denied:
            check(L.balance(db)["held"]==3000,"unknown with strict policy has no fallback")
        db.close()

        # A public commit races classification + fallback. Request-row mutation
        # and owner/outcome tests must prevent both paths authorizing delivery.
        for i in range(24):
            path=Path(tmp)/f"commit-race-{i}.db"; L.initialize(path)
            db=L.connect(path); reserve(db); db.close()
            def fallback(db):
                L.mark_failure(db,"t","r",1,"w1")
                return L.reserve_fallback(db,"t","r","w1","B:r3",3000,"w2")["created"]
            res=parallel(path,[lambda db:L.claim_commit(db,"t","r",1,"w1"),fallback])
            with L.connect(path) as db:
                q=L.request(db,"t","r")
                check(not (res[0] is True and res[1] is True) and
                      not (q["committed"] and q["selected"]==2),
                      f"commit versus fallback race {i}: never both",res)

        path=Path(tmp)/"settle-race.db"; L.initialize(path)
        db=L.connect(path); reserve(db); db.close()
        res=parallel(path,[lambda db:final(db,"t","r",1,2000,400,"immutable-final") for _ in range(12)])
        with L.connect(path) as db:
            check(res.count(True)==1 and res.count(False)==11,"12 final usage arrivals debit once",res)
            check((L.balance(db)["held"],L.balance(db)["settled"])==(0,2400),"settlement race preserves both balances")

        # Use real process exit, including exit after COMMIT but before any I/O.
        for committed in (False,True):
            path=Path(tmp)/f"crash-{committed}.db"; L.initialize(path)
            script=("import os,ledger as L; db=L.connect("+repr(str(path))+"); " +
                    ("L.reserve_first(db,'t','r','body:r','p1','p12','A',3000,'w1',True); " if committed else
                     "db.execute('BEGIN IMMEDIATE'); db.execute(\"UPDATE budgets SET held=3000\"); ")+
                    "os._exit(23)")
            child=subprocess.run([sys.executable,"-c",script],cwd=Path(__file__).parent,capture_output=True)
            check(child.returncode==23,f"actual process exit {'after' if committed else 'before'} commit")
            with L.connect(path) as db:
                if committed:
                    check(L.balance(db)["held"]==3000 and not reserve(db)["created"],
                          "reopen after intent commit retains hold and no redispatch")
                    L.mark_failure(db,"t","r",1,"w1")
                    check(L.attempt(db,"t","r",1)["state"]=="UNKNOWN", "recovery marks ambiguous intent UNKNOWN")
                else:
                    check(L.balance(db)["held"]==0 and L.request(db,"t","r") is None,
                          "crash inside transaction rolls back unowned hold")

        path=Path(tmp)/"overage.db"; L.initialize(path,cap=3000)
        db=L.connect(path); reserve(db)
        check(final(db,"t","r",1,2000,1500,"provider-exceeded-bound"),"unexpected overage is recorded, not discarded")
        check(L.balance(db)["settled"]==3500 and L.balance(db)["blocked"]==1,"violated bound blocks new work and exposes debt")
        try:
            reserve(db,"next",bound=1)
            check(False,"blocked budget must reject")
        except L.Denied:
            check(L.balance(db)["settled"]==3500,"overage cannot be hidden by rejecting evidence")
        db.close()

    result={"passed":True,"checks":RESULTS,"count":len(RESULTS),"python":platform.python_version(),
            "sqlite":sqlite3.sqlite_version,"source_sha256":hashlib.sha256(Path(L.__file__).read_bytes()).hexdigest(),
            "scope":"Local file SQLite/multi-connection/process-exit only; no PostgreSQL, provider I/O or network SSE"}
    target=Path(__file__).resolve().parents[2]/"docs/reviews/ch32-ledger-results.json"
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({k:v for k,v in result.items() if k!="checks"},ensure_ascii=False))


if __name__=="__main__":
    main()
