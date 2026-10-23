// Independent review: fulfill a frozen HTML byte string; write only reviewer evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const label=process.env.REVIEW_LABEL||'initial';
const html=fs.readFileSync(process.env.REVIEW_HTML||'chapters/ch17.html','utf8');
const sha=crypto.createHash('sha256').update(html).digest('hex');
const out=`docs/reviews/screenshots/ch17-independent/${label}`;
fs.mkdirSync(out,{recursive:true});
const original=fs.readFileSync('docs/reviews/ch16-ch17-ch18-baseline/ch17.html','utf8');
const ids=s=>[...s.matchAll(/<title id="([^\"]+)"/g)].map(m=>m[1]);
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
assert(JSON.stringify(ids(original))===JSON.stringify(ids(html)),'baseline frame title ids/order');
const result={htmlSha256:sha,label,layouts:[],interactions:[],frames:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
async function prepare(width,theme,locale,clipboard=false){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:clipboard?'no-preference':'reduce',permissions:clipboard?['clipboard-read','clipboard-write']:[]});
 await context.route('**/chapters/ch17.html',route=>route.fulfill({body:html,contentType:'text/html'}));
 const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(`${r.status()} ${r.url()}`);});
 await page.addInitScript(({theme,locale})=>{if(localStorage.getItem('sd-theme')===null)localStorage.setItem('sd-theme',theme);if(localStorage.getItem('sd-locale')===null)localStorage.setItem('sd-locale',locale);},{theme,locale});
 await page.goto('http://127.0.0.1:8765/chapters/ch17.html');
 await page.evaluate(()=>document.fonts.ready);return {context,page};
}
try {
 for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
  const {context,page}=await prepare(width,theme,locale);
  await page.evaluate(()=>document.querySelectorAll('article details').forEach(e=>e.open=true));
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,
   theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
   frames:[...document.querySelectorAll('.deck .slide svg title')].map(e=>e.id),
   code:[...document.querySelectorAll('pre')].map(e=>({kind:e.dataset.kind,source:e.dataset.source,language:e.dataset.language})),
   cards:document.querySelectorAll('.cards-grid .flip').length,
   links:[...document.querySelectorAll('.toc-links a')].every(e=>!!document.getElementById(e.hash.slice(1))),
   englishCodeHasChinese:document.documentElement.dataset.locale==='en'&&[...document.querySelectorAll('pre')].some(e=>/[\u3400-\u9fff]/.test(e.textContent))}));
  assert(state.innerWidth===width&&state.scrollWidth===width,'whole-page overflow');
  assert(state.theme===theme&&state.locale===locale,'preference mismatch');
  assert(JSON.stringify(state.frames)===JSON.stringify(ids(original)),'live frame ids/order');
  assert(state.code.length===5&&state.code.every(e=>e.kind&&e.source&&e.language),'code nature/source labels');
  assert(state.cards===12&&state.links&&!state.englishCodeHasChinese,'cards/TOC/English code');
  let visits=0;
  if([390,1440].includes(width)&&locale==='both'){
   for(const [d,deck] of (await page.locator('.deck').all()).entries())for(const [f,dot] of (await deck.locator('.dot').all()).entries()){
    await dot.click();assert(await deck.locator('.slide.is-on').count()===1,'one active frame');visits++;
    if(width===1440)await deck.locator('.slide.is-on svg').screenshot({path:`${out}/d${d+1}s${f+1}-${theme}.png`});
    if(width===390&&[1,3].includes(d))for(const position of ['left','middle','right']){
     await deck.locator('.slide.is-on').evaluate((e,p)=>{e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;},position);
     await deck.screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-${position}-390.png`});
    }
    result.frames.push({id:`d${d+1}s${f+1}`,width,theme});
   }
   const pre=page.locator('pre').last();
   await pre.evaluate(e=>{const t=document.querySelector('.topbar').getBoundingClientRect().height;scrollTo({top:e.closest('.code-block').getBoundingClientRect().top+scrollY-t-16,behavior:'instant'});});
   await page.waitForTimeout(100);await page.screenshot({path:`${out}/${width}-${theme}-code.png`});
  }
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`${out}/${width}-${theme}-${locale}-top.png`});
  result.layouts.push({...state,width,theme,locale,visits});await context.close();
 }
 const {context,page}=await prepare(1440,'parchment','zh',true);
 await page.locator('[data-locale-set="en"]').click();await page.locator('[data-theme-set="dracula"]').click();
 let copied=0;
 for(const block of await page.locator('.code-block').all()){
  await block.locator('.code-copy').click();
  assert(await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent(),'copy fidelity');copied++;
 }
 const deck=page.locator('.deck').first();await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
 assert((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard');
 await deck.locator('.deck-speed').click();await deck.locator('.deck-loop').click();await deck.locator('.deck-toggle').click();
 await page.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:6000});await deck.locator('.deck-toggle').click();
 await page.locator('.flip').first().click();assert((await page.locator('.flip').first().getAttribute('class')).includes('is-flipped'),'flip');
 await page.locator('.read-toggle').click();await page.reload();
 assert(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','progress persistence');
 assert(await page.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'),'setting persistence');
 result.interactions.push({copied,keyboard:true,playback:true,cards:true,progress:true,settings:true});await context.close();
 assert(result.errors.length===0,JSON.stringify(result.errors));result.passed=true;
}catch(e){result.passed=false;result.failure=String(e);process.exitCode=1;}finally{
 await browser.close();fs.writeFileSync(`docs/reviews/ch17-independent-browser-${label}-results.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({passed:result.passed,sha,layouts:result.layouts.length,frameVisits:result.frames.length,interactions:result.interactions,failure:result.failure,errors:result.errors}));
}
