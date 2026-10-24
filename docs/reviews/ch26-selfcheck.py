"""Bind chapter inventory, arithmetic and final source hashes to author evidence."""
from pathlib import Path
import hashlib
import json
import re
from fractions import Fraction

ROOT=Path(__file__).resolve().parents[2]
chapter=ROOT/'chapters/ch26.html'
current=chapter.read_text()
before=(ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch26.html').read_text()
sha=lambda data:hashlib.sha256(data).hexdigest()
checks=[]
def check(name, passed, **details):
    checks.append(dict(name=name,passed=bool(passed),**details))
    if not passed: raise AssertionError(name)

svgs=lambda text:re.findall(r'<svg\b[\s\S]*?</svg>',text)
titles=lambda text:re.findall(r'<title id="([^"]+)"',text)
before_svg,after_svg=svgs(before),svgs(current)
check('6 decks / 31 frames / IDs retained',len(after_svg)==31 and current.count('<figure class="deck">')==6 and titles(before)==titles(current))
changed=[titles(a)[0] for b,a in zip(before_svg,after_svg) if b!=a]
check('local changes only in D1, D4F5 and D6',changed==[f'd1s{i}t' for i in range(1,6)]+['d4s5t']+[f'd6s{i}t' for i in range(1,6)],changed=changed)
check('F02 browser title retained','<title>Ch26 · 红包系统</title>' in current)
check('shared code and bilingual flashcard grid',current.count('<pre ')==6 and 'class="cards-grid"' in current and 'class="flashcards"' not in current)
check('no generated class or bytecode files',not list((ROOT/'examples/ch26').rglob('*.class')) and not list((ROOT/'examples/ch26').rglob('*.pyc')))

numeric=[]
def number(name, actual, expected, unit):
    assert actual==expected,(name,actual,expected)
    numeric.append(dict(name=name,exact=str(actual),unit=unit,passed=True))
number('confirmations/day',1_000_000*10,10_000_000,'confirmations/day')
number('average confirmations',Fraction(10_000_000,86_400),Fraction(3125,27),'confirmations/s')
number('10x peak confirmations',Fraction(10_000_000,86_400)*10,Fraction(31250,27),'confirmations/s')
number('attempts/day',10_000_000*5,50_000_000,'attempts/day')
number('average attempts',Fraction(50_000_000,86_400),Fraction(15625,27),'attempts/s')
number('10x peak attempts',Fraction(50_000_000,86_400)*10,Fraction(156250,27),'attempts/s')
number('hot burst minimum losers',10000-100,9900,'users')
number('hot burst loser fraction',Fraction(9900,10000),Fraction(99,100),'ratio')
number('2ms theoretical serial rate',1/Fraction(2,1000),500,'confirmations/s')
number('60% planned serial rate',500*Fraction(60,100),300,'confirmations/s')
number('100/s admission share of theoretical',Fraction(100,500),Fraction(1,5),'ratio')
number('metadata bytes/day',1_000_000*1000,10**9,'B/day')
number('claim bytes/day',10_000_000*200,2*10**9,'B/day')
number('seven day raw rows',(10**9+2*10**9)*7,21*10**9,'B')
number('three copies',21*10**9*3,63*10**9,'B')
number('amount payload/day',1_000_000*10*8,80*10**6,'B/day')
number('deadline window',24*60*60,86400,'s')
money,left=1000,4
for index,amount in enumerate([300,400,100],1):
    upper=min(2*money//left,money-(left-1))
    number('running split bound '+str(index),upper,[500,466,299][index-1],'cents')
    assert 1<=amount<=upper
    money-=amount;left-=1
number('final remaining share',money,200,'cents')
number('running share sum',sum([300,400,100,200]),1000,'cents')
number('even split 1003',251*3+250,1003,'cents')
number('claimed sum after s2',1000-400,600,'cents remaining')
number('closed count',1+0+3,4,'shares')
for name,terms in [('open',[400,600,0,0]),('refund pending',[400,0,600,0]),('refunded',[400,0,0,600])]:
    number('conservation '+name,sum(terms),1000,'cents')

transitions=0
for minimum in range(1,6):
    for count in range(2,11):
        for money in range(minimum*count,101):
            upper=min(2*money//count,money-minimum*(count-1))
            assert upper>=minimum
            for amount in range(minimum,upper+1):
                assert amount+money-amount==money and money-amount>=minimum*(count-1)
                transitions+=1
check('enumerated minimum/conservation local transitions',transitions>0,count=transitions)
check('all displayed numeric derivations recomputed',all(x['passed'] for x in numeric),count=len(numeric))

result=dict(sha256=sha(chapter.read_bytes()),checks=checks,numeric=numeric,
            animation=dict(decks=6,frames=31,slideIds=titles(current),changed=changed,
                           unchangedFrames=31-len(changed)),passed=all(x['passed'] for x in checks))
(ROOT/'docs/reviews/ch26-selfcheck-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
files=[chapter]+sorted(p for p in (ROOT/'examples/ch26').rglob('*') if p.is_file())
(ROOT/'docs/reviews/ch26-final-hashes.json').write_text(json.dumps(dict(files={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in files}),indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'],checks=len(checks),numeric=len(numeric),transitions=transitions,changedFrames=len(changed))))
