import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const output='docs/reviews/screenshots/ch28-independent/frames';fs.mkdirSync(output,{recursive:true});
const result={sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch28.html')).digest('hex'),frames:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width:1440,height:1600},reducedMotion:'reduce'});
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch28.html');await page.waitForSelector('.deck-next');
  for(const number of [5,6]){
   const deck=page.locator('.deck').nth(number-1);const count=await deck.locator('.dot').count();
   for(let i=0;i<count;i++){
    await deck.locator('.dot').nth(i).click();
    await deck.screenshot({path:`${output}/d${number}s${i+1}-${theme}.png`});
    result.frames.push({number,frame:i+1,theme,caption:await deck.locator('.slide.is-on figcaption').innerText()});
   }
  }
  await page.close();
 }
}finally{await browser.close();}
fs.writeFileSync('docs/reviews/ch28-independent-frames-results.json',JSON.stringify(result,null,2)+'\n');console.log(`Captured ${result.frames.length} real-page frames`);
