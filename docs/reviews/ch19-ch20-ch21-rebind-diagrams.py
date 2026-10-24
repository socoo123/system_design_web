"""Reuse diagram evidence only when the rendered source, figures, head and shared assets prove identity."""
from pathlib import Path
import hashlib
import json
import os
import re
root=Path(__file__).resolve().parents[2]
sha=lambda data:hashlib.sha256(data).hexdigest()
p=root/'docs/reviews/ch19-ch20-ch21-geometry-after.json'
d=json.loads(p.read_text())
baseline=json.loads((root/'docs/reviews/ch19-ch20-ch21-baseline.json').read_text())
for name,expected in baseline['files'].items():
 if name.startswith(('assets/css/','assets/js/')):
  assert sha((root/name).read_bytes())==expected,('shared asset changed',name)
for ch in os.environ.get('CHAPTERS','ch19,ch20,ch21').split(','):
 record=d['chapters'][ch]
 rendered=root/f'docs/reviews/ch19-ch20-ch21-rendered-snapshots/{ch}.html'
 old=rendered.read_bytes();new=(root/f'chapters/{ch}.html').read_bytes()
 old_sha=sha(old);new_sha=sha(new)
 assert old_sha==record.get('renderedHtmlSha256',record['sha256']),('wrong rendered snapshot',ch)
 if old==new:continue
 old_text=old.decode();new_text=new.decode()
 figures=lambda text:re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>',text)
 before=figures(old_text);after=figures(new_text)
 assert len(before)==6 and before==after,('diagram or caption changed: rerender required',ch)
 for pattern in [r'<head>[\s\S]*?</head>',r'<style\b[\s\S]*?</style>',r'<script\b[\s\S]*?</script>']:
  assert re.findall(pattern,old_text)==re.findall(pattern,new_text),('styles/scripts changed',ch)
 record.update(sha256=new_sha,renderedHtmlSha256=old_sha,reusedAfterExactFigureComparison=True,
               renderedSource=str(rendered.relative_to(root)),figureHashes=[sha(x.encode()) for x in before])
p.write_text(json.dumps(d,indent=2)+'\n')
print('Diagram binding verified by exact figures, rendered source and shared assets')
