import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const phase=process.argv.includes('--before')?'before':'after';
const source=phase==='before'?'docs/reviews/ch35-before.html':'chapters/ch35.html';
const html=fs.readFileSync(source,'utf8');
const figures=[...html.matchAll(/<figure class="deck">([\s\S]*?)<\/figure>/g)].map(m=>m[1]);
const out=`docs/reviews/screenshots/ch35-author/${phase}`;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={phase,source,hash:crypto.createHash('sha256').update(html).digest('hex'),decks:[]};
try {for(let d=0;d<figures.length;d++) {
 const frames=[...figures[d].matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
 const evidence={deck:d+1,frames:frames.length,sheets:[]};
 for(const theme of ['parchment','dracula']) {
  const page=await browser.newPage({viewport:{width:1960,height:1000},reducedMotion:'reduce'});
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0;padding:12px;display:grid;grid-template-columns:960px 960px;gap:12px}figure{margin:0;min-width:0}.board{width:960px;min-width:960px;display:block}.is-new{animation:none!important}figcaption{padding:8px;font-size:16px}</style></head><body>${frames.map((s,i)=>`<figure><figcaption>Ch35 D${d+1} F${i+1} · ${phase} ${theme}</figcaption>${s}</figure>`).join('')}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  const file=`${out}/d${d+1}-${theme}-contact.png`;
  await page.screenshot({path:file,fullPage:true});evidence.sheets.push(file);await page.close();
 }
 result.decks.push(evidence);
}}finally{await browser.close()}
fs.writeFileSync(`docs/reviews/ch35-${phase}-render-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(`${phase}: ${figures.length} decks rendered in both themes`);
