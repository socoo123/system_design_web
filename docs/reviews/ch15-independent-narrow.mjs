// Actual 390px viewport. Capture all changed decks at left/middle/right.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root,'docs/reviews/screenshots/ch15-independent/narrow');
fs.mkdirSync(out,{recursive:true});
const results = [];
const browser = await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for (const theme of ['parchment','dracula']) {
  const context = await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  const page = await context.newPage();
  await page.addInitScript(theme => {localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto(`${process.env.SITE_BASE || 'http://127.0.0.1:8765'}/chapters/ch15.html`);
  await page.waitForSelector('.deck-next');
  await page.evaluate(()=>document.fonts.ready);
  for (const n of (process.env.DECKS || "1,2,3,6").split(",").map(Number)) {
   const deck = page.locator('.deck').nth(n-1);
   for (let f=0;f<5;f++) {
    await deck.locator('.dot').nth(f).click();
    await deck.scrollIntoViewIfNeeded();
    const slide = deck.locator('.slide.is-on');
    const id = `d${n}s${f+1}`;
    for (const [position,fraction] of [['left',0],['middle',0.5],['right',1]]) {
     await slide.evaluate((e,fraction)=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)*fraction;},fraction);
     const bounds = await slide.boundingBox();
     const board = await slide.locator('svg').boundingBox();
     const view = await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));
     if(view.innerWidth!==390 || view.scrollWidth!==390)throw new Error(`overflow ${id}`);
     await page.screenshot({path:path.join(out,`${id}-${theme}-${position}.png`),clip:{x:bounds.x,y:board.y,width:bounds.width,height:board.height}});
     results.push({id,theme,position,...view,scroller:await slide.evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft}))});
    }
    if (false) {
     await slide.evaluate(e=>{e.scrollLeft=0;});
     await deck.screenshot({path:path.join(out,`d3s2-${theme}-caption.png`)});
    }
   }
  }
  await context.close();
 }
}finally{await browser.close();}
const html = fs.readFileSync(path.join(root,'chapters/ch15.html'));
fs.writeFileSync(path.join(root,'docs/reviews/ch15-independent-narrow-results.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(html).digest('hex'),captures:results},null,2)+'\n');
console.log(JSON.stringify({captures:results.length,viewport:390,output:out}));
