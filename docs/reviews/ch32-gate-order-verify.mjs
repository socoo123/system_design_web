import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch32-gate-order';fs.mkdirSync(out,{recursive:true});
const results={html_sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch32.html')).digest('hex'),layouts:[],passed:false};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const width of [390,1440]) for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  await page.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch32.html');await page.waitForSelector('.deck-next');
  const deck=page.locator('.deck').first();let visits=0;
  for(let i=0;i<5;i++){
   await deck.locator('.dot').nth(i).click();
   if(await deck.locator('.deck-count').innerText()!==`${i+1} / 5`)throw Error('frame navigation');
   visits++;
  }
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,order:document.querySelector('#d1s5t').closest('svg').textContent}));
  if(state.innerWidth!==width||state.scrollWidth!==width||!state.order.includes('reuse check → upstream admission → quota hold'))throw Error('gate order / layout');
  const file=`${out}/${width}-${theme}-d1f5.png`;await deck.screenshot({path:file});
  results.layouts.push({width,theme,visits,innerWidth:state.innerWidth,scrollWidth:state.scrollWidth,file});await page.close();
 }
 results.passed=true;
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch32-gate-order-browser-results.json',JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({passed:results.passed,layouts:results.layouts.length,visits:results.layouts.reduce((n,x)=>n+x.visits,0)}));
