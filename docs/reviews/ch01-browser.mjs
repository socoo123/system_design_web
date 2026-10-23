// Run with PLAYWRIGHT_MODULE pointing to an installed @playwright/test module.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
import fs from 'node:fs';
const out=new URL('./screenshots/ch01', import.meta.url).pathname;
const browser=await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[]; const errors=[];
for(const width of [320,390,1440]) for(const theme of ['parchment','dracula']) for(const locale of ['zh','en','both']){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
 await page.goto((process.env.SITE_BASE || 'http://localhost:8765')+'/chapters/ch01.html');
 await page.waitForSelector('.deck-next');
 const r=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,locale:document.documentElement.dataset.locale,theme:document.documentElement.dataset.theme,decks:document.querySelectorAll('.deck').length,code:document.querySelectorAll('pre').length,codeOverflow:document.querySelector('pre').scrollWidth>document.querySelector('pre').clientWidth}));
 if(r.width!==width||r.scrollWidth>width) throw Error('overflow '+JSON.stringify(r));
 for(const deck of await page.locator('.deck').all()){
   for(let step=0;step<4;step++){
    await deck.locator('.dot').nth(step).click();
    if(await deck.locator('.deck-count').innerText()!==`${step+1} / 4`) throw Error('deck navigation');
   }
   await deck.locator('.deck-prev').click();
   if(await deck.locator('.deck-count').innerText()!=='3 / 4') throw Error('prev');
 }
 const flash=page.locator('.flip').first(); await flash.click();
 r.flashClass=await flash.getAttribute('class');
 await page.locator('.read-toggle').click(); await page.reload();
 r.progress=await page.locator('.read-toggle').getAttribute('class');
 if((width===390&&locale==='both')||(width===1440&&locale==='en')){
  await page.locator('pre').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/page-${width}-${theme}-${locale}-code.png`});
  await page.locator('.deck').nth(4).locator('.dot').nth(3).click();
  await page.locator('.deck').nth(4).scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/page-${width}-${theme}-${locale}-failure.png`});
 }
 results.push(r); await page.close();
}
// Actual theme/locale toggles, clipboard, keyboard deck, playback and persistence.
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();await page.goto((process.env.SITE_BASE || 'http://localhost:8765')+'/chapters/ch01.html');
await page.locator('[data-locale-set="en"]').click();await page.locator('[data-theme-set="dracula"]').click();
await page.locator('.code-copy').click();const copied=await page.evaluate(()=>navigator.clipboard.readText());
if(!copied.startsWith('GET product(id)'))throw Error('copy');
const deck=page.locator('.deck').first(); await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
if(await deck.locator('.deck-count').innerText()!=='2 / 4')throw Error('keyboard');
await deck.locator('.deck-speed').click();await deck.locator('.deck-loop').click();
await deck.locator('.deck-toggle').click();await page.waitForTimeout(2200);
const playback=await deck.locator('.deck-count').innerText();if(playback==='2 / 4')throw Error('playback');
await deck.locator('.deck-toggle').click();await page.reload();
const persist=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}));
fs.writeFileSync(out+'/browser-results.json',JSON.stringify({results,errors,interactions:{clipboard:true,keyboard:true,playback,persist}},null,2));
console.log(JSON.stringify({layouts:results.length,errors,playback,persist}));await browser.close();
