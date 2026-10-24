"""Run contract probes using actual SQLite transactions and independent connections."""
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import json
import sqlite3
import tempfile
import threading
import traceback
from pathlib import Path
from model import Runtime, Gateway, Rejected, connect, transaction, now

ROOT = Path(__file__).resolve().parents[2]
report = {"checks":[],"limitations":["SQLite writer locks are coarser than production row locks.",
    "Authenticated identities, approval evidence and Ch33 dispatch reauthorization are trusted fixtures.",
    "No live LLM/HTTP tool, replicated DB, remote cancellation, production load or infrastructure crash tested."]}


def check(condition, label, observed=None):
    report["checks"].append({"label":label,"passed":bool(condition),"observed":observed})
    if not condition:
        raise AssertionError(label)


def rejects(fn, label):
    try:
        fn()
    except (Rejected, sqlite3.IntegrityError) as error:
        check(True,label,str(error))
    else:
        check(False,label)


def scalar(runtime, query, args=()):
    db=connect(runtime.path)
    try: return db.execute(query,args).fetchone()[0]
    finally: db.close()


def fixture_binding(intent, tool="charge", amount=10, original=None):
    value={"tenant":"t1","actor":"alice","agent":"support","intent":intent,
           "tool":tool,"tool_revision":"v1","route":"ledger-v1","resource":"acct1",
           "resource_version":4,"policy_revision":"p1","args":{"amount":amount}}
    if original: value["args"]["original_key"]=original
    return value


def concurrent(count, fn):
    barrier=threading.Barrier(count)
    def work(i):
        barrier.wait()
        try:return fn(i)
        except Rejected as error:return "rejected:"+str(error)
    with ThreadPoolExecutor(count) as pool:
        return list(pool.map(work,range(count)))


def main():
    with tempfile.TemporaryDirectory(prefix="ch34-runtime-") as folder:
        runtime=Runtime(Path(folder)/"runs.db")
        gateway=Gateway(Path(folder)/"business.db")
        serial=[0]
        def run():
            serial[0]+=1
            rid=runtime.admit("t1","alice",f"request-{serial[0]}",{"task":"refund support"})
            return runtime.claim(rid,"worker-a",runtime.row(rid)["version"])
        def prepared(count=1):
            token=run();rid=token["run_id"]
            started=runtime.start_step(token,{"model":"pinned-v1","messages":["authorized"],
                "retrieved":[{"id":"doc-v7","text":"fixed"}],"recorded_time":123,"random":42})
            runtime.usage(started["attempt"],100)
            actions=[{"id":f"{rid}-a{i}","key":f"{rid}-k{i}","binding":fixture_binding(f"{rid}-intent-{i}")} for i in range(count)]
            runtime.commit_output(started["token"],1,{"tool_calls":[a["id"] for a in actions]},actions)
            return runtime.row(rid),actions
        def expired(token):
            with transaction(runtime.path) as db:
                db.execute("UPDATE runs SET lease_until=unixepoch('now') WHERE run_id=?",(token["run_id"],))
            return runtime.claim(token["run_id"],"worker-b",runtime.row(token["run_id"])["version"])

        # Durable acceptance and request identity.
        rid=runtime.admit("t1","alice","idempotent",{"a":1})
        check(runtime.admit("t1","alice","idempotent",{"a":1})==rid,"lost admission ACK reads original run")
        rejects(lambda:runtime.admit("t1","alice","idempotent",{"a":2}),"request-key content conflict")
        rejects(lambda:runtime.admit("t1","mallory","idempotent",{"a":1}),"request-key actor conflict")
        check(scalar(runtime,"SELECT count(*) FROM outbox WHERE run_id=?",(rid,))==1,"READY outbox persists once")
        version=runtime.row(rid)["version"]
        claims=concurrent(6,lambda i:runtime.claim(rid,f"claim-{i}",version))
        check(sum(isinstance(x,dict) for x in claims)==1,"six independent claim transactions yield one owner")
        token=next(x for x in claims if isinstance(x,dict))
        rejects(lambda:runtime.start_step({**token,"version":token["version"]-1},{"a":1}),"stale version cannot start model")
        newer=expired(token)
        check(newer["epoch"]==token["epoch"]+1,"expired owner takeover increases epoch")
        rejects(lambda:runtime.renew(token),"old owner cannot renew after takeover")
        rejects(lambda:runtime.start_step(token,{"a":1}),"old owner cannot reserve a step")

        # Pin nondeterministic observations, distinguish replay from a new attempt.
        token=run();rid=token["run_id"]
        first=runtime.start_step(token,{"retrieved":"v1","recorded_time":10,"random":17})
        token=expired(first["token"])
        again=runtime.start_step(token,{"retrieved":"v999","recorded_time":99,"random":100})
        check(again["input"]==first["input"],"retry reuses recorded retrieval/time/random input")
        check(runtime.row(rid)["step_count"]==1,"physical retry does not increment logical step")
        check(runtime.row(rid)["token_hold"]==2000,"missing usage retains both physical reservations")
        runtime.usage(first["attempt"],200);runtime.usage(first["attempt"],200)
        check(runtime.row(rid)["token_hold"]==1000 and runtime.row(rid)["token_used"]==200,"late trusted usage settles once independent of owner")
        rejects(lambda:runtime.usage(first["attempt"],201),"same attempt cannot change usage")
        runtime.commit_output(again["token"],1,{"answer":"first committed winner"})
        replay=runtime.start_step(runtime.row(rid),{"random":999})
        check(replay["saved"]=={"answer":"first committed winner"},"committed output reused without a model attempt")
        check(scalar(runtime,"SELECT count(*) FROM attempts WHERE run_id=?",(rid,))==2,"stored output adds no physical attempt")
        rejects(lambda:runtime.commit_output(first["token"],1,{"answer":"late old worker"}),"late model output cannot replace committed winner")
        token=run();attempt=runtime.start_step(token,{"a":1},59000)
        rejects(lambda:runtime.start_step(attempt["token"],{"a":2},2000),"physical retry obeys global token cap")

        # Real transaction failure rolls back output, actions and checkpoint together.
        token=run();step=runtime.start_step(token,{"a":1});rid=token["run_id"]
        with transaction(runtime.path) as db:
            db.execute("CREATE TRIGGER fail_output BEFORE INSERT ON events WHEN NEW.kind='MODEL_OUTPUT' BEGIN SELECT RAISE(ABORT,'injected checkpoint failure'); END")
        a={"id":rid+"-rollback","key":rid+"-k","binding":fixture_binding(rid)}
        rejects(lambda:runtime.commit_output(step["token"],1,{"call":a["id"]},[a]),"checkpoint failure aborts output/action transaction")
        check(scalar(runtime,"SELECT output IS NULL FROM steps WHERE run_id=?",(rid,))==1 and runtime.action(a["id"]) is None,"no output/action escapes failed checkpoint commit")
        with transaction(runtime.path) as db:db.execute("DROP TRIGGER fail_output")
        runtime.commit_output(step["token"],1,{"call":"changed unsaved answer"})
        check(runtime.start_step(runtime.row(rid),{})["saved"]=={"call":"changed unsaved answer"},"uncommitted output may differ; committed one then freezes")

        # Exact approval binding, early decision, duplicates, expiry and cancellation races.
        token,actions=prepared();rid=token["run_id"];a=actions[0]
        decision=gateway.approve(rid+"-approval",a["binding"])  # arrives before local park
        pause=runtime.park(token,a["id"],rid+"-approval")
        check(gateway.decision(rid+"-approval")==decision,"approval earlier than park remains queryable")
        for field in ["tenant","actor","agent","intent","tool","tool_revision","route","resource","resource_version","policy_revision","args"]:
            wrong=copy.deepcopy(decision);wrong["binding"][field]="changed"
            rejects(lambda d=wrong:runtime.resume(rid,pause,runtime.row(rid)["version"],d),f"approval rejects changed {field}")
        old=copy.deepcopy(decision);old["expires"]=0
        rejects(lambda:runtime.resume(rid,pause,runtime.row(rid)["version"],old),"expired approval is not READY")
        denied=copy.deepcopy(decision);denied["status"]="DENIED"
        rejects(lambda:runtime.resume(rid,pause,runtime.row(rid)["version"],denied),"DENIED is not retryable approval")
        v=runtime.row(rid)["version"]
        resumes=concurrent(6,lambda _:runtime.resume(rid,pause,v,gateway.decision(rid+"-approval")))
        check(resumes.count("ACCEPTED")==1 and resumes.count("ALREADY_ACCEPTED")==5,"six resumers accept exact decision once")
        check(scalar(runtime,"SELECT count(*) FROM outbox WHERE id=?",(f"resume:{pause}",))==1,"resume decision/READY/outbox emits once")
        runtime.cancel(rid)
        check(runtime.resume(rid,pause,v,decision)=="ALREADY_ACCEPTED" and runtime.row(rid)["status"]=="CANCELLED","duplicate accepted decision cannot revive cancelled run")
        for i in range(8):
            token,actions=prepared();rid=token["run_id"];a=actions[0]
            p=runtime.park(token,a["id"],rid+"-approve");d=gateway.approve(rid+"-approve",a["binding"]);v=runtime.row(rid)["version"]
            outcomes=concurrent(2,lambda n:runtime.cancel(rid) if n else runtime.resume(rid,p,v,d))
            check(runtime.row(rid)["cancelled"]==1 and runtime.row(rid)["status"]=="CANCELLED",f"cancel/resume race {i+1} cannot dispatch/revive",str(outcomes))

        # Serial action dispatch is explicit. A newer run version does not authorize overlap.
        token,actions=prepared(2);rid=token["run_id"]
        sent=runtime.dispatch(token,actions[0]["id"])
        rejects(lambda:runtime.dispatch(runtime.row(rid),actions[1]["id"]),"new version still rejects second tool while first DISPATCHING")
        runtime.unknown(runtime.row(rid),actions[0]["id"])
        rejects(lambda:runtime.dispatch(runtime.row(rid),actions[1]["id"]),"UNKNOWN first tool blocks second dispatch")
        rejects(lambda:runtime.start_step(runtime.row(rid),{}),"UNKNOWN cannot become a new model proposal")

        # Two database gap: absent receipt does not mean no delayed request exists.
        check(gateway.query(sent["key"]) is None,"missing receipt before delayed original execution")
        runtime.cancel(rid);recovery=runtime.claim(rid,"recovery",runtime.row(rid)["version"])
        receipt=gateway.execute(**sent)  # network packet arrives after cancellation
        rejects(lambda:runtime.observe(token,actions[0]["id"],receipt),"stale pre-cancel owner cannot record late effect")
        runtime.observe(recovery,actions[0]["id"],receipt)
        check(runtime.row(rid)["status"]=="COMPENSATING" and runtime.row(rid)["cancelled"]==1,"late success persists effect without restarting model")
        check(json.loads(scalar(runtime,"SELECT payload FROM events WHERE run_id=? AND kind='OBSERVED' ORDER BY seq DESC LIMIT 1",(rid,)))["outcome"]=="SUCCESS",
              "late-success observation event keeps action outcome distinct from COMPENSATING run state")
        replies=concurrent(6,lambda _:gateway.execute(**sent))
        check(all(x==receipt for x in replies),"six backend same-key replays return identical receipt")
        check(scalar(gateway,"SELECT balance FROM account WHERE id=1")==990,"backend effect executes once")
        changed=copy.deepcopy(sent["binding"]);changed["args"]["amount"]=11
        rejects(lambda:gateway.execute(sent["key"],changed),"same business key rejects different parameters")
        wrong=copy.deepcopy(receipt);wrong["key"]="other"
        rejects(lambda:runtime.observe(runtime.row(rid),actions[0]["id"],wrong),"receipt key mismatch cannot create observation")
        runtime.observe(runtime.row(rid),actions[0]["id"],receipt)
        check(scalar(runtime,"SELECT count(*) FROM observations WHERE run_id=?",(rid,))==1,"observation commit ACK loss reads back instead of duplicating")

        # Compensation's own key and lost result: unknown cannot imply refund failure.
        undo=fixture_binding(rid+"-undo","refund",10,sent["key"])
        runtime.compensate(runtime.row(rid),actions[0]["id"],rid+"-undo",undo)
        rejects(lambda:runtime.compensate(runtime.row(rid),actions[0]["id"],rid+"-second-undo",undo),"one stable compensation identity per original effect")
        comp=runtime.dispatch(runtime.row(rid),rid+"-undo")
        comp_receipt=gateway.execute(**comp)
        runtime.unknown(runtime.row(rid),rid+"-undo")
        check(runtime.action(rid+"-undo")["status"]=="UNKNOWN","lost compensation reply remains UNKNOWN")
        rejects(lambda:runtime.finish_compensation(runtime.row(rid)),"UNKNOWN compensation cannot end COMPENSATED")
        runtime.observe(runtime.row(rid),rid+"-undo",gateway.query(comp["key"]))
        check(gateway.execute(**comp)==comp_receipt,"compensation retry reuses exact receipt")
        check(scalar(gateway,"SELECT balance FROM account WHERE id=1")==1000,"one compensation restores this fixture balance")
        runtime.finish_compensation(runtime.row(rid))
        check(runtime.row(rid)["status"]=="COMPENSATED" and runtime.row(rid)["cancelled"]==1,"COMPENSATED is not DONE")

        # Cancel after SUCCESS was already observed must start undo without a new observation.
        token,actions=prepared();rid=token["run_id"];a=actions[0]
        sent=runtime.dispatch(token,a["id"]);receipt=gateway.execute(**sent)
        runtime.observe(runtime.row(rid),a["id"],receipt)
        check(runtime.cancel(rid)["status"]=="COMPENSATING","cancel already-confirmed success enters compensation immediately")
        recovery=runtime.claim(rid,"confirmed-recovery",runtime.row(rid)["version"])
        check(recovery is not None,"already-confirmed cancellation remains claimable")
        runtime.observe(recovery,a["id"],receipt)  # duplicate receipt must not be needed to fix state
        undo=fixture_binding(rid+"-confirmed-undo","refund",10,sent["key"])
        runtime.compensate(runtime.row(rid),a["id"],rid+"-confirmed-undo",undo)
        sent_undo=runtime.dispatch(runtime.row(rid),rid+"-confirmed-undo")
        runtime.observe(runtime.row(rid),rid+"-confirmed-undo",gateway.execute(**sent_undo))
        runtime.finish_compensation(runtime.row(rid))
        check(runtime.row(rid)["status"]=="COMPENSATED","already-observed success can finish undo after cancellation")
        check(runtime.cancel(rid)["status"]=="COMPENSATED","repeated cancel preserves COMPENSATED terminal state")
        token,actions=prepared();rid=token["run_id"];a=actions[0]
        sent=runtime.dispatch(token,a["id"])
        runtime.observe(runtime.row(rid),a["id"],{"key":sent["key"],"binding":sent["binding"],"outcome":"FAILED_KNOWN"})
        check(runtime.cancel(rid)["status"]=="CANCELLED","all known failures with no effects cancel without reconciliation")

        # Legacy/migrated state may contain multiple in-flight actions: do not abandon either.
        token,actions=prepared(2);rid=token["run_id"]
        runtime.dispatch(token,actions[0]["id"])
        with transaction(runtime.path) as db:
            db.execute("UPDATE actions SET status='DISPATCHING' WHERE id=?",(actions[1]["id"],))
        runtime.cancel(rid);recovery=runtime.claim(rid,"recover-many",runtime.row(rid)["version"])
        known_failure={"key":actions[0]["key"],"binding":actions[0]["binding"],"outcome":"FAILED_KNOWN"}
        runtime.observe(recovery,actions[0]["id"],known_failure)
        check(runtime.row(rid)["status"]=="CANCEL_REQUESTED","one known failure cannot close another outstanding action")
        check(json.loads(scalar(runtime,"SELECT payload FROM events WHERE run_id=? AND kind='OBSERVED' ORDER BY seq DESC LIMIT 1",(rid,)))["outcome"]=="FAILED_KNOWN",
              "known-failure observation event keeps action outcome distinct from CANCEL_REQUESTED run state")
        next_owner=expired(runtime.row(rid))
        check(next_owner is not None,"remaining legacy obligation remains claimable")
        other_receipt=gateway.execute(actions[1]["key"],actions[1]["binding"])
        runtime.observe(next_owner,actions[1]["id"],other_receipt)
        check(runtime.row(rid)["status"]=="COMPENSATING","second outstanding success remains compensatable")

        # True business transaction rollback and durable escalation/relay acknowledgment.
        with transaction(gateway.path) as db:
            db.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'receipt failure'); END")
        before_balance=scalar(gateway,"SELECT balance FROM account WHERE id=1")
        rejects(lambda:gateway.execute("rollback-effect",fixture_binding("rollback")),"business receipt failure aborts effect transaction")
        check(scalar(gateway,"SELECT balance FROM account WHERE id=1")==before_balance,"business effect rolled back with missing receipt")
        with transaction(gateway.path) as db:db.execute("DROP TRIGGER fail_receipt")
        token,actions=prepared();rid=token["run_id"]
        runtime.dispatch(token,actions[0]["id"]);runtime.unknown(runtime.row(rid),actions[0]["id"])
        case=runtime.escalate(runtime.row(rid),actions[0]["id"])
        check(runtime.row(rid)["status"]=="NEEDS_REVIEW" and scalar(runtime,"SELECT acknowledged FROM outbox WHERE id=?",(case,))==0,"escalation persists obligation before case acknowledgment")
        rejects(lambda:runtime.acknowledge_case(case,"not durable"),"case cursor cannot advance on an untrusted/missing receipt")
        ack=gateway.case(case);check(gateway.case(case)==ack,"case relay duplicate retains stable case receipt")
        runtime.acknowledge_case(case,ack)
        check(scalar(runtime,"SELECT acknowledged FROM outbox WHERE id=?",(case,))==1 and runtime.action(actions[0]["id"])["status"]=="UNKNOWN","case acknowledgment does not erase unknown action")

        # Exact expiry, role revision and maximum budgets are state gates.
        token=run();rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET deadline=unixepoch('now') WHERE run_id=?",(rid,))
        rejects(lambda:runtime.start_step(token,{}),"deadline equality rejects new forward model work")
        token=run();rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET role_rev=role_rev+1 WHERE run_id=?",(rid,))
        rejects(lambda:runtime.start_step(token,{}),"old role revision cannot advance")
        token=run();rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET step_count=12 WHERE run_id=?",(rid,))
        rejects(lambda:runtime.start_step(token,{}),"logical step hard cap is twelve")
        token,actions=prepared();rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET tool_count=8 WHERE run_id=?",(rid,))
        rejects(lambda:runtime.dispatch(token,actions[0]["id"]),"forward tool hard cap is eight")
        token,actions=prepared();rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET role='billing',role_rev=role_rev+1 WHERE run_id=?",(rid,))
        rejects(lambda:runtime.dispatch(runtime.row(rid),actions[0]["id"]),"new role cannot dispatch old Agent-bound action")
        token=run();step=runtime.start_step(token,{"recorded_time":17});rid=token["run_id"]
        with transaction(runtime.path) as db:db.execute("UPDATE runs SET role_rev=role_rev+1 WHERE run_id=?",(rid,))
        rejects(lambda:runtime.start_step(runtime.row(rid),{}),"new role cannot silently reuse old unfinished step input")
        rejects(lambda:runtime.commit_output(runtime.row(rid),1,{"answer":"old-role output"}),"new role cannot commit output under old input revision")

    numbers={"logical_model_per_s":20*5,"tools_per_s":20*3,"physical_model_per_s":20*5*1.1,
        "tpm":110*60*4000,"normal_seconds":5*2+3*.3+8*.02,
        "active":20*(5*2+3*.3+8*.02),"active_with_retry":20*(5*2+3*.3+8*.02+.5*2),
        "parked":20*.3*300,"max_path_seconds":12*2+8*.3+20*.02,
        "max_path_active":20*(12*2+8*.3+20*.02),"delta_writes":20*8,
        "delta_MB_s":20*8*2000/1e6,"delta_GB_day":20*8*2000*86400/1e9,
        "seven_days_two_copies_GB":20*8*2000*86400*7*2/1e9,"max_comp_calls":8*2}
    expected=[100,60,110,26400000,11.06,221.2,241.2,1800,26.8,536,160,.32,27.648,387.072,16]
    for (label,value),want in zip(numbers.items(),expected):check(abs(value-want)<1e-8,"numeric "+label,value)
    report["numbers"]=numbers


try:
    main();report["passed"]=True
except BaseException as error:
    report["passed"]=False;report["failure"]=str(error);report["traceback"]=traceback.format_exc()
finally:
    paths=[ROOT/'chapters/ch34.html',*sorted(Path(__file__).parent.glob('*'))]
    report["hashes"]={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
    report["count"]=len(report["checks"])
    (ROOT/'docs/reviews/ch34-code-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({k:report.get(k) for k in ('passed','count','failure')},ensure_ascii=False))
if not report["passed"]:raise SystemExit(1)
