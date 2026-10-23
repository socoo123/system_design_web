// PLAN.md §§2.3, 4–6, 8: structural failures and descriptive statistics are separate.
import fs from 'node:fs';
import path from 'node:path';
import {root, read, validateDocument, validateChapter, validateSvg} from './validation.mjs';
const errors=[], warnings=[];
const chapters=fs.readdirSync(path.join(root,'chapters')).filter(n=>/^ch\d{2}\.html$/.test(n)).sort();
const index=read('index.html'), result=validateDocument(index,'index.html');
errors.push(...result.errors);
for(const file of chapters) if(!result.nodes.some(n=>n.tag==='a' && n.attrs.href===`chapters/${file}`)) errors.push(`index.html: missing chapter entry ${file}`);
if(!fs.existsSync(path.join(root,'favicon.ico'))) errors.push('missing favicon.ico');
let decks=0,frames=0,code=0;
for(const file of chapters){
  const r=validateChapter(read(`chapters/${file}`),file.slice(0,-5));
  errors.push(...r.errors);warnings.push(...r.warnings);
  decks+=r.stats.decks;frames+=r.stats.frames;code+=r.stats.code;
}
function walk(dir){return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];}
for(const file of walk(path.join(root,'assets'))){
  const rel=path.relative(root,file);
  if(file.endsWith('.svg')) errors.push(...validateSvg(fs.readFileSync(file,'utf8'),rel));
  if(/\.(?:js|css)$/.test(file)){
    const source=fs.readFileSync(file,'utf8');
    if(/d2[^\s"']*\.wasm|(?:https?:)?\/\/[^\s"']+d2[^\s"']*\.js/i.test(source)) errors.push(`${rel}: browser D2 runtime is not allowed`);
    if(/@import\s+(?:url\()?\s*["']?(?:https?:|\/\/)/i.test(source)) errors.push(`${rel}: external CSS import`);
  }
}
for(const file of walk(path.join(root,'diagrams')).filter(f=>f.endsWith('.d2'))){
  const stem=path.relative(path.join(root,'diagrams'),file).slice(0,-3);
  for(const theme of ['parchment','dracula']) if(!fs.existsSync(path.join(root,'assets','diagrams',`${stem}.${theme}.svg`))) errors.push(`diagrams/${stem}.d2: missing generated ${theme} SVG`);
  if(!fs.existsSync(file.slice(0,-3)+'.json')) errors.push(`diagrams/${stem}.d2: missing accessibility metadata JSON`);
}
console.log(`STATS ${chapters.length} chapters; ${decks} decks; ${frames} frames; ${code} code blocks (no count quotas)`);
if(warnings.length)console.log(`WARN ${warnings.length} migration/review notes; run audit-chapter.mjs for chapter details`);
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exitCode=1;}
else console.log('PASS structure, local resources, accessibility, bilingual nesting, chapter entries and animation preservation');
