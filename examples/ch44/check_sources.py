#!/usr/bin/env python3
"""Check every displayed snippet against its maintained source, plus inventory."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re

ROOT=Path(__file__).resolve().parents[2]
class Blocks(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True); self.current=None; self.blocks=[]
    def handle_starttag(self,tag,attrs):
        if tag=='pre': self.current=[dict(attrs),'']
    def handle_endtag(self,tag):
        if tag=='pre': self.blocks.append(self.current); self.current=None
    def handle_data(self,data):
        if self.current: self.current[1]+=data

page=(ROOT/'chapters/ch44.html').read_text(); p=Blocks();p.feed(page)
checks=[]
for attrs,text in p.blocks:
    file=attrs['data-source']; source=(ROOT/'examples/ch44'/file).read_text()
    if region:=attrs.get('data-region'):
        source=source.split('// BEGIN '+region+'\n')[1].split('  // END '+region)[0]
        source='\n'.join(x[2:] if x.startswith('  ') else x for x in source.splitlines())
    assert text.rstrip()==source.rstrip(), file
    checks.append(file+(':'+region if region else ''))
before=(ROOT/'docs/reviews/ch43-ch44-ch45-baseline/ch44.html').read_text()
ids=lambda s: re.findall(r'<(?:title|desc) id="([^"]+)"',s)
assert ids(before)==ids(page) and len(ids(page))==72
svg=lambda s: re.findall(r'<svg.*?</svg>',s,re.S)
changed=[re.search(r'<title id="([^"]+)"',new)[1] for old,new in zip(svg(before),svg(page)) if old!=new]
assert all(x.startswith('d5') for x in changed),changed
geometry=lambda svg: re.sub(r'(<(?:title|desc|text)\b[^>]*>).*?(</(?:title|desc|text)>)',r'\1\2',svg,flags=re.S)
assert [geometry(v) for v in svg(before)] == [geometry(v) for v in svg(page)]
hashes={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest()
        for f in [ROOT/'chapters/ch44.html',*sorted((ROOT/'examples/ch44').glob('*'))] if f.is_file()}
print(json.dumps(dict(passed=True,snippets=checks,retainedIds=len(ids(page)),changedSvgs=changed,geometryUnchanged=True,
                     sourceHashes=hashes),ensure_ascii=False))
