import fs from 'node:fs';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const output='docs/reviews/screenshots/ch02-independent';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try {
 for(const width of [390,1440]) for(const theme of ['parchment','dracula']) {
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
 await page.goto('http://127.0.0.1:8765/chapters/ch02.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(state.innerWidth!==width || state.scrollWidth!==width) throw Error('overflow');results.push({width,theme,...state});
 for(const d of [1,4]) {
 const deck=page.locator('.deck').nth(d);
 for(let f=0;f<5;f++) {await deck.locator('.dot').nth(f).click();if(width===1440)await deck.locator('.slide.is-on svg').screenshot({path:`${output}/${theme}-d${d+1}s${f+1}.png`});}
 if(width===390) {await deck.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${theme}-390-d${d+1}.png`});await deck.locator('.slide.is-on').evaluate(e=>{e.scrollLeft=e.scrollWidth;});await page.screenshot({path:`${output}/${theme}-390-d${d+1}-right.png`});}
 }
 await context.close();
 }
}finally{await browser.close();fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2)+'\n');}
console.log('PASS independent layouts and B/E traversal');
