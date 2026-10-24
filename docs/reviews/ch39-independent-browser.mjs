import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch39-independent/final-browser';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={sourceSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch39.html')).digest('hex'),combos:[],copies:[],errors:[]};
function assert(ok,message){if(!ok)throw new Error(message)}
for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(({theme,locale})=>{if(!localStorage.getItem('sd-theme'))localStorage.setItem('sd-theme',theme);if(!localStorage.getItem('sd-locale'))localStorage.setItem('sd-locale',locale)},{theme,locale});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`)});
 await page.goto('http://127.0.0.1:8765/chapters/ch39.html');await page.waitForSelector('.deck-bar');
 const id=`${width}-${theme}-${locale}`;const r={width,theme,locale,frames:0,tableScroll:0,diagramScroll:0};
 assert(await page.locator('html').getAttribute('data-theme')===theme,`${id}:theme`);
 assert(await page.locator('html').getAttribute('data-locale')===locale,`${id}:locale`);
 await page.screenshot({path:`${out}/${id}-top.png`});
 for(const sum of await page.locator('.chapter > section details > summary').all())await sum.click();
 r.layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
 assert(r.layout.innerWidth===width,`${id}:real viewport`);assert(r.layout.scrollWidth<=width+1,`${id}:document overflow`);
 r.controls=await page.locator('.code-copy').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,text:n.innerText})));
 assert(r.controls.length===3 && r.controls.every(c=>c.width>=28&&c.height<40),`${id}:single line Copy`);
 // Every original frame is reached through its actual browser button handler.
 r.frames=await page.evaluate(()=>{let n=0;for(const d of document.querySelectorAll('.deck'))for(const [i,dot] of [...d.querySelectorAll('.dot')].entries()){dot.click();const on=d.querySelectorAll('.slide.is-on');if(on.length!==1||[...d.querySelectorAll('.slide')].indexOf(on[0])!==i)throw Error('bad frame');n++}return n});
 assert(r.frames===37,`${id}:frames`);
 const d=page.locator('.deck').first();await d.locator('.deck-prev').click();await d.focus();await page.keyboard.press('ArrowLeft');
 assert(await d.locator('.deck-count').innerText()==='3 / 5',`${id}:prev and keyboard`);
 r.diagramScroll=await page.locator('.deck .slide.is-on').evaluateAll(nodes=>nodes.map(n=>{const end=n.scrollWidth-n.clientWidth;n.scrollLeft=end;const actual=n.scrollLeft;n.scrollLeft=0;return {client:n.clientWidth,width:n.scrollWidth,end,actual}}));
 // Figure clipping belongs inside each .slide, never on the whole document.
 assert(r.diagramScroll.every(s=>s.end<=1||s.actual>0),`${id}:diagram horizontal scroll`);
 r.tableScroll=await page.locator('.table-scroll').evaluateAll(nodes=>nodes.map(n=>{const end=n.scrollWidth-n.clientWidth;n.scrollLeft=end;const actual=n.scrollLeft;n.scrollLeft=0;return{end,actual}}));
 assert(r.tableScroll.every(s=>s.end<=1||s.actual>0),`${id}:table scroll`);
 for(const pre of await page.locator('pre').all()){
   await pre.scrollIntoViewIfNeeded();const size=await pre.evaluate(n=>{n.scrollLeft=n.scrollWidth;let v={width:n.clientWidth,scrollWidth:n.scrollWidth,left:n.scrollLeft};n.scrollLeft=0;return v});
   assert(size.scrollWidth<=size.width+1||size.left>0,`${id}:code scroll`);
 }
 const card=page.locator('.cards-grid .flip').first();await card.click();assert(await card.getAttribute('aria-expanded')==='true',`${id}:flip open`);await card.click();
 const done=page.locator('.read-toggle');await done.click();assert(await done.getAttribute('aria-pressed')==='true',`${id}:progress`);
 if(width===1440&&theme==='parchment'&&locale==='both')for(let i=0;i<3;i++){
   await page.locator('.code-copy').nth(i).click();const expected=await page.locator('pre').nth(i).textContent();const clipboard=await page.evaluate(()=>navigator.clipboard.readText());assert(clipboard===expected,`${id}:copy ${i}`);report.copies.push({source:await page.locator('pre').nth(i).getAttribute('data-source'),characters:clipboard.length,exact:true});
 }
 if(width<=390&&locale==='both'){
  await page.locator('.code-block').nth(2).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${id}-code.png`});
  await page.locator('.cards-grid').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${id}-cards.png`});
  const last=page.locator('.deck').last();await last.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${id}-diagram-left.png`});
  await last.locator('.slide.is-on').evaluate(n=>n.scrollLeft=n.scrollWidth);await page.screenshot({path:`${out}/${id}-diagram-right.png`});
 }
 await page.reload();assert(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true',`${id}:persist progress`);
 const otherTheme=theme==='dracula'?'parchment':'dracula',otherLocale=locale==='en'?'zh':'en';
 await page.locator(`[data-theme-set="${otherTheme}"]`).click();await page.locator(`[data-locale-set="${otherLocale}"]`).click();
 assert(await page.locator('html').getAttribute('data-theme')===otherTheme,`${id}:theme button`);assert(await page.locator('html').getAttribute('data-locale')===otherLocale,`${id}:locale button`);
 await page.reload();assert(await page.locator('html').getAttribute('data-theme')===otherTheme,`${id}:theme persists`);assert(await page.locator('html').getAttribute('data-locale')===otherLocale,`${id}:locale persists`);
 report.combos.push(r);await context.close();console.log(id);
}
// Normal-motion controls, playback, speed and loop are exercised separately.
const c=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'no-preference'});const page=await c.newPage();await page.goto('http://127.0.0.1:8765/chapters/ch39.html');const d=page.locator('.deck').first();await d.locator('.dot').first().click();await d.locator('.deck-speed').click();await d.locator('.deck-loop').click();await d.locator('.deck-toggle').click();await page.waitForTimeout(1400);const count=await d.locator('.deck-count').innerText();assert(count!=='1 / 5','playback advances');await d.locator('.deck-toggle').click();report.play={viewport:390,count,speed:await d.locator('.deck-speed').innerText(),loop:await d.locator('.deck-loop').innerText(),paused:await d.locator('.deck-toggle').getAttribute('aria-pressed')==='false'};await c.close();
await browser.close();assert(report.errors.length===0,report.errors.join('\n'));fs.writeFileSync('docs/reviews/ch39-independent-browser-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({combos:report.combos.length,frames:report.combos.reduce((a,c)=>a+c.frames,0),copies:report.copies.length,errors:report.errors.length}));
