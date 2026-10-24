"""Verify the displayed snippets against their single source files."""
import ast
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import textwrap

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
class Code(HTMLParser):
    def __init__(self):
        super().__init__(); self.current=None; self.blocks=[]
    def handle_starttag(self, tag, attrs):
        if tag=='pre':self.current={'attrs':dict(attrs),'text':''}
    def handle_data(self, data):
        if self.current is not None:self.current['text']+=data
    def handle_endtag(self, tag):
        if tag=='pre':self.blocks.append(self.current);self.current=None
chapter=(ROOT/'chapters/ch37.html').read_text()
parser=Code();parser.feed(chapter)
checks=[]
for block in parser.blocks:
    reference=block['attrs']['data-source'];name,sep,region=reference.partition(':')
    source=(HERE/name).read_text()
    if sep:
        source=source.split(f'// BEGIN {region}\n',1)[1].split(f'    // END {region}',1)[0]
        source=textwrap.dedent(source)
    assert block['text']==source,reference
    checks.append({'source':reference,'sha256':hashlib.sha256(source.encode()).hexdigest(),'exact':True})
assert len(checks)==3
adapter=ast.parse((HERE/'storage.py').read_text())
stock_sql='UPDATE inventory SET on_hand = on_hand - :qty WHERE sku = :sku AND on_hand >= :qty'
assert any(isinstance(n,ast.Constant) and n.value==stock_sql for n in ast.walk(adapter))
pseudo=(HERE/'checkout.pseudo').read_text()
assert '"UPDATE inventory SET on_hand = on_hand - :qty "\n                        "WHERE sku = :sku AND on_hand >= :qty"' in pseudo
baseline=json.loads((ROOT/'docs/reviews/ch37-inventory-before.json').read_text())
ids=re.findall(r'\bid="([^"]+)"',chapter)
assert set(baseline['allIds'])<=set(ids),'original HTML IDs removed'
frames=re.findall(r'<svg\b[^>]*class="board"[^>]*>[\s\S]*?</svg>',chapter)
slide_ids=[re.search(r'<title id="([^"]+)"',svg)[1] for svg in frames]
assert slide_ids==[frame['ids'][0] for deck in baseline['decks'] for frame in deck['frames']]
assert chapter.count('<figure class="deck">')==7 and len(frames)==38
assert 'class="cards-grid"' in chapter
result={'passed':True,'snippets':checks,'stockSqlSame':True,'originalIdsPreserved':True,'decks':7,'frames':38,'chapterSha256':hashlib.sha256(chapter.encode()).hexdigest()}
print(json.dumps(result,indent=2))
