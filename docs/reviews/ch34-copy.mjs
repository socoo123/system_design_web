import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const output='docs/reviews/screenshots/ch34-author-copy';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={pageHash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch34.html')).digest('hex'),layouts:[]};
try{for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
 const context=await browser.newContext({viewport:{width:320,height:1000}});
 const page=await context.newPage();await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch34.html');await page.waitForSelector('.code-copy');await page.evaluate(()=>document.fonts.ready);
 const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.code-copy')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,text:e.innerText}))}));
 if(state.width!==320||state.scrollWidth!==320||state.buttons.some(e=>e.height>=40))throw new Error('Copy wraps at 320');
 result.layouts.push({theme,locale,...state});
 for(const i of [1,2,3]){const block=page.locator('.code-block').nth(i);await block.evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-document.querySelector(".topbar").getBoundingClientRect().height-20));await page.screenshot({path:`${output}/320-${theme}-${locale}-code${i+1}.png`});}
 await context.close();
}result.passed=true;}finally{await browser.close();fs.writeFileSync('docs/reviews/ch34-copy-results.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({passed:result.passed,layouts:result.layouts.length,heights:[...new Set(result.layouts.flatMap(x=>x.buttons.map(b=>b.height)))]}));
