import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const phase=process.argv[2]||'after';
const out=`docs/reviews/screenshots/ch05/${phase}`; fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results={phase,frames:[],layouts:[],errors:[]};
for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',e=>results.errors.push(e.message));
 await page.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','both')},theme);
 await page.goto('http://127.0.0.1:8765/chapters/ch05.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 let d=0;
 for(const deck of await page.locator('.deck').all()){
  d++;let s=0;
  for(const dot of await deck.locator('.dot').all()){
   s++;await dot.click();const svg=deck.locator('.slide.is-on svg');await svg.screenshot({path:`${out}/${theme}-d${d}s${s}.png`});results.frames.push({theme,deck:d,slide:s,title:await svg.locator('title').textContent()});
  }
 }
 await page.close();
}
if(phase==='after')for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch05.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));
 if(state.width!==width||state.scrollWidth!==width)results.errors.push(`overflow ${width}/${theme}/${locale}`);results.layouts.push(state);
 if(locale==='both'){
  await page.screenshot({path:`${out}/${width}-${theme}-top.png`});
  for(const [label,target] of [['code',page.locator('pre').first()],['handoff',page.locator('pre').last()],['deck',page.locator('.deck').last()]]){await target.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}-${theme}-${label}.png`})}
 }
 await page.close();
}
await browser.close();fs.writeFileSync(`docs/reviews/ch05-${phase}-browser.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({phase,frames:results.frames.length,layouts:results.layouts.length,errors:results.errors}));
