import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const out='docs/reviews/screenshots/ch06-independent';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results={layouts:[],errors:[],sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch06.html')).digest('hex')};
for(const width of [320,390,1440])for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
 page.on('pageerror',e=>results.errors.push(e.message));
 await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},{theme});
 await page.goto('http://127.0.0.1:8765/chapters/ch06.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
 const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 if(geometry.width!==width||geometry.scrollWidth!==width)throw Error('overflow');
 let visited=0;
 const deck=page.locator('.deck').nth(5);
 for(let f=0;f<5;f++){
  await deck.locator('.dot').nth(f).click(); visited++;
  if(width===1440)await deck.locator('.slide.is-on svg').screenshot({path:`${out}/d6s${f+1}-${theme}.png`});
 }
 for(const d of [1,2,4]){
  const other=page.locator('.deck').nth(d);await other.locator('.dot').last().click();visited++;
  if(width===1440)await other.locator('.slide.is-on svg').screenshot({path:`${out}/d${d+1}-final-${theme}.png`});
 }
 await deck.locator('.dot').last().click();await deck.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${theme}-d6.png`});
 if(width<500){
  const scroll=await deck.locator('.slide.is-on').evaluate(e=>{const before=e.scrollLeft;e.scrollLeft=e.scrollWidth;return {before,after:e.scrollLeft,client:e.clientWidth,scroll:e.scrollWidth}});
  await page.screenshot({path:`${out}/${width}-${theme}-d6-right.png`});geometry.deckScroll=scroll;
 }
 await page.locator('pre').first().scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${theme}-code.png`});
 results.layouts.push({theme,locale:'both',...geometry,visited});await context.close();
}
await browser.close();if(results.errors.length)throw Error(results.errors);results.passed=true;fs.writeFileSync('docs/reviews/ch06-independent-browser-results.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({passed:true,layouts:results.layouts.length,frameVisits:results.layouts.reduce((n,r)=>n+r.visited,0),errors:results.errors}));
