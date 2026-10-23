// Idempotent local repair: preserve every frame, wire, and label's wording.
// Redis title/subtitle getBBox overlapped by 1px in D1 F2–5 and D5 F1–5.
// Keep font sizes; shift title upward and cylinder top upward for real clearance.
import fs from 'node:fs';
const file=new URL('../../chapters/ch04.html',import.meta.url);
let source=fs.readFileSync(file,'utf8');
source=source.replace(/<svg\b[\s\S]*?<\/svg>/g,svg=>{
 if(/aria-labelledby="d1s/.test(svg))return svg
  .replaceAll('M440 282 V334 A80 12 0 0 0 600 334 V282','M440 277 V334 A80 12 0 0 0 600 334 V277')
  .replaceAll('cx="520" cy="282"','cx="520" cy="277"')
  .replaceAll('x="520" y="318"','x="520" y="311"')
  .replaceAll('x="520" y="336"','x="520" y="334"');
 if(/aria-labelledby="d5s/.test(svg))return svg
  .replaceAll('M520 65 V121 A80 12 0 0 0 680 121 V65','M520 60 V121 A80 12 0 0 0 680 121 V60')
  .replaceAll('cx="600" cy="65"','cx="600" cy="60"')
  .replaceAll('x="600" y="103"','x="600" y="96"');
 return svg;
});
fs.writeFileSync(file,source);
