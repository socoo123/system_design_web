import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420}});
const result={frames:[]};
try {
 for (const [phase,file] of [['before','docs/reviews/ch25-ch26-ch27-baseline/ch25.html'],['after','chapters/ch25.html']]) {
  const html=fs.readFileSync(file,'utf8');
  result[`${phase}Sha256`]=crypto.createHash('sha256').update(html).digest('hex');
  for(const svg of [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]).filter(s=>s.includes('id="d5s'))) {
   const id=svg.match(/<title id="([^"]+)"/)[1];
   await page.setContent(`<html data-theme="parchment"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0}.board{width:960px;min-width:960px;height:420px}</style></head><body>${svg}</body></html>`);
   await page.evaluate(()=>document.fonts.ready);
   const metrics=await page.evaluate(()=>{
    const commit=[...document.querySelectorAll('text')].find(e=>e.textContent==='commit');
    const b=commit.getBBox();
    const api=[...document.querySelectorAll('rect')].find(e=>e.getAttribute('y')==='90');
    return {label:{x:b.x,y:b.y,width:b.width,height:b.height},commitToStoreGap:350-b.x-b.width,apiToStoreGap:350-Number(api.getAttribute('x'))-Number(api.getAttribute('width'))};
   });
   result.frames.push({phase,id,...metrics});
  }
 }
 const before=result.frames.filter(f=>f.phase==='before'),after=result.frames.filter(f=>f.phase==='after');
 result.passed=before.every(f=>f.apiToStoreGap===50)&&after.every(f=>f.apiToStoreGap===70&&f.commitToStoreGap>14);
 if(!result.passed)process.exitCode=1;
} finally {await browser.close();}
fs.writeFileSync('docs/reviews/ch25-layout-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
