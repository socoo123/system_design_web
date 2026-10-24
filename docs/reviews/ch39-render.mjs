// Ch39 author evidence. Original SVG dimensions, never a mobile viewport substitute.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const phase = process.argv[2] || 'after';
if (!['before','after'].includes(phase)) throw Error('before or after');
const sourceFile = phase === 'before' ? 'docs/reviews/ch37-ch38-ch39-baseline/ch39.html' : 'chapters/ch39.html';
const source = fs.readFileSync(sourceFile, 'utf8');
const figures = [...source.matchAll(/<figure class="deck">([\s\S]*?)<\/figure>/g)].map(m=>m[1]);
const out = `docs/reviews/screenshots/ch39-author/${phase}`;
fs.mkdirSync(out,{recursive:true});
const result = { phase, sourceFile, sourceSha256:crypto.createHash('sha256').update(source).digest('hex'), decks:[] };
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for (let di=0;di<figures.length;di++) {
  const frames=[...figures[di].matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
  const files=[];
  for (const theme of ['parchment','dracula']) {
   const page=await browser.newPage({viewport:{width:1960,height:1000},reducedMotion:'reduce'});
   const cards=frames.map((svg,i)=>`<figure><figcaption>D${di+1} F${i+1} · ${theme} · ${phase}</figcaption>${svg.replaceAll('class="is-new"','class="is-new-off"')}</figure>`).join('');
   await page.setContent(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0;padding:12px;display:grid;grid-template-columns:960px 960px;gap:12px}figure{margin:0;min-width:0}.board{width:960px;min-width:960px;display:block}figcaption{padding:8px;font-size:16px}</style></head><body>${cards}</body></html>`);
   await page.evaluate(()=>document.fonts.ready);
   const file=path.join(out,`d${di+1}-${theme}-all.png`);
   await page.screenshot({path:file,fullPage:true});
   for(let fi=0;fi<frames.length;fi++) await page.locator('svg').nth(fi).screenshot({path:path.join(out,`d${di+1}s${fi+1}-${theme}.png`)});
   files.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
   await page.close();
  }
  result.decks.push({deck:di+1,frames:frames.length,files});
 }
} finally {await browser.close();}
fs.writeFileSync(`docs/reviews/ch39-${phase}-frames.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({phase,decks:figures.length,frames:result.decks.reduce((n,d)=>n+d.frames,0),sheets:result.decks.flatMap(d=>d.files).length}));
