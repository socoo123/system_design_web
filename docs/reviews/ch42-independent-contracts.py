"""Documented-contract inspection and arithmetic, not a deployed retry/drain adapter."""
from pathlib import Path
from decimal import Decimal
import hashlib
import json

ROOT=Path(__file__).resolve().parents[2]
examples=ROOT/'examples/ch42'
files=[ROOT/'chapters/ch42.html',*sorted(examples.rglob('*'))]
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in files if p.is_file() and '__pycache__' not in str(p)}
initial=json.loads((ROOT/'docs/reviews/ch42-independent-before-hashes.json').read_text())
changed={name:{'initial':initial.get(name),'final':value}
         for name,value in hashes.items() if initial.get(name)!=value}
assert set(changed)=={'chapters/ch42.html','examples/ch42/retry.pseudo'}
retry=(examples/'retry.pseudo').read_text()
assert 'remaining = original_deadline - now' in retry
assert 'if remaining < 250 ms + 50 ms: STOP' in retry
assert 'if original_deadline - now < 250 ms + 50 ms:' in retry
assert 'release the unstarted permit; STOP' in retry
assert 'start attempt 2 with at most 250 ms; keep 50 ms for return' in retry
drain=(examples/'drain.pseudo').read_text()
assert drain.index('if already draining: return existing drain task') < drain.index('fix monotonic drain cutoff once')
assert 'under the same local lock as HTTP admission' in drain
assert 'Endpoint propagation and TERM run in parallel' in drain
assert 'unfinished effects/unknown commits replay with original keys' in drain
assert 'commit only safe fetched-record prefixes still owned' in drain

report={
 'sourceHashes':hashes,'sourceChangesDuringReview':changed,'passed':True,'openFindings':[],
 'kind':'Pseudocode contract inspection and independently recomputed traces; not integration execution',
 'retryTraces':[
  {'case':'Normal wake','deadlineMs':800,'wakeMs':450,'remainingMs':800-450,
   'prestartOverheadMs':15,'beforeStartRemainingMs':800-465,
   'attemptPlusReturnMs':250+50,'finishWithReturnMs':465+250+50,'outcome':'May start; finishes budget at 765 <= 800'},
  {'case':'Late wake but not yet expired','deadlineMs':800,'wakeMs':550,'remainingMs':800-550,
   'requiredMs':250+50,'outcome':'STOP at wake before taking token/permit; 250 < 300'},
  {'case':'Budget consumed between wake and dispatch','deadlineMs':800,'wakeMs':500,'remainingMs':800-500,
   'prestartOverheadMs':1,'beforeStartRemainingMs':800-501,'requiredMs':250+50,
   'outcome':'Second check STOP; release unstarted permit; consumed extra-attempt token is conservatively retained'},
  {'case':'Deadline passed','deadlineMs':800,'wakeMs':830,'remainingMs':800-830,
   'outcome':'STOP; positive retry traffic budget cannot revive an expired call'}],
 'drainInspection':[
  'A preStop-triggered local drain fixes cutoff once under the same lock as HTTP admission. A later TERM returns that task rather than extending the cutoff.',
  'Endpoint updates are concurrent and may propagate late. Local admission is already closed; readiness alone does not stop queue fetch/dispatch.',
  'Before cutoff, a durable Effect DB receipt may mark a fetched record complete. Commit only its completed prefix while still assigned; revoke invalidates generation.',
  'At cutoff, no receipt or an unknown source commit does not become done. Close uses the reserved remaining budget; a new owner replays original scope/event keys.',
  'SIGKILL and unreachable nodes can leave unknown or continuing side effects. Replacement is not rollback; stable business uniqueness/fencing remains required.'
 ],
 'decimalChecks':{'retryCeiling':str(Decimal(100)*(Decimal(1)+Decimal('0.10'))),
                  'rawRetentionTB':str(Decimal(1200)*86400*1000*7*3/Decimal(10)**12)},
 'limits':['No actual retry scheduler/admission-controller integration or Kubernetes cluster experiment',
           'Kafka poll/commit/leader-epoch behavior checked against official contracts; Java class is not a Kafka client']
}
assert report['retryTraces'][0]['finishWithReturnMs']<=800
assert report['retryTraces'][1]['remainingMs']<report['retryTraces'][1]['requiredMs']
assert report['retryTraces'][2]['beforeStartRemainingMs']<report['retryTraces'][2]['requiredMs']
(ROOT/'docs/reviews/ch42-independent-contract-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'passed':True,'changedSources':list(changed),'retryTraces':len(report['retryTraces']),'decimalChecks':report['decimalChecks']},ensure_ascii=False))
