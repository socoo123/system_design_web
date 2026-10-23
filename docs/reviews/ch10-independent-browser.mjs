import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(path.join(root,'chapters/ch10.html'),'utf8');
const sha=crypto.createHash('sha256').update(source).digest('hex');
if(process.env.CH10_EXPECTED_SHA && sha!==process.env.CH10_EXPECTED_SHA)throw new Error('Wrong review freeze');
const out=path.join(root,'docs/reviews/screenshots/ch10-independent');
fs.mkdirSync(path.join(out,'frames'),{recursive:true});
fs.mkdirSync(path.join(out,'narrow'),{recursive:true});
const result={pageSHA256:sha,frames:[],narrow:[],layouts:[],labels:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
async function open(width,theme,locale){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();
 // Freeze the already-read HTML for the review; live assets are still served locally.
 await page.route('**/chapters/ch10.html',route=>route.fulfill({status:200,contentType:'text/html',body:source}));
 await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
 page.on('pageerror',e=>result.errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://127.0.0.1:8765/chapters/ch10.html');
 await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 return {context,page};
}
try{
 for(const theme of ['parchment','dracula']){
  const {context,page}=await open(1440,theme,'both');
  for(const [d,deck] of (await page.locator('.deck').all()).entries()){
   for(let s=0;s<await deck.locator('.dot').count();s++){
    await deck.locator('.dot').nth(s).click();
    const svg=deck.locator('.slide.is-on svg');
    const id=await svg.locator('title').getAttribute('id');
    await svg.screenshot({path:path.join(out,`frames/d${d+1}s${s+1}-${theme}.png`)});
    result.frames.push({theme,deck:d+1,slide:s+1,id});
    if(d<=1){
     const labels=await svg.evaluate(e=>[...e.querySelectorAll('text')].filter(t=>['POST','202','202 + id'].includes(t.textContent)).map(t=>{const b=t.getBBox();return{text:t.textContent,x:b.x,right:b.x+b.width,boundary:128,gap:128-b.x-b.width};}));
     if(!labels.every(x=>x.right<128))throw new Error('D1/D2 entry label crosses boundary');
     result.labels.push({theme,deck:d+1,slide:s+1,labels});
    }
   }
  }
  await context.close();
  const mobile=await open(390,theme,'both');
  for(const [d,deck]of (await mobile.page.locator('.deck').all()).entries()){
   if(d>2)break;
   for(let s=0;s<await deck.locator('.dot').count();s++){
    await deck.locator('.dot').nth(s).click();
    const slide=deck.locator('.slide.is-on');
    await slide.locator('svg').scrollIntoViewIfNeeded();
    for(const position of ['left','middle','right']){
     const scroll=await slide.evaluate((e,p)=>{const max=e.scrollWidth-e.clientWidth;e.scrollLeft=p==='left'?0:p==='right'?max:max/2;return {scrollLeft:e.scrollLeft,max};},position);
     const box=await slide.locator('svg').boundingBox();
     const y=Math.max(0,Math.floor(box.y));const height=Math.min(1000-y,Math.ceil(box.height)+30);
     await mobile.page.screenshot({path:path.join(out,`narrow/d${d+1}s${s+1}-${theme}-${position}.png`),clip:{x:0,y,width:390,height}});
     result.narrow.push({theme,deck:d+1,slide:s+1,position,...scroll});
    }
   }
  }
  await mobile.context.close();
 }
 for(const width of [320,390,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
  const {context,page}=await open(width,theme,locale);
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,cards:document.querySelectorAll('.cards-grid .flip').length,code:document.querySelectorAll('pre').length,toc:[...document.querySelectorAll('.toc-links a')].every(e=>!!document.getElementById(decodeURIComponent(e.hash.slice(1))))}));
  if(state.width!==width||state.scrollWidth!==width||!state.toc||state.cards!==18||state.code!==6)throw new Error('Page layout/inventory regression');
  const retry=page.locator('pre[data-source="retry.pseudo"]');await retry.scrollIntoViewIfNeeded();
  if(locale==='both')await page.screenshot({path:path.join(out,`${width}-${theme}-retry.png`)});
  result.layouts.push(state);await context.close();
 }
 if(result.errors.length)throw new Error(result.errors.join('\n'));
 result.passed=true;
}catch(error){result.passed=false;result.failure=String(error);process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(path.join(root,'docs/reviews/ch10-independent-browser-results.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({passed:result.passed,frames:result.frames.length,narrow:result.narrow.length,layouts:result.layouts.length,errors:result.errors,failure:result.failure}));
