import fs from 'node:fs';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch24/before-page';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try { for(const width of [390,1440]) for(const theme of ['parchment','dracula']) {
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},{theme});
 await page.goto('http://127.0.0.1:8765/chapters/ch24.html');await page.waitForSelector('.deck-next');
 await page.screenshot({path:`${out}/${width}-${theme}.png`});
 const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));
 results.push(state);await page.close();
}} finally {await browser.close();fs.writeFileSync('docs/reviews/ch24-before-page-results.json',JSON.stringify(results,null,2)+'\n')}
console.log(results);
