from pathlib import Path
import subprocess, tempfile, hashlib, json
root=Path(__file__).resolve().parents[2]
java_home=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
results=[]
def run(args):
    p=subprocess.run([str(a) for a in args],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    results.append({'command':[str(a) for a in args],'exitCode':p.returncode,'output':p.stdout})
    print(p.stdout,end='')
    if p.returncode: raise RuntimeError('command failed')
try:
    run(['python3','examples/ch17/sync.py','--check'])
    run(['python3','examples/ch17/verify.py'])
    with tempfile.TemporaryDirectory(prefix='ch17-java-') as build:
        run([java_home/'javac','-d',build,'examples/ch17/GatewayPolicy.java','examples/ch17/GatewayPolicyTest.java'])
        run([java_home/'java','-cp',build,'GatewayPolicyTest'])
    run(['node','tools/audit-chapter.mjs','ch17'])
    run(['node','tools/check.mjs'])
    for script in ['docs/reviews/ch17-frames.mjs','docs/reviews/ch17-browser.mjs','docs/reviews/ch17-narrow.mjs']:
        run(['node','--check',script])
    run(['git','diff','--check','--','chapters/ch17.html','examples/ch17','docs/reviews/ch17.md','docs/reviews/ch17-frames.mjs','docs/reviews/ch17-browser.mjs','docs/reviews/ch17-narrow.mjs','docs/reviews/ch17-sources.md'])
finally:
    files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'examples/ch17').glob('*')) if p.is_file()}
    files['chapters/ch17.html']=hashlib.sha256((root/'chapters/ch17.html').read_bytes()).hexdigest()
    (root/'docs/reviews/ch17-check-results.json').write_text(json.dumps({'passed':all(x['exitCode']==0 for x in results),'files':files,'commands':results},ensure_ascii=False,indent=2)+'\n')
