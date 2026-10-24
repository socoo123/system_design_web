import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const output='docs/reviews/screenshots/ch39-independent/final-browser',cases=[];
for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});await context.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},theme);
 const page=await context.newPage();await page.goto('http://127.0.0.1:8765/chapters/ch39.html');const deck=page.locator('.deck').nth(2);await deck.locator('.dot').last().click();await deck.scrollIntoViewIfNeeded();
 for(const part of ['left','middle','right']){
  const scroll=await deck.locator('.slide.is-on').evaluate((n,part)=>{const max=n.scrollWidth-n.clientWidth;n.scrollLeft=part==='left'?0:part==='right'?max:max/2;return {innerWidth,docWidth:document.documentElement.scrollWidth,left:n.scrollLeft,max}},part);
  const file=`${output}/390-${theme}-both-d3-${part}.png`;await page.screenshot({path:file});cases.push({theme,part,file,...scroll});
 }
 await context.close();
}
for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width:320,height:900},reducedMotion:'reduce'});await context.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},theme);
 const page=await context.newPage();await page.goto('http://127.0.0.1:8765/chapters/ch39.html');await page.waitForSelector('.code-block');
 await page.locator('.code-block').nth(2).evaluate(n=>window.scrollTo(0,n.getBoundingClientRect().top+scrollY-document.querySelector('.topbar').offsetHeight-12));
 const file=`${output}/320-${theme}-both-drain-header.png`;await page.screenshot({path:file});cases.push({theme,width:320,part:'drain header',file});await context.close();
}
await browser.close();fs.writeFileSync('docs/reviews/ch39-independent-focus-results.json',JSON.stringify(cases,null,2)+'\n');
