"""Independent dimensional checks of the three teaching workloads; no benchmark claims."""
from pathlib import Path
from datetime import datetime, timezone
from math import ceil, isclose
import hashlib
import json

root = Path(__file__).resolve().parents[2]
checks = []


def check(label, actual, expected, unit, condition=None):
    ok = condition if condition is not None else isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)
    checks.append(dict(label=label, actual=actual, expected=expected, unit=unit, passed=bool(ok)))
    assert ok, label


# Ch28: a reconnect response contains ten namespace bundles. Counting responses
# separately from bundles prevents tenfold origin-QPS and byte-rate mistakes.
processes, subscriptions, keys, bytes_per_key = 10_000, 10, 10, 4_000
bundle = keys * bytes_per_key
response = subscriptions * bundle
check('ch28 local business reads', processes * 1_000, 10_000_000, 'reads/s')
check('ch28 one namespace bundle', bundle, 40_000, 'B')
check('ch28 ten-bundle reconnect response', response, 400_000, 'B')
check('ch28 reconnect response rate', processes / 30, 1_000 / 3, 'batch responses/s')
check('ch28 reconnect namespace rate', processes * subscriptions / 30, 10_000 / 3, 'bundles/s')
check('ch28 whole reconnect bytes', processes * response, 4_000_000_000, 'B')
check('ch28 reconnect average bytes', processes * response / 30, 400_000_000 / 3, 'B/s')
check('ch28 reconnect average network bits', processes * response / 30 * 8 / 1e9, 16 / 15, 'Gb/s')
check('ch28 500 batch/s admission bandwidth', 500 * response, 200_000_000, 'B/s before overhead')
check('ch28 idle watch renewals', processes / 60, 500 / 3, 'requests/s')
check('ch28 short-poll alternative', processes * subscriptions / 5, 20_000, 'requests/s')
check('ch28 short-poll versus idle renewals', (processes * subscriptions / 5) / (processes / 60), 120, 'ratio')
check('ch28 planned connections per node', 5_000 * .7, 3_500, 'connections')
check('ch28 minimum active nodes', ceil(processes / (5_000 * .7)), 3, 'nodes')
check('ch28 four nodes after one failure', 3 * 5_000 * .7, 10_500, 'connections')
check('ch28 connection memory budget', processes * 64_000, 640_000_000, 'B before TLS/runtime')
check('ch28 content history copies', 200 * keys * bytes_per_key * 30 * 3, 720_000_000, 'B, content only')
check('ch28 ordinary reconciliation', processes / 300, 100 / 3, 'requests/s')
check('ch28 critical confirmations', 1_000 / 10, 100, 'authority reads/s')
check('ch28 critical all-process alternative', processes / 10, 1_000, 'authority reads/s')
check('ch28 one full-coverage publication', bundle * processes, 400_000_000, 'B')
check('ch28 ten-second propagation payload', bundle * processes / 10, 40_000_000, 'B/s')
check('ch28 fifty full-coverage publications', bundle * processes * 50 * 8 / 1e9, 160, 'Gb/s before overhead')
check('ch28 rollout expected cohort only', processes * .05, 500, 'expected processes, not a fixed count')
check('ch28 number of fan-out batches', ceil(processes / 500), 20, 'batches')
check('ch28 conservative twenty-slot fan-out window', ceil(processes / 500) * .25, 5, 's; first-at-zero last-start is 4.75s')

# Ch29: full-attention, unsharded KV. Bytes are independent of any named GPU.
kv_token = 2 * 32 * 8 * 128 * 2
page = 16 * kv_token
cap_tokens = 2_048 + 512
credits = ceil(cap_tokens / 16)
request_bytes = credits * page
pool = 40 * 2**30
check('ch29 KV bytes per token', kv_token, 128 * 2**10, 'B/token')
check('ch29 unsharded weight bytes', 8e9 * 2, 16e9, 'B, weights only')
check('ch29 page size', page, 2 * 2**20, 'B/page')
check('ch29 full-cap request credits', credits, 160, 'pages')
check('ch29 full-cap request bytes', request_bytes / 2**20, 320, 'MiB')
check('ch29 total pool pages', pool // page, 20_480, 'pages')
check('ch29 full-credit capacity', pool // request_bytes, 128, 'active reservations, not req/s')
check('ch29 129th request deficit', (129 * request_bytes - pool) / 2**20, 320, 'MiB')
check('ch29 long-context capacity', pool // (ceil((8_192 + 512) / 16) * page), 37, 'reservations')
check('ch29 Little law average active', 10 * 6, 60, 'requests, conditional stable resident interval')
check('ch29 Little law average credits', 10 * 6 * request_bytes / 2**30, 18.75, 'GiB conditional')
check('ch29 peak conditional residency', 30 * 6 * request_bytes / 2**30, 56.25, 'GiB, infeasible in a 40GiB pool')
check('ch29 planned per-replica goodput', 12 * .7, 8.4, 'conditional req/s')
check('ch29 normal replicas', ceil(30 / (12 * .7)), 4, 'replicas')
check('ch29 N+1 replicas', ceil(30 / (12 * .7)) + 1, 5, 'replicas')
check('ch29 surviving planned goodput', 4 * 12 * .7, 33.6, 'conditional req/s')
check('ch29 peak prompt demand', 30 * 2_048, 61_440, 'input token/s if accepted')
check('ch29 peak mean output demand', 30 * 256, 7_680, 'output token/s if completed')
check('ch29 256 outputs have 255 intervals', (256 - 1) * .02, 5.1, 's at fixed 20ms')
check('ch29 descriptive queue workload', 100 / 12, 25 / 3, 's at conditional 12/s, not a percentile')
check('ch29 per-128-stream buffers', 128 * 64 * 2**10 / 2**20, 8, 'MiB')
prompt_kv = 2_048 * kv_token
check('ch29 prompt transfer size', prompt_kv / 2**20, 256, 'MiB')
check('ch29 pure transfer lower-bound example', prompt_kv / 10e9 * 1_000, 26.8435456, 'ms at effective 10GB/s')
check('ch29 thirty transfers payload rate', 30 * prompt_kv / 1e9, 8.05306368, 'GB/s')
check('ch29 payload bandwidth fraction', 30 * prompt_kv / 10e9, .805306368, 'fraction before overhead/retries')
check('ch29 non-aligned reservation rounds up', ceil((2_049 + 512) / 16), 161, 'pages')

# Ch30: per-document tail handling, not concatenating the corpus before ceil.
def chunks(length):
    if length <= 0:
        return []
    return [(start, min(start + 512, length)) for start in range(0, max(1, length - 64), 448)]


spans = chunks(2_000)
check('ch30 document chunks', len(spans), 5, 'chunks/document')
check('ch30 last chunk length', spans[-1][1] - spans[-1][0], 208, 'token')
embedded = sum(end - start for start, end in spans)
check('ch30 overlap fraction', 64 / 512, .125, 'fraction of full block')
check('ch30 embedded token count', embedded, 2_256, 'token/document')
check('ch30 corpus expansion', (embedded - 2_000) / 2_000, .128, 'fraction of source tokens')
count = 100_000 * len(spans)
vector = count * 768 * 4
check('ch30 corpus chunks', count, 500_000, 'vectors')
check('ch30 raw vector bytes', vector, 1_536_000_000, 'B, one pool one copy')
check('ch30 double pool double copy', vector * 2 * 2, 6_144_000_000, 'B before ANN/BM25/metadata')
check('ch30 changed documents per day', 100_000 * .01, 1_000, 'documents/day')
check('ch30 changed chunks per day', 100_000 * .01 * 5, 5_000, 'new chunks/day')
check('ch30 changed embeddings per day', 100_000 * .01 * embedded, 2_256_000, 'token/day')
check('ch30 bounded rerank demand', 40 * 80, 3_200, 'pairs/s')
check('ch30 full-corpus rerank alternative', 40 * count, 20_000_000, 'pairs/s')
check('ch30 full-corpus rerank amplification', count / 80, 6_250, 'ratio')
check('ch30 RRF A ranks 1 and 10', 1 / 61 + 1 / 70, .030679156908665104, 'RRF score')
check('ch30 RRF B ranks 5 and 5', 2 / 65, .03076923076923077, 'RRF score')
check('ch30 B ranks ahead of A', 2 / 65, 1 / 61 + 1 / 70, 'ordering', 2 / 65 > 1 / 61 + 1 / 70)
check('ch30 input budget', 4_096 + 1_024, 5_120, 'token')
check('ch30 context budget', 4_096 + 1_024 + 512, 5_632, 'token')
check('ch30 peak full input demand', 40 * 5_120, 204_800, 'input token/s')
check('ch30 peak full output demand', 40 * 512, 20_480, 'output token/s')
check('ch30 parallel retrieval path budget', 30 + 60 + max(80, 100) + 40 + 250 + 20, 500, 'ms, one conditional path')
check('ch30 remaining retrieval budget', 700 - 500, 200, 'ms')

result = dict(at=datetime.now(timezone.utc).isoformat(), passed=all(c['passed'] for c in checks),
              checks=checks,
              sourceFiles={f'chapters/{ch}.html': hashlib.sha256((root / f'chapters/{ch}.html').read_bytes()).hexdigest()
                           for ch in ['ch28', 'ch29', 'ch30']},
              limitations='Arithmetic and units only. Conditional workload estimates do not establish SLOs, GPU capacity, or storage durability.')
(root / 'docs/reviews/ch28-ch29-ch30-numeric-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks))))
