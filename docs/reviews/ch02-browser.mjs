// Real Chromium viewport verification; does not touch the user's browser.
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const output = path.resolve('docs/reviews/screenshots/ch02');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = {layouts:[],frames:[],errors:[]};
try {
 for (const width of [320,390,768,1440]) for (const theme of ['parchment','dracula']) for (const locale of ['zh','en','both']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
  await page.goto((process.env.SITE_BASE||'http://127.0.0.1:8765')+'/chapters/ch02.html');
  await page.waitForSelector('.deck-next'); await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,decks:document.querySelectorAll('.deck').length,frames:document.querySelectorAll('.slide').length,code:document.querySelectorAll('pre').length}));
  if(state.width!==width||state.scrollWidth!==width||state.decks!==5||state.frames!==23)throw new Error(JSON.stringify(state));
  result.layouts.push(state);
  if(locale==='both') {
   await page.screenshot({path:path.join(output,`${width}-${theme}-top.png`)});
   await page.locator('pre').first().scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,`${width}-${theme}-code.png`)});
  }
  if(width===1440&&locale==='both') {
   for(const deck of await page.locator('.deck').all()) {
    const count=await deck.locator('.dot').count();
    for(let i=0;i<count;i++) {
     await deck.locator('.dot').nth(i).click();
     const svg=deck.locator('.slide.is-on svg');
     const id=await svg.locator('title').getAttribute('id');
     await svg.screenshot({path:path.join(output,`${id}-${theme}.png`)});
     result.frames.push({id,theme,count:await deck.locator('.deck-count').textContent()});
    }
   }
  }
  if(width===390&&locale==='both') {
   for(const [i,deck] of (await page.locator('.deck').all()).entries()) {
    await deck.locator('.dot').last().click();
    await deck.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`390-${theme}-deck${i+1}.png`)});
    const scroll = await deck.locator('.slide.is-on').evaluate(el => { el.scrollLeft = el.scrollWidth; return {left:el.scrollLeft,width:el.clientWidth,scrollWidth:el.scrollWidth}; });
    if(scroll.left <= 0) throw new Error('Mobile diagram failed to scroll');
    result.frames.push({mobile:true,theme,deck:i+1,scroll});
    await page.screenshot({path:path.join(output,`390-${theme}-deck${i+1}-right.png`)});
   }
  }
  await context.close();
 }
 if(result.errors.length)throw new Error(JSON.stringify(result.errors));
 result.passed=true;
} catch(e) {result.passed=false;result.failure=String(e);process.exitCode=1;}
finally {await browser.close();fs.writeFileSync('docs/reviews/ch02-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frames:result.frames.length,errors:result.errors}));}
