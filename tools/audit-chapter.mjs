// PLAN.md §§2.3, 4–6 and 8. Counts inform review; they are not acceptance quotas.
// This cannot establish technical correctness, translation equivalence or visual quality.
import fs from 'node:fs';
import path from 'node:path';
import {root,read,validateChapter} from './validation.mjs';
const ids=process.argv.slice(2);
if(!ids.length){console.error('usage: node tools/audit-chapter.mjs chNN [chNN...]');process.exit(1);}
for(const id of ids){
  if(!/^ch\d{2}$/.test(id)||!fs.existsSync(path.join(root,'chapters',`${id}.html`))){console.error(`invalid/missing chapter: ${id}`);process.exitCode=1;continue;}
  const r=validateChapter(read(`chapters/${id}.html`),id);
  console.log(`\n${id} STATS ${JSON.stringify(r.stats)}`);
  r.warnings.forEach(w=>console.log(`WARN ${w}`));
  r.errors.forEach(e=>console.error(`FAIL ${e}`));
  if(r.errors.length)process.exitCode=1;
  else console.log('PASS structural checks; content/translation/rendering require independent review');
}
