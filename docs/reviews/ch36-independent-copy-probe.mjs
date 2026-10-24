import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch36-independent/copy';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch36.html')).digest('hex'),layouts:[]};
try{for(const width of [320,390])for(const theme of ['parchment','dracula'])for(const locale of ['en','both']){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch36.html');await page.waitForSelector('.code-copy');await page.evaluate(()=>document.fonts.ready);
 const blocks=[];for(let i=0;i<await page.locator('.code-block').count();i++){
  const block=page.locator('.code-block').nth(i);await block.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-140,behavior:'instant'}));
  const geometry=await block.locator('.code-copy').evaluate(e=>({height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width,text:e.textContent,label:e.closest('.code-block').querySelector('pre').dataset.language}));
  await page.screenshot({path:`${out}/${width}-${theme}-${locale}-code${i+1}.png`});blocks.push(geometry);
 }result.layouts.push({width,theme,locale,blocks});await context.close();
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch36-independent-copy-results.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify(result.layouts));
