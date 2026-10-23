"""Reviewer derivations and contract traces, not deployed HTTP/Redis adapters."""
from fractions import Fraction
from pathlib import Path
import hashlib,json,math,random

checks=[]
def ok(condition,label):
    assert condition,label
    checks.append(label)

numbers={
 'gateways':math.ceil(10000/4000)+1,
 'n_minus_1_capacity':3*4000,
 'normal_original_utilization':10000/(4*4000),
 'n_minus_1_original_utilization':10000/(3*4000),
 'n_minus_1_steady_retry_utilization':10500/(3*4000),
 'aggregate_body_bytes_per_direction':10000*(2000+4000),
 'aggregate_body_bits_per_direction':10000*(2000+4000)*8,
 'normal_bits_per_direction_per_instance':10000*(2000+4000)*8/4,
 'n_minus_1_bits_per_direction_per_instance':10000*(2000+4000)*8/3,
 'signature_cores':10000*.0002,
 'nominal_two_copy_bucket_bytes':1000000*100*2,
 'limiter_inflight_at_2ms':10000*.002,
 'same_user_wrong_four_buckets_rate':4*20,
 'same_user_wrong_four_buckets_burst':4*40,
 'BFF_serial_ms':80+40+120+20,
 'BFF_parallel_ms':max(80,40,120)+20,
 'uniform_cohort_v2_qps':10000*.1,
 'two_attempt_path_ms':20+80+20+80,
 'steady_retry_earning_per_second':10000/20,
 'fixed_pool_credit_storage':4*125,
 'slow_upstream_work_at_240ms':10000*.24,
 'normal_slow_streams_per_instance':10000*.24/4,
 'n_minus_1_slow_streams_per_instance':10000*.24/3,
 'full_request_work_at_300ms':10000*.3,
 'log_bytes_per_second':10000*300,
 'one_hour_log_bytes':10000*300*3600,
}
ok(numbers['gateways']==4 and numbers['n_minus_1_capacity']==12000,'four gateways survive one instance loss under 4k usable assumption')
ok(numbers['n_minus_1_steady_retry_utilization']==.875,'retry-inclusive steady N-1 utilization is 87.5%, initial 83.3% explicitly excludes retries')
ok(numbers['aggregate_body_bits_per_direction']==480000000,'both ingress sides sum to 480 Mb/s per direction')
ok(numbers['normal_bits_per_direction_per_instance']==120000000 and numbers['n_minus_1_bits_per_direction_per_instance']==160000000,'per-instance normal/N-1 body bandwidth')
ok(numbers['signature_cores']==2 and numbers['nominal_two_copy_bucket_bytes']==200000000,'CPU and nominal state sizing')
ok(numbers['BFF_serial_ms']==260 and numbers['BFF_parallel_ms']==140,'single-run BFF critical-path arithmetic, not composed p99')
ok(numbers['two_attempt_path_ms']==200 and numbers['steady_retry_earning_per_second']==500,'policy, two tries and backoff share fixed expiry; retry earning is not a rate cap')
ok(numbers['n_minus_1_slow_streams_per_instance']==800 and numbers['full_request_work_at_300ms']==3000,'conditional all-slow in-flight estimates, not arrival burst guarantees')
ok(numbers['one_hour_log_bytes']==10800000000,'10.8 GB peak hour, not daily volume')

class Bucket:
    def __init__(self,now):self.last=now;self.tokens=Fraction(0)
    def take(self,now):
        self.tokens=min(Fraction(100),self.tokens+Fraction(max(0,now-self.last),10))
        self.last=max(self.last,now)
        if self.tokens<1:return False
        self.tokens-=1;return True
rng=random.Random(170023);owners=[Bucket(0) for _ in range(4)];admitted=[]
for now in range(0,10001,5):
    for slot in range(4):
        if rng.randrange(250)==0:owners[slot]=Bucket(now) # old owner stopped first
        for _ in range(rng.randrange(1,12)):
            if owners[slot].take(now):admitted.append(now)
for _ in range(500):
    left=rng.randrange(10000);right=rng.randrange(left+1,10001)
    count=sum(left<=at<=right for at in admitted)
    ok(count<=Fraction(400*(right-left),1000)+400,'exact-rational fixed-owner interval bound')
restart=Bucket(10**9)
ok(not restart.take(10**9),'restart last equals actual local origin and grants no initial burst')
ok(8*100>400 and 3*400>Fraction(400,100)+400,'negative witnesses: overlap and repeated full resets violate the fixed-pool bound')

# These are paper/adapter traces. The application intentionally has no live JWT,
# HTTP transport, mTLS, Redis, policy publisher or deployment controller here.
traces=[
 {'case':'normal','steps':['pin v42, validate trusted issuer/audience/scopes','derive t1/alice route context, ignore forged inbound headers','Redis definite ALLOW, check fixed local expiry','one stream + breaker ticket, Orders ownership check, hop-by-hop response']},
 {'case':'unknown-after-debit','steps':['Redis decrements at +2ms','waiter chooses UNKNOWN at +5ms','risky route sends 503 without refund or forward','late ALLOW at +10ms must not change terminal decision']},
 {'case':'safe-unknown','steps':['Redis result unknown','policy permits public safe read and controller confirms fixed owner','one emergency token selects one degraded forward','late Redis ALLOW/DENY does not create another dispatch']},
 {'case':'proxy-replay','steps':['GET/HEAD only; body replayable; no client response begun','one prior local stream must actually terminate','backoff then recheck fixed expiry and cancellation','consume earned credit, acquire slot, breaker, recheck before dispatch','POST business key never bypasses this gateway retry rule']},
 {'case':'context-publication','steps':['request captures v42 once','publisher installs v43 while validation/quota is pending','current request keeps v42 audience/scopes/route/cohort and backend version','a subsequent request gets v43; services still check object ownership']},
]
result={'kind':'reviewer arithmetic, exact-rational bucket model and manual adapter traces',
 'htmlSha256':hashlib.sha256(Path('chapters/ch17.html').read_bytes()).hexdigest(),
 'checks':len(checks),'numbers':numbers,'traces':traces,'passed':True,
 'limitations':['No cryptographic JWT/mTLS/HTTP parser/Redis call or real deployment is exercised.',
 '500 interval checks are one model experiment, not 500 independent infrastructure guarantees.',
 'In-flight estimates condition on stated rate and all-slow duration; they do not prove capacity.']}
Path('docs/reviews/ch17-independent-contract-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(f'PASS {len(checks)} derivation/model assertions; five separately labeled manual traces')
