from pathlib import Path
import html,re,textwrap
root=Path(__file__).resolve().parents[2]
s=(root/'chapters/ch05.html').read_text()
java=(root/'examples/ch05/ConsistentRing.java').read_text()
for name in ('ring','router'):
    source=textwrap.dedent(java.split('// BEGIN '+name+'\n')[1].split('    // END '+name)[0]).rstrip()
    shown=html.unescape(re.search(r'data-source="ConsistentRing.java#'+name+r'"><code>(.*?)</code>',s,re.S)[1])
    assert source==shown,name
pseudo=(root/'examples/ch05/handoff.pseudo').read_text().rstrip()
assert pseudo==html.unescape(re.search(r'data-source="handoff.pseudo"><code>(.*?)</code>',s,re.S)[1])
print('PASS page Java regions and handoff pseudocode match their sources')
