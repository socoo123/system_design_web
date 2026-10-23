"""Independent probes for review findings, separate from author test models."""
from pathlib import Path
import hashlib
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE old_task(status TEXT, lease_until INTEGER, last_woken_at INTEGER)')
db.execute("INSERT INTO old_task VALUES ('leased', 30, NULL)")
predicate = "status='leased' AND lease_until <= 61 AND last_woken_at < 61-30"
assert db.execute(f'SELECT COUNT(*) FROM old_task WHERE {predicate}').fetchone()[0] == 0

# Adapt the time field to deterministic integer seconds; no PostgreSQL claim here.
db.execute('CREATE TABLE fixed_task(status TEXT, lease_until INTEGER, '
           'last_woken_at INTEGER NOT NULL DEFAULT 0)')
db.execute("INSERT INTO fixed_task(status, lease_until) VALUES ('leased', 30)")
assert db.execute(f'SELECT COUNT(*) FROM fixed_task WHERE {predicate}').fetchone()[0] == 1
try:
    db.execute("INSERT INTO fixed_task VALUES ('leased',30,NULL)")
except sqlite3.IntegrityError:
    null_rejected = True
else:
    raise AssertionError('NULL must violate the corrected data contract')

model = ROOT / 'examples/ch10/model.pseudo'
accept = ROOT / 'examples/ch10/accept.pseudo'
assert 'last_woken_at NOT NULL DEFAULT DB_NOW()' in model.read_text()
assert 'last_woken_at=DB_NOW()' in accept.read_text()
report = {
    'passed': True,
    'checks': [
        'SQL NULL comparison reproduces the missed first expired lease',
        'A non-null initialization makes the same due predicate select that lease',
        'An explicit NULL violates the corrected schema contract',
        'The teaching model and accept path both specify database-time initialization',
    ],
    'source_sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in (model, accept)},
    'limits': 'SQLite verifies the NULL predicate and adapted constraints only; '
              'it does not execute PostgreSQL SKIP LOCKED or prove queue recovery under faults.'
}
(ROOT / 'docs/reviews/ch10-ch11-ch12-root-probes.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': True, 'checks': len(report['checks'])}))
