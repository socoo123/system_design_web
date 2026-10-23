import fs from 'node:fs';
import path from 'node:path';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out=path.resolve('docs/reviews/screenshots/ch05-independent');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result=[];
for(const width of [390,1440])for(const theme of ['parchment','dracula']) {
 const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await ctx.newPage();
 await p.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},theme);
 await p.goto('http://127.0.0.1:8765/chapters/ch05.html');await p.waitForSelector('.deck-next');await p.evaluate(()=>document.fonts.ready);
 const dims=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 if(dims.width!==width||dims.scrollWidth!==width)throw Error('overflow');
 const deck=p.locator('.deck').nth(4);
 for(let i=0;i<5;i++) {
  await deck.locator('.dot').nth(i).click();await deck.scrollIntoViewIfNeeded();
  if(width===1440)await deck.locator('.slide.is-on svg').screenshot({path:path.join(out,`d5s${i+1}-${theme}.png`)});
  else {await p.screenshot({path:path.join(out,`390-d5s${i+1}-${theme}.png`)});await deck.locator('.slide.is-on').evaluate(el=>el.scrollLeft=el.scrollWidth);await p.screenshot({path:path.join(out,`390-d5s${i+1}-${theme}-right.png`)});}
 }
 result.push({width,theme,...dims,frames:5});await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log('PASS independent D5: '+JSON.stringify(result));
