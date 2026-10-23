import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const stage=process.argv[2]||'after';
const out=`docs/reviews/screenshots/ch10/${stage}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:8765/chapters/ch10.html');
await page.evaluate(()=>document.fonts.ready);
const sourcePath=stage==='before'?'docs/reviews/ch10-ch11-ch12-baseline/ch10.html':'chapters/ch10.html';
const source=fs.readFileSync(sourcePath,'utf8');
const svgs=[...source.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
if(stage==='before') await page.evaluate(svgs=>{
  [...document.querySelectorAll('.slide svg')].forEach((svg,i)=>{svg.outerHTML=svgs[i];});
},svgs);
const inventory={stage,sourcePath,pageSha256:crypto.createHash('sha256').update(source).digest('hex'),
  frames:svgs.map(svg=>({id:svg.match(/<title id="([^"]+)"/)[1],sha256:crypto.createHash('sha256').update(svg).digest('hex')}))};
for(const theme of ['parchment','dracula']){
 await page.locator(`[data-theme-set="${theme}"]`).click();
 for(const [d,deck] of (await page.locator('.deck').all()).entries()){
  for(let s=0;s<await deck.locator('.dot').count();s++){
   await deck.locator('.dot').nth(s).click();
   await deck.locator('.slide.is-on svg').screenshot({path:`${out}/d${d+1}s${s+1}-${theme}.png`});
  }
 }
}
await browser.close();
fs.writeFileSync(`docs/reviews/ch10-animation-${stage}.json`,JSON.stringify(inventory,null,2)+'\n');
