import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch24/preview';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result=[];
try {for(const width of [390,1440])for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},{theme});
 await page.goto('http://127.0.0.1:8765/chapters/ch24.html');await page.waitForSelector('.code-copy');
 const cards=page.locator('.cards-grid');await cards.screenshot({path:`${out}/${width}-${theme}-cards.png`});
 const code=page.locator('.code-block').nth(6);await code.evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-145));
 await page.screenshot({path:`${out}/${width}-${theme}-refund-code.png`});
 const deck=page.locator('.deck').nth(4);await deck.locator('.dot').last().click();await deck.screenshot({path:`${out}/${width}-${theme}-refund-final.png`});
 result.push({width,theme,...await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}))});await page.close();
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch24-preview-results.json',JSON.stringify(result,null,2)+'\n')}
console.log(result);
