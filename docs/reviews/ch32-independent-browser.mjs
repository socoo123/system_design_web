import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const gateOnly=process.argv.includes('--gate-only');
const out=gateOnly?'docs/reviews/screenshots/ch32-independent-gate-browser':'docs/reviews/screenshots/ch32-independent-browser';fs.mkdirSync(out,{recursive:true});
const before=fs.readFileSync('chapters/ch32.html','utf8');
const ids=[...before.matchAll(/<title id="([^"]+)"/g)].map(m=>m[1]);
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync('chapters/ch32.html')).digest('hex');
const result={source_sha256:hash(),layouts:[],copied:0,errors:[],screenshots:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
function require(x,s){if(!x)throw new Error(s);}
try {
 for(const width of [390,1440])for(const theme of ['parchment','dracula'])for(const locale of ['en','both']) {
  const c=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await c.newPage();page.on('pageerror',e=>result.errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)result.errors.push(`${r.status()} ${r.url()}`)});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch32.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>{document.querySelectorAll('details').forEach(e=>e.open=true);return {width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,ids:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),cards:document.querySelectorAll('.cards-grid .flip').length,code:document.querySelectorAll('.code-block').length,toc:[...document.querySelectorAll('.toc-links a')].every(e=>document.getElementById(decodeURIComponent(e.hash.slice(1))))}});
  require(state.width===width&&state.scroll===width,'actual viewport/page overflow');require(state.theme===theme&&state.locale===locale,'settings');require(JSON.stringify(state.ids)===JSON.stringify(ids),'frame identity');require(state.cards===12&&state.code===4&&state.toc,'cards/code/toc');
  let visits=0;
  if(locale==='both') {
   const decks=await page.locator('.deck').all();
   for(let d=0;d<decks.length;d++) {
    if(gateOnly&&d!==0)continue;
    const deck=decks[d];const dots=deck.locator('.dot');const n=await dots.count();
    for(let i=0;i<n;i++) {
     await dots.nth(i).click();visits++;
     require(await deck.locator('.deck-count').innerText()===`${i+1} / ${n}`,'frame index');
     require(await deck.locator('.slide.is-on').count()===1,'one active frame');
     if(width===1440&&([1,2,3,4,6].includes(d+1)||i===n-1)){
      const f=`${out}/d${d+1}f${i+1}-${theme}-desktop.png`;await deck.screenshot({path:f});result.screenshots.push(f);
     }
     if(width===390&&[1,2,3,4,6].includes(d+1))for(const position of ['left','middle','right']) {
      await deck.locator('.slide.is-on').evaluate((e,p)=>e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2,position);
      const f=`${out}/d${d+1}f${i+1}-${theme}-${position}.png`;await deck.screenshot({path:f});result.screenshots.push(f);
     }
    }
   }
  }
  if(!gateOnly&&width===390&&locale==='en')for(let i=0;i<4;i++) {
   const block=page.locator('.code-block').nth(i);await block.evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-115));
   const f=`${out}/code${i+1}-${theme}-en-390.png`;await page.screenshot({path:f});result.screenshots.push(f);
   await block.locator('.code-copy').click();require(await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent(),'copied source mismatch');result.copied++;
  }
  await page.evaluate(()=>scrollTo(0,0));const top=`${out}/top-${width}-${theme}-${locale}.png`;await page.screenshot({path:top});result.screenshots.push(top);
  result.layouts.push({...state,visits});await c.close();
 }
 require(result.errors.length===0,'page/resource error');require(result.source_sha256===hash(),'chapter changed during browser run');result.passed=true;
} catch(e){result.passed=false;result.failure=String(e);process.exitCode=1}
finally {await browser.close();fs.writeFileSync(gateOnly?'docs/reviews/ch32-independent-gate-browser-results.json':'docs/reviews/ch32-independent-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frameVisits:result.layouts.reduce((n,x)=>n+x.visits,0),copied:result.copied,errors:result.errors}));}
