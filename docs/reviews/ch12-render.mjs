import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const stage = process.argv[2] || 'after';
const out = `docs/reviews/screenshots/ch12/${stage}`;
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const result = { stage, hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch12.html')).digest('hex'), frames:[] };
await page.goto((process.env.SITE_BASE || 'http://127.0.0.1:8765')+'/chapters/ch12.html');
await page.evaluate(()=>document.fonts.ready);
for (const theme of ['parchment','dracula']) {
 await page.locator(`[data-theme-set="${theme}"]`).click();
 for (const [d,deck] of (await page.locator('.deck').all()).entries()) {
  for (let s=0;s<await deck.locator('.dot').count();s++) {
   await deck.locator('.dot').nth(s).click();
   const svg = deck.locator('.slide.is-on svg');
   await svg.screenshot({path:`${out}/d${d+1}s${s+1}-${theme}.png`});
   const texts = await svg.locator('text').evaluateAll(els=>els.map(e=>({text:e.textContent,x:e.getBBox().x,y:e.getBBox().y,w:e.getBBox().width,h:e.getBBox().height})));
   result.frames.push({deck:d+1,slide:s+1,theme,texts});
  }
 }
}
await browser.close();
fs.writeFileSync(`docs/reviews/ch12-${stage}-render-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({stage,hash:result.hash,frames:result.frames.length}));
