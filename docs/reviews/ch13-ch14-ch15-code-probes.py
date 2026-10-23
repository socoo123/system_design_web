"""Independent boundary counterexamples, not an implementation of the services."""
from pathlib import Path
import hashlib
import json
import sqlite3
import tempfile

root = Path(__file__).resolve().parents[2]
checks = []
# Actual SQLite UPSERT predicate: retaining a logical tombstone retains the floor.
con = sqlite3.connect(':memory:')
con.execute('CREATE TABLE state(id TEXT PRIMARY KEY, version INTEGER, deleted INTEGER, body TEXT)')
upsert = '''INSERT INTO state VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE
            SET version=excluded.version,deleted=excluded.deleted,body=excluded.body
            WHERE state.version < excluded.version'''
con.execute(upsert, ('d9', 13, 1, ''))
late = con.execute(upsert, ('d9', 12, 0, 'old')).rowcount
assert late == 0 and con.execute('SELECT version,deleted,body FROM state').fetchone() == (13, 1, '')
checks.append('Persistent logical tombstone v13 rejects late full update v12 with an actual SQL version predicate.')
con.execute('DELETE FROM state')
resurrected = con.execute(upsert, ('d9', 12, 0, 'old')).rowcount
assert resurrected == 1
checks.append('Removing retained state lets the same v12 recreate the row; a version predicate alone has no forgotten floor.')
# Compute bytes, rather than comparing explanatory strings. Multipart SHA256 is
# composite; the suffix and encoding at an API boundary are additional details.
parts = [b'first input part\x00' * 17, b'second part\xff' * 13]
full = hashlib.sha256(b''.join(parts)).hexdigest()
composite = hashlib.sha256(b''.join(hashlib.sha256(p).digest() for p in parts)).hexdigest()
assert full != composite
checks.append('For concrete two-part bytes, full SHA256 differs from SHA256 of concatenated part digests.')
# A real SQL conditional update demonstrates the parent-version decision only.
# SQLite writer serialization does not establish PostgreSQL row-lock behavior.
con.execute('CREATE TABLE file(id TEXT PRIMARY KEY, head INTEGER)')
con.execute("INSERT INTO file VALUES('f7',7)")
a = con.execute("UPDATE file SET head=8 WHERE id='f7' AND head=7").rowcount
b = con.execute("UPDATE file SET head=8 WHERE id='f7' AND head=7").rowcount
assert (a, b) == (1, 0)
checks.append('Two same-base updates after serialization have one winner and one failed condition; the second cannot silently overwrite.')
# Actual independent physical names preserve newer bytes under an old delete.
with tempfile.TemporaryDirectory(prefix='sd-wave4-identity-') as directory:
    folder = Path(directory)
    reused = folder / 'reused-key'
    reused.write_bytes(b'new bytes')
    reused.unlink()  # a delayed old delete by a reused identity
    assert not reused.exists()
    old, new = folder / 'generation-1', folder / 'generation-2'
    old.write_bytes(b'old bytes'); new.write_bytes(b'new bytes')
    old.unlink()
    assert new.read_bytes() == b'new bytes'
checks.append('Deleting an old physical generation leaves the distinct new physical generation intact; reusing a name does not.')
sources = [root / f'chapters/{ch}.html' for ch in ('ch13','ch14','ch15')]
report = {
    'passed': True,
    'checks': checks,
    'hashes': {'fullSha256': full, 'compositeSha256BeforeApiEncoding': composite},
    'sourceSha256': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
    'limits': 'These are SQL predicate, checksum-byte and physical-identity counterexamples. They do not execute Elasticsearch, PostgreSQL, S3, object GC, leases or distributed fault handling. Service correctness also depends on the documented adapters, permissions and serialization contracts.'
}
(root / 'docs/reviews/ch13-ch14-ch15-root-probes.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed':True,'checks':len(checks)}))
