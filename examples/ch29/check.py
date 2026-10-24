from pathlib import Path
import subprocess, tempfile, os, json, hashlib, sys

root = Path(__file__).resolve().parents[2]
src = root / 'examples/ch29'
bin_dir = Path(os.environ.get('CH29_JAVA_BIN', '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin'))
out = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'docs/reviews/ch29-code-results.json'
result = {'kind': 'Java17 CPU state model; no GPU or distributed experiment', 'source_sha256': {
    p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(src.iterdir()) if p.is_file()
}}
try:
    result['java_version'] = subprocess.check_output([str(bin_dir/'java'), '-version'], stderr=subprocess.STDOUT, text=True).strip()
    with tempfile.TemporaryDirectory(prefix='ch29-java-') as target:
        subprocess.run([str(bin_dir/'javac'), '--release', '17', '-d', target, str(src/'KvLedger.java'), str(src/'KvLedgerCheck.java')], check=True, capture_output=True, text=True)
        raw = subprocess.check_output([str(bin_dir/'java'), '-cp', target, 'KvLedgerCheck'], text=True)
        result['model'] = json.loads(raw)
    result['passed'] = result['model']['passed']
except Exception as error:
    result['passed'] = False
    result['error'] = str(error)
    raise
finally:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['passed', 'model', 'error'] if key in result}))
