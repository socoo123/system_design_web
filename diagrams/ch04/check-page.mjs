import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const browser=await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
for(const width of [1440,768,390,320])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)}, {theme,locale});
 await page.goto((process.env.SITE_BASE || 'http://127.0.0.1:8765')+'/chapters/ch04.html');await page.evaluate(()=>document.fonts.ready);
 const dimensions=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));
 if(dimensions.innerWidth!==width||dimensions.scrollWidth>width)throw Error('Page overflow '+JSON.stringify(dimensions));
 if(width===1440||width===390)await page.screenshot({path:`docs/reviews/screenshots/ch04/page-${width}-${theme}-${locale}-top.png`});
 const code=page.locator('pre').first();await code.scrollIntoViewIfNeeded();
 const codeScroll=await code.evaluate(e=>{e.scrollLeft=e.scrollWidth;return e.scrollLeft});
 if(width===390||width===1440)await page.screenshot({path:`docs/reviews/screenshots/ch04/page-${width}-${theme}-${locale}-code.png`});
 for(let d=0;d<5;d++){
  const deck=page.locator('.deck').nth(d);await deck.locator('.dot').last().click();
  if(width===390&&(d===0||d===4)&&locale==='zh'){
   await deck.scrollIntoViewIfNeeded();await page.screenshot({path:`docs/reviews/screenshots/ch04/page-${width}-${theme}-d${d+1}.png`});
   await deck.locator('.slide.is-on').evaluate(e=>e.scrollLeft=e.scrollWidth);
   await page.screenshot({path:`docs/reviews/screenshots/ch04/page-${width}-${theme}-d${d+1}-right.png`});
  }
 }
 if(errors.length)throw Error(errors.join(';'));
 results.push({...dimensions,codeScroll,errors});await page.close();
}
fs.writeFileSync('docs/reviews/ch04-page-results.json',JSON.stringify(results,null,2));
await browser.close();console.log(JSON.stringify({combinations:results.length,overflow:0,errors:0}));
