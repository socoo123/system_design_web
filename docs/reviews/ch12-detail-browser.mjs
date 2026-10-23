import fs from 'node:fs';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch12/details';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
for(const [width,theme,locale] of [[390,'parchment','both'],[390,'dracula','en'],[320,'parchment','zh'],[1440,'dracula','en'],[1440,'parchment','both']]){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch12.html');await page.evaluate(()=>document.fonts.ready);
 for(const name of ['submit.pseudo','receive.pseudo','receipt.pseudo']){
  const block=page.locator(`pre[data-source="${name}"]`);await block.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${width}-${theme}-${locale}-${name.split('.')[0]}.png`});
  if(width<400){await block.evaluate(e=>e.scrollLeft=e.scrollWidth);await page.screenshot({path:`${out}/${width}-${theme}-${locale}-${name.split('.')[0]}-right.png`});}
 }
 const cards=page.locator('.cards-grid');await cards.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${theme}-${locale}-cards.png`});
 const cardState=await cards.evaluate(e=>({count:e.querySelectorAll('.flip').length,width:e.getBoundingClientRect().width,grid:getComputedStyle(e).display}));
 if(cardState.count!==15||cardState.grid!=='grid')throw new Error('flashcard grid');
 const d=page.locator('.deck').last();await d.locator('.dot').last().click();await d.scrollIntoViewIfNeeded();
 await page.screenshot({path:`${out}/${width}-${theme}-${locale}-d6-left.png`});
 const shape=await d.locator('.slide.is-on').evaluate(e=>({clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}));
 if(width<400){await d.locator('.slide.is-on').evaluate(e=>e.scrollLeft=e.scrollWidth);await page.screenshot({path:`${out}/${width}-${theme}-${locale}-d6-right.png`});}
 results.push({width,theme,locale,...await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth})),cards:cardState,diagram:shape});
 await context.close();
}
await browser.close();fs.writeFileSync('docs/reviews/ch12-detail-browser-results.json',JSON.stringify({passed:true,results},null,2)+'\n');console.log(JSON.stringify({passed:true,contexts:results.length}));
