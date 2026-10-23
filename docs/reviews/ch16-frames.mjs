// Chapter-owned evidence only; real Chrome viewports, no CLI cropping.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const phase=process.argv[2] || 'after';
const out=path.resolve(`docs/reviews/screenshots/ch16/${phase}`);
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const records=[];
try {
 for(const theme of ['parchment','dracula']) {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await page.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch16.html');
  await page.evaluate(()=>document.fonts.ready);
  for(const [d,deck] of (await page.locator('.deck').all()).entries()) {
   for(const [f,dot] of (await deck.locator('.dot').all()).entries()) {
    await dot.click();
    const slide=deck.locator('.slide.is-on');
    await slide.locator('svg').screenshot({path:path.join(out,`d${d+1}s${f+1}-${theme}.png`)});
    records.push({theme,id:`d${d+1}s${f+1}`,innerWidth:await page.evaluate(()=>innerWidth)});
   }
  }
  await page.close();
 }
} finally {await browser.close();}
fs.writeFileSync(`docs/reviews/ch16-${phase}-frames.json`,JSON.stringify({hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch16.html')).digest('hex'),records},null,2)+'\n');
console.log(`${phase}: ${records.length} actual frame screenshots`);
