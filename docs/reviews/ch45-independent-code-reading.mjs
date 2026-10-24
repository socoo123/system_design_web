import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch45-independent/reading';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-gpu']});
const result=[];
for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
 await page.goto('http://127.0.0.1:8765/chapters/ch45.html');await page.waitForSelector('.code-block');await page.evaluate(()=>document.fonts.ready);
 const code=page.locator('.code-block').last();
 await code.evaluate(e=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top-150,behavior:'instant'}));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const file=path.join(out,`${theme}-consume-code.png`);await page.screenshot({path:file,animations:'disabled'});
 const state=await code.evaluate(e=>({pageWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,preWidth:e.querySelector('pre').clientWidth,preScrollWidth:e.querySelector('pre').scrollWidth,overflow:getComputedStyle(e.querySelector('pre')).overflowX,codeBackground:getComputedStyle(e.querySelector('code')).backgroundColor,preBackground:getComputedStyle(e.querySelector('pre')).backgroundColor}));
 result.push({theme,file,...state});await page.close();
}
await browser.close();fs.writeFileSync('docs/reviews/ch45-independent-code-reading-results.json',JSON.stringify({passed:result.every(r=>r.pageWidth===390&&r.scrollWidth===390&&r.overflow==='auto'),result},null,2)+'\n');console.log(JSON.stringify(result));
