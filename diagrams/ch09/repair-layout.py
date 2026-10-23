"""Apply targeted Ch09 SVG repairs; frame IDs and semantic sequence stay intact."""
import re
from pathlib import Path
p=Path('chapters/ch09.html');s=p.read_text()
# These are coordinate edits, not a replacement renderer.
def repair(m):
 svg=m[0];frame=re.search(r'<title id="([^"]+)"',svg)[1]
 if frame.startswith('d1'):
  # Place the miss label below its line, in the clear band above Redis.
  svg=svg.replace('x="606" y="219"','x="606" y="222"')
 if frame in ['d2s4t','d2s5t']:
  svg=svg.replace('M742 222 L568 222 Q560 222 560 230 L560 250 Q560 258 552 258 L478 258 Q474 258 474 254 L474 250','M742 228 L738 228 Q730 228 730 236 L730 250 Q730 258 722 258 L482 258 Q474 258 474 250')
 if frame in ['d3s4t','d3s5t']:
  svg=svg.replace('M414 245 L414 312 Q414 320 422 320 L743 320','M414 245 L414 322 Q414 330 422 330 L743 330').replace('753,320 743,325 743,315','753,330 743,335 743,325').replace('x="584" y="312"','x="584" y="321"')
  svg=svg.replace('M753 338 L398 338 Q390 338 390 330 L390 255','M753 350 L398 350 Q390 350 390 342 L390 255').replace('x="584" y="354"','x="584" y="370"')
 if frame in ['d7s3t','d7s4t']:
  svg=svg.replace('M742 173 L668 173 Q660 173 660 165 L660 120 Q660 112 652 112 L515 112','M742 165 L708 165 Q700 165 700 157 L700 120 Q700 112 692 112 L515 112')
 if frame == "d1s5t":
  svg=svg.replace('x="596" y="324" width="132"','x="588" y="324" width="148"').replace("M525 356 L586 356","M525 356 L578 356").replace("596,356 586,361 586,351","588,356 578,361 578,351").replace("M728 356 L766 356","M736 356 L766 356")
 return svg
s=re.sub(r'<svg\b[\s\S]*?</svg>',repair,s);p.write_text(s)
