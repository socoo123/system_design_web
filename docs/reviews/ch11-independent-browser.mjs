import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch11-independent';fs.mkdirSync(out,{recursive:true});
const hash=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch11.html')).digest('hex');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results={hash,layouts:[],frames:[],errors:[]};
try {
 for(const width of [1440,390])for(const theme of ['parchment','dracula']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
  page.on('pageerror',e=>results.errors.push(e.message));
  await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},{theme});
  await page.goto('http://127.0.0.1:8765/chapters/ch11.html');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
  const layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,codes:document.querySelectorAll('pre').length,cards:document.querySelectorAll('.cards-grid .flip').length}));
  if(layout.innerWidth!==width||layout.scrollWidth!==width)throw new Error('page overflow');
  results.layouts.push({width,theme,...layout});
  for(const d of [2,4,5]){
   const deck=page.locator('.deck').nth(d-1);const count=await deck.locator('.dot').count();
   for(let s=0;s<count;s++){
    await deck.locator('.dot').nth(s).click();
    if(await deck.locator('.deck-count').innerText()!==`${s+1} / ${count}`)throw new Error('frame mismatch');
    const slide=deck.locator('.slide.is-on');const svg=slide.locator('svg');
    if(width===1440){await svg.screenshot({path:`${out}/d${d}s${s+1}-${theme}.png`});}
    else {
      await slide.scrollIntoViewIfNeeded();await slide.evaluate(e=>e.scrollLeft=0);
      await page.screenshot({path:`${out}/390-d${d}s${s+1}-${theme}-left.png`});
      await slide.evaluate(e=>e.scrollLeft=e.scrollWidth);
      await page.screenshot({path:`${out}/390-d${d}s${s+1}-${theme}-right.png`});
    }
    results.frames.push({width,theme,deck:d,slide:s+1,id:await svg.locator('title').getAttribute('id'),scroll:await slide.evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}))});
   }
  }
  await page.locator('pre[data-source="FeedPage.java"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${width}-${theme}-java.png`});
  await context.close();
 }
 results.passed=results.errors.length===0;
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch11-independent-browser-results.json',JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({passed:results.passed,hash,layouts:results.layouts.length,frames:results.frames.length,errors:results.errors}));
