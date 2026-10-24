"""Focused source/inventory checks plus a real local SQLite application trace."""
from pathlib import Path
from decimal import Decimal
import hashlib
import html
import json
import re
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'chapters/ch40.html').read_text()
before = (ROOT / 'docs/reviews/ch40-ch41-ch42-baseline/ch40.html').read_text()
checks = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def inventory(document):
    decks = []
    for figure in re.findall(r'<figure class="deck">(.*?)</figure>', document, re.S):
        frames = []
        for svg in re.findall(r'<svg\b.*?</svg>', figure, re.S):
            frames.append({'id': re.search(r'<title id="([^"]+)"', svg)[1],
                           'ids': re.findall(r'\bid="([^"]+)"', svg),
                           'sha256': hashlib.sha256(svg.encode()).hexdigest()})
        decks.append(frames)
    return decks


old, new = inventory(before), inventory(source)
check([len(d) for d in new] == [5, 5, 5, 6, 5, 5, 5], '7 decks / 36 original frame positions')
check([[f['ids'] for f in d] for d in old] == [[f['ids'] for f in d] for d in new],
      'all 72 original title/description IDs and order retained')
changes = [b['id'] for da, db in zip(old, new) for a, b in zip(da, db) if a['sha256'] != b['sha256']]
check(changes == ['d4s2t', 'd4s3t', 'd4s4t', 'd4s5t', 'd4s6t', 'd7s4t', 'd7s5t'],
      'only planned D4 return label and D7 CID frames changed')
java = (ROOT / 'examples/ch40/ProtocolContracts.java').read_text()
excerpts = re.findall(r'<pre\b[^>]*data-source="ProtocolContracts.java:([^"]+)"[^>]*><code>(.*?)</code></pre>', source, re.S)
check(len(excerpts) == 3, 'three shared-language Java 17 excerpts')
for name, text in excerpts:
    # Capture only spaces, never preceding blank lines.
    match = re.search(r'^( *)// BEGIN ' + name + r'\n(.*?)^\1// END ' + name, java, re.M | re.S)
    value = re.sub(r'^' + match[1], '', match[2], flags=re.M)
    check(html.unescape(text) == value, f'exact source region: {name}')

# The transaction is real SQLite, not a mocked atomic() helper. It covers only
# a single client's projection and applied cursor in the same local database.
trace = []
with tempfile.TemporaryDirectory(prefix='ch40-client-') as directory:
    db = sqlite3.connect(str(Path(directory) / 'client.sqlite'), isolation_level=None)
    db.executescript('''
        CREATE TABLE projection (scope TEXT PRIMARY KEY, value INTEGER NOT NULL);
        CREATE TABLE cursor (scope TEXT PRIMARY KEY, epoch TEXT NOT NULL,
                             seq INTEGER NOT NULL, generation INTEGER NOT NULL);
        INSERT INTO projection VALUES ('orders:user7',100);
        INSERT INTO cursor VALUES ('orders:user7','E',42,1);
    ''')

    def state():
        return db.execute('SELECT value,epoch,seq,generation FROM projection JOIN cursor USING(scope)').fetchone()

    def apply(seq, generation, crash=False):
        db.execute('BEGIN IMMEDIATE')
        try:
            epoch, applied, active = db.execute('SELECT epoch,seq,generation FROM cursor').fetchone()
            if generation != active:
                db.execute('ROLLBACK')
                return 'old-handler'
            if seq <= applied:
                db.execute('ROLLBACK')
                return 'duplicate'
            if seq != applied + 1:
                db.execute('ROLLBACK')
                return 'gap'
            db.execute('UPDATE projection SET value=value+7')
            if crash:
                raise OSError('simulated failure after projection write, before cursor write')
            db.execute('UPDATE cursor SET seq=?', (seq,))
            db.execute('COMMIT')
            return 'applied'
        except BaseException:
            db.execute('ROLLBACK')
            raise

    trace.append({'phase': 'before', 'state': state(), 'browserLastEventId': 'E:43'})
    try:
        apply(43, 1, crash=True)
    except OSError:
        pass
    check(state() == (100, 'E', 42, 1), 'handler failure rolls back projection and applied cursor together')
    trace.append({'phase': 'after rollback', 'state': state(), 'resumeAfter': 'E:42'})
    db.execute('UPDATE cursor SET generation=2')  # Recreate only after old handler has settled.
    check(apply(43, 1) == 'old-handler', 'old handler generation cannot apply after replacement')
    check(apply(43, 2) == 'applied' and state() == (107, 'E', 43, 2), 'replayed event commits projection and cursor')
    check(apply(43, 2) == 'duplicate' and state()[0] == 107, 'duplicate replay does not increment projection twice')
    check(apply(45, 2) == 'gap' and state()[2] == 43, 'noncontiguous event cannot advance applied cursor')
    trace.append({'phase': 'after replay', 'state': state()})
    db.close()

calculations = {
    'originPerSecond': Decimal(2000) * (1 - Decimal('0.80')),
    'downstreamMs': Decimal(300) - 40 - 20,
    'wsBufferBytes': Decimal(20000) * 65536,
    'wsBufferGiB': Decimal(20000) * 65536 / (2 ** 30),
    'retainedEvents': Decimal(100) * 300,
    'retainedBytes': Decimal(100) * 300 * 200,
    'firstEventMs': Decimal(40) + 20 + 500 + 40,
    'remainingSeconds': Decimal(399) / 50,
    'lastEventSeconds': Decimal('0.6') + Decimal(399) / 50,
    'generationBufferMiB': Decimal(200) * 65536 / (2 ** 20),
}
check(list(calculations.values()) == [Decimal(x) for x in
      ['400', '240', '1310720000', '1.220703125', '30000', '6000000', '600', '7.98', '8.58', '12.5']],
      'primary arithmetic and decimal/binary units recomputed exactly')
result = {'chapterSha256': hashlib.sha256(source.encode()).hexdigest(), 'checks': checks,
          'passed': True, 'changedFrames': changes, 'localSQLiteTrace': trace,
          'calculations': {k: str(v) for k, v in calculations.items()},
          'limitations': ['SQLite trace is one local client transaction, not external effects or a distributed log.',
                          'No real EventSource server, TLS proxy, message durability, model or QUIC fault test.']}
(ROOT / 'docs/reviews/ch40-animation-before.json').write_text(json.dumps(old, indent=2) + '\n')
(ROOT / 'docs/reviews/ch40-animation-after.json').write_text(json.dumps(new, indent=2) + '\n')
(ROOT / 'docs/reviews/ch40-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': True, 'checks': len(checks), 'changedFrames': changes}))
