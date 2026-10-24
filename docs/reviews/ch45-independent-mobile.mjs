import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'docs/reviews/screenshots/ch45-independent/mobile');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'chapters/ch45.html'))).digest('hex'),checks:[],errors:[]};
try {
 for(const theme of ['parchment','dracula']) {
  const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch45.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  for(const deckNumber of [6,7]) {
   const deck=page.locator('.deck').nth(deckNumber-1);await deck.locator('.dot').last().click();
   const slide=deck.locator('.slide.is-on');
   for(const [position,ratio] of [['left',0],['middle',0.5],['right',1]]) {
    const scroll=await slide.evaluate((e,r)=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)*r;return {left:e.scrollLeft,width:e.clientWidth,scrollWidth:e.scrollWidth};},ratio);
    await slide.evaluate(e=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-12,behavior:'instant'}));
    const file=path.join(out,`${theme}-390-d${deckNumber}-${position}.png`);await page.screenshot({path:file});
    result.checks.push({theme,deck:deckNumber,position,...scroll,file:path.relative(root,file),innerWidth:await page.evaluate(()=>innerWidth)});
   }
  }
  for(const [source,number] of [['edit-tx',1],['capture',2],['consume-tx',3]]) {
   const block=page.locator('.code-block').nth(number);
   await block.evaluate(e=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-12,behavior:'instant'}));
   const file=path.join(out,`${theme}-390-${source}.png`);await page.screenshot({path:file});
   result.checks.push({theme,code:source,file:path.relative(root,file),innerWidth:await page.evaluate(()=>innerWidth)});
  }
  await page.setViewportSize({width:320,height:1000});
  const block=page.locator('.code-block').nth(1);
  const scroll=await block.locator('pre').evaluate(e=>{e.scrollLeft=e.scrollWidth;return {left:e.scrollLeft,width:e.clientWidth,scrollWidth:e.scrollWidth};});
  await block.evaluate(e=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-12,behavior:'instant'}));
  const file=path.join(out,`${theme}-320-edit-tx-right.png`);await page.screenshot({path:file});
  result.checks.push({theme,code:'edit-tx',position:'right',...scroll,file:path.relative(root,file),innerWidth:await page.evaluate(()=>innerWidth),pageScrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
  await context.close();
 }
 result.passed=result.errors.length===0&&result.checks.length===20&&result.checks.filter(r=>r.deck).every(r=>r.scrollWidth>r.width&&r.innerWidth===390)&&result.checks.filter(r=>r.position==='right'&&r.deck).every(r=>Math.abs(r.scrollWidth-r.width-r.left)<=1);
} finally {await browser.close();}
fs.writeFileSync(path.join(root,'docs/reviews/ch45-independent-mobile-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,checks:result.checks.length,errors:result.errors}));
if(!result.passed)process.exitCode=1;
