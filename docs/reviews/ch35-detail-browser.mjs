import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const output='docs/reviews/screenshots/ch35-author/details';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch35.html')).digest('hex'),layouts:[]};
try {for(const [width,locale] of [[320,'en'],[390,'both'],[1440,'both']])for(const theme of ['parchment','dracula']) {
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch35.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 await page.locator('details:not(.toc)').evaluate(e=>e.open=true);
 for(const [label,selector] of [['table','table'],['admission','h3'],['cards','.cards-grid']]) {
  await page.locator(selector).first().evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-140,behavior:'instant'}));
  await page.screenshot({path:`${output}/${width}-${theme}-${locale}-${label}.png`});
 }
 const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,table:{scroll:document.querySelector('table').scrollWidth,client:document.querySelector('table').clientWidth},visibleTableChinese:[...document.querySelectorAll('table .lang-zh')].some(e=>e.getClientRects().length)}));
 if(state.width!==width||state.scrollWidth!==width||(locale==='en'&&state.visibleTableChinese))throw Error(JSON.stringify(state));
 result.layouts.push({width,locale,theme,...state});await context.close();
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch35-detail-browser-results.json',JSON.stringify(result,null,2)+'\n')}
console.log('6 detail layouts captured');
