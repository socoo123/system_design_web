import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch35-author/capacity-label';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch35.html')).digest('hex'),layouts:[]};
try{for(const width of [390,1440])for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const page=await context.newPage();
 await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','en')},{theme});
 await page.goto('http://127.0.0.1:8765/chapters/ch35.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const deck=page.locator('.deck').nth(2);
 for(const frame of [2,4]){await deck.locator('.dot').nth(frame-1).click();await deck.screenshot({path:`${out}/${width}-${theme}-d3f${frame}.png`});}
 const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,title:document.querySelector('#d3s2t').textContent,desc:document.querySelector('#d3s4d').textContent}));
 if(state.width!==width||state.scrollWidth!==width||state.title.includes('benchmark')||state.desc.includes('benchmark'))throw Error(JSON.stringify(state));
 result.layouts.push({width,theme,...state});await context.close();
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch35-capacity-label-browser-results.json',JSON.stringify(result,null,2)+'\n')}
console.log('4 real layouts / 8 directed frame visits passed');
