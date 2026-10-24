// Geometric triage only: candidates require visual inspection; no correctness claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const before = process.argv.includes('--before');
const label = before ? 'before' : 'after';
const directory = `docs/reviews/screenshots/ch19-ch20-ch21-root/${label}`;
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const resultPath = `docs/reviews/ch19-ch20-ch21-geometry-${label}.json`;
const selectedChapters = process.env.CHAPTERS ? process.env.CHAPTERS.split(',') : ['ch19', 'ch20', 'ch21'];
const results = process.env.CHAPTERS && fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath)) : { mode: label, chapters: {} };
results.runs = [...(results.runs || []), { chapters: selectedChapters, startedAt: new Date().toISOString() }];
try {
 for (const chapter of selectedChapters) {
  const filename = before ? `docs/reviews/ch19-ch20-ch21-baseline/${chapter}.html` : `chapters/${chapter}.html`;
  const html = fs.readFileSync(filename, 'utf8');
  const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page = await context.newPage();
  if(before) await page.route(`**/chapters/${chapter}.html`, route=>route.fulfill({body:html,contentType:'text/html'}));
  await page.addInitScript(()=>{localStorage.setItem('sd-theme','parchment');localStorage.setItem('sd-locale','both');});
  await page.goto(`http://127.0.0.1:8765/chapters/${chapter}.html`);
  await page.evaluate(()=>document.fonts.ready);
  const probe = await page.evaluate(()=>[...document.querySelectorAll('.slide svg')].map(svg=>{
   const bb=e=>{const b=e.getBBox();return{x:b.x,y:b.y,w:b.width,h:b.height}};
   const intersects=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1 && Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1;
   const contains=(a,b)=>b.x>=a.x-1&&b.y>=a.y-1&&b.x+b.w<=a.x+a.w+1&&b.y+b.h<=a.y+a.h+1;
   const texts=[...svg.querySelectorAll('text')].map(e=>({text:e.textContent,...bb(e)}));
   const nodes=[...svg.querySelectorAll('rect.box,rect.store')].map(e=>bb(e));
   const boundaries=[...svg.querySelectorAll('.boundary')].map(e=>bb(e));
   return {id:svg.querySelector('title')?.id,
    invalidNumbers:[...svg.querySelectorAll('*')].flatMap(e=>[...e.attributes].filter(a=>/NaN|undefined|Infinity/.test(a.value)).map(a=>({tag:e.tagName,attribute:a.name,value:a.value}))),
    boundaryCrossings:texts.flatMap(t=>boundaries.filter(n=>intersects(t,n)&&!contains(n,t)).map(n=>({text:t,boundary:n}))),
    clipped:texts.filter(t=>t.x<0||t.y<0||t.x+t.w>960||t.y+t.h>420),
    textPairs:texts.flatMap((a,i)=>texts.slice(i+1).filter(b=>intersects(a,b)).map(b=>({a,b}))),
    nodeCrossings:texts.flatMap(t=>nodes.filter(n=>intersects(t,n)&&!contains(n,t)).map(n=>({text:t,node:n})))};
  }));
  results.chapters[chapter]={sha256:crypto.createHash('sha256').update(html).digest('hex'), frames:probe};
  for(const theme of ['parchment','dracula']) {
   await page.locator(`[data-theme-set="${theme}"]`).click();
   for(let i=0;i<6;i++) {
    const deck=page.locator('.deck').nth(i);await deck.locator('.dot').last().click();
    await deck.screenshot({path:path.join(directory,`${chapter}-${theme}-d${i+1}-last.png`)});
   }
  }
  await context.close();
 }
} finally {await browser.close();}
fs.writeFileSync(`docs/reviews/ch19-ch20-ch21-geometry-${label}.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(results.chapters).map(([ch,v])=>[ch,{frames:v.frames.length,invalidNumbers:v.frames.filter(x=>x.invalidNumbers.length).map(x=>[x.id,x.invalidNumbers]),boundaryCrossings:v.frames.filter(x=>x.boundaryCrossings.length).map(x=>[x.id,x.boundaryCrossings.map(p=>p.text.text)]),clipped:v.frames.filter(x=>x.clipped.length).map(x=>x.id),textPairs:v.frames.filter(x=>x.textPairs.length).map(x=>[x.id,x.textPairs.map(p=>[p.a.text,p.b.text])]),nodeCrossings:v.frames.filter(x=>x.nodeCrossings.length).map(x=>[x.id,x.nodeCrossings.map(p=>p.text.text)])}]))));
