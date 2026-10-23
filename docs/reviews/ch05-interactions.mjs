import fs from 'node:fs';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();const result={copied:0,locales:[],errors:[]};
function check(c,m){if(!c)throw new Error(m)}
try{
 await page.goto('http://127.0.0.1:8765/chapters/ch05.html');await page.waitForSelector('.deck-next');
 for(const locale of ['en','zh','both']){
  await page.locator(`[data-locale-set="${locale}"]`).click();
  check(await page.evaluate(l=>document.documentElement.dataset.locale===l,locale),'locale');
  for(const c of await page.locator('.code-block').all()){
   await c.locator('.code-copy').click();
   check(await page.evaluate(()=>navigator.clipboard.readText())===await c.locator('code').textContent(),'copy');result.copied++;
  }
  result.locales.push(locale);
  if(locale!=='both'){
   await page.locator('pre').first().scrollIntoViewIfNeeded();await page.screenshot({path:`docs/reviews/screenshots/ch05/after/390-${locale}-code.png`});
  }
 }
 await page.locator('[data-theme-set="dracula"]').click();
 const deck=page.locator('.deck').last();await deck.locator('.dot').last().click();await page.waitForTimeout(350);
 const slide=deck.locator('.slide.is-on');await slide.evaluate(e=>e.scrollLeft=e.scrollWidth);
 check(await slide.evaluate(e=>e.scrollLeft>0),'mobile SVG scroll');
 await deck.scrollIntoViewIfNeeded();await page.screenshot({path:'docs/reviews/screenshots/ch05/after/390-dracula-diagram-right.png'});
 await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
 check((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard');
 await deck.locator('.deck-speed').click();await deck.locator('.deck-toggle').click();
 await page.waitForFunction(()=>document.querySelectorAll('.deck-count')[4].textContent!=='2 / 5',null,{timeout:6000});await deck.locator('.deck-toggle').click();
 const flash=page.locator('.flip').first();await flash.click();check((await flash.getAttribute('class')).includes('is-flipped'),'flashcard');
 await page.locator('.read-toggle').click();await page.reload();check(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','read persistence');
 result.passed=true;result.playback=true;result.keyboard=true;result.flashcard=true;result.readPersistence=true;result.mobileDiagramScroll=true;
}catch(e){result.errors.push(String(e));process.exitCode=1}
await browser.close();fs.writeFileSync('docs/reviews/ch05-interactions.json',JSON.stringify(result,null,2));console.log(result);
