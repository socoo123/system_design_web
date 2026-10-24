import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch29-author/quota';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const width of [390,1440])for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width,height:1600},reducedMotion:'reduce'});
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','en');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch29.html');await page.waitForSelector('.code-copy');
  const block=page.locator('pre[data-source="reject.pseudo"]').locator('..');
  await block.screenshot({path:`${out}/${width}-${theme}-reject.png`});await page.close();
 }
}finally{await browser.close();}
console.log('4 final rejection snippets captured in real page');
