import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const out='docs/reviews/screenshots/ch29-independent-browser';let views=[];
try{for(const width of [390,1440])for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();
 await p.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','en');},{theme});
 await p.goto('http://127.0.0.1:8765/chapters/ch29.html');await p.waitForSelector('.code-copy');await p.evaluate(()=>document.fonts.ready);
 const b=p.locator('pre[data-source="reject.pseudo"]');await b.evaluate(e=>e.closest('.code-block').id='review-reject');
 await p.locator('#review-reject').screenshot({path:`${out}/reject-${width}-${theme}.png`});
 const state=await p.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,codeBlocks:document.querySelectorAll('pre').length,copyButton:(()=>{const b=document.querySelector('#review-reject .code-copy');return {height:b.clientHeight,lineHeight:parseFloat(getComputedStyle(b).lineHeight),text:b.textContent};})()}));
 if(state.width!==width||state.pageWidth!==width||state.codeBlocks!==7||state.copyButton.height>state.copyButton.lineHeight+20)throw Error('Final code layout');views.push({theme,...state});await context.close();
}}finally{await browser.close();}
fs.writeFileSync('docs/reviews/ch29-independent-final-ui-results.json',JSON.stringify({passed:true,htmlSHA256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch29.html')).digest('hex'),views},null,2)+'\n');
console.log(JSON.stringify({passed:true,views:views.length}));
