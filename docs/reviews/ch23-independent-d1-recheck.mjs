import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const source=fs.readFileSync('chapters/ch23.html','utf8');
const hash=crypto.createHash('sha256').update(source).digest('hex');
if(hash!=='a11d47a087fb24fa0dc961055f50e325aadb0653d7e162766140aa576c71dac2')throw new Error('Review target changed');
const out='docs/reviews/screenshots/ch23-independent/d1-recheck';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={sha256:hash,frames:[],layouts:[],errors:[]};
const check=(b,m)=>{if(!b)throw new Error(m)};
try{
 const frames=[...source.match(/<figure class="deck">[\s\S]*?<\/figure>/)[0].matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(x=>x[0]);
 for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
  for(let i=0;i<frames.length;i++){
   await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${frames[i]}</body></html>`);
   await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/d1s${i+1}-${theme}.png`});
   const labels=await page.evaluate(()=>[...document.querySelectorAll('text')].filter(e=>['match','result','ACK checkpoint only after apply'].includes(e.textContent)).map(e=>{const b=e.getBBox();return {text:e.textContent,x:b.x,y:b.y,width:b.width,right:b.x+b.width}}));
   check(labels.filter(x=>x.text!=='ACK checkpoint only after apply').every(x=>x.right<110),'entry label still crosses authority boundary');
   if(i===4)check(labels.find(x=>x.text==='ACK checkpoint only after apply').right<630,'ACK note still approaches x648 wire');
   result.frames.push({theme,frame:i+1,labels});
  }await page.close();
 }
 for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
  const page=await browser.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>result.errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(r.status()+' '+r.url())});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch23.html');await page.waitForSelector('.deck-next');
  const deck=page.locator('.deck').first();let visits=0;
  for(let i=0;i<5;i++){
   await deck.locator('.dot').nth(i).click();check(await deck.locator('.deck-count').innerText()===`${i+1} / 5`,'frame navigation');visits++;
   if(locale==='both')for(const position of ['left','middle','right']){
    await deck.locator('.slide.is-on').evaluate((e,p)=>{e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2},position);
    await deck.screenshot({path:`${out}/390-${theme}-d1s${i+1}-${position}.png`});
   }
  }
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));
  check(state.innerWidth===390&&state.scrollWidth===390,'true viewport/overflow');result.layouts.push({...state,frameVisits:visits});await page.close();
 }
 check(result.errors.length===0,JSON.stringify(result.errors));result.passed=true;
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch23-independent-d1-recheck-results.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:result.passed,frames:result.frames.length,layouts:result.layouts.length,errors:result.errors}));
