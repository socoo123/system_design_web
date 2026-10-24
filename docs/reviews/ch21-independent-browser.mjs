import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const base='http://127.0.0.1:8765';
const out='docs/reviews/screenshots/ch21/independent';fs.mkdirSync(out,{recursive:true});
const result={layouts:[],frames:[],copies:0,interactions:[],errors:[]};
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const width of [390,1440])for(const theme of ['parchment','dracula'])for(const locale of ['en','both']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))result.errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto(base+'/chapters/ch21.html');await page.waitForSelector('.code-copy');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,locale:document.documentElement.dataset.locale,theme:document.documentElement.dataset.theme,flashcards:document.querySelectorAll('.cards-grid .flip').length,flashDisplay:getComputedStyle(document.querySelector('.cards-grid')).display}));
  assert(state.innerWidth===width&&state.scrollWidth===width,'viewport overflow');
  assert(state.theme===theme&&state.locale===locale&&state.flashcards===14&&state.flashDisplay==='grid','theme/lang/cards');result.layouts.push(state);
  const d4=page.locator('.deck').nth(3);
  if(locale==='both')for(let frame=0;frame<5;frame++){
   await d4.locator('.dot').nth(frame).click();await d4.scrollIntoViewIfNeeded();
   const slide=d4.locator('.slide.is-on');
   assert((await d4.locator('.deck-count').innerText())===`${frame+1} / 5`,'D4 frame number');
   if(width===1440){const file=path.join(out,`d4s${frame+1}-${theme}.png`);await slide.locator('svg').screenshot({path:file});result.frames.push({width,theme,frame:frame+1,file});}
   else for(const[position,fraction]of[['left',0],['middle',.5],['right',1]]){
    await slide.evaluate((el,fraction)=>el.scrollLeft=(el.scrollWidth-el.clientWidth)*fraction,fraction);
    const file=path.join(out,`d4s${frame+1}-${theme}-${position}.png`);const bounds=await slide.boundingBox();const board=await slide.locator('svg').boundingBox();
    await page.screenshot({path:file,clip:{x:bounds.x,y:board.y,width:bounds.width,height:board.height}});
    result.frames.push({width,theme,frame:frame+1,position,file,geometry:await slide.evaluate(el=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,container:el.clientWidth,content:el.scrollWidth,left:el.scrollLeft}))});
   }
  }
  const d5=page.locator('.deck').nth(4);await d5.locator('.dot').nth(3).click();
  const d5slide=d5.locator('.slide.is-on');await d5slide.evaluate(el=>el.scrollLeft=0);
  const caption=await d5slide.locator('figcaption').textContent();
  assert(caption.includes('CONFIRMED')&&caption.includes('CANCELLED')&&caption.includes('REJECTED')&&caption.includes('RELEASED'),'D5F4 outcome scope');
  if(width===390){await d5slide.locator('figcaption').screenshot({path:path.join(out,`d5f4-caption-${theme}-${locale}.png`)});}
  if(width===1440&&locale==='en'){
   for(const block of await page.locator('.code-block').all()){
    await block.locator('.code-copy').click();assert(await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent(),'copy source mismatch');result.copies++;
   }
   await page.emulateMedia({reducedMotion:'no-preference'});
   const first=page.locator('.deck').first();await first.locator('.dot').first().click();await first.focus();await page.keyboard.press('ArrowRight');assert((await first.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard');
   await first.locator('.deck-speed').click();await first.locator('.deck-loop').click();await first.locator('.deck-toggle').click();
   await page.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:7000});await first.locator('.deck-toggle').click();
   const flash=page.locator('.flip').nth(7);await flash.focus();await page.keyboard.press('Enter');assert((await flash.getAttribute('class')).includes('is-flipped'),'flash Enter');await page.keyboard.press('Space');assert(!(await flash.getAttribute('class')).includes('is-flipped'),'flash Space');
   await page.locator('.read-toggle').click();await page.reload();assert(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','progress persistence');
   assert(await page.evaluate(()=>document.documentElement.dataset.theme===localStorage.getItem('sd-theme')&&document.documentElement.dataset.locale==='en'),'settings persistence');
   result.interactions.push({theme,keyboard:true,playback:true,flashcards:true,progress:true,preferences:true});
  }
  if(width===390){
   await page.locator('.code-block').last().evaluate(el=>el.scrollIntoView({block:'start'}));await page.evaluate(()=>scrollBy(0,-140));
   await page.screenshot({path:path.join(out,`events-${width}-${theme}-${locale}.png`)});
  }
  await context.close();
 }
 for(const theme of ['parchment','dracula']){
  for(const kind of ['desktop','narrow']){
   const files=Array.from({length:5},(_,i)=>kind==='desktop'?[`d4s${i+1}-${theme}.png`]:['left','middle','right'].map(p=>`d4s${i+1}-${theme}-${p}.png`)).flat();
   const images=files.map(file=>`<figure><figcaption>${file}</figcaption><img src="data:image/png;base64,${fs.readFileSync(path.join(out,file)).toString('base64')}"></figure>`).join('');
   const page=await browser.newPage({viewport:{width:kind==='desktop'?1920:1080,height:1500}});
   await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:${kind==='desktop'?'1fr 1fr':'1fr 1fr 1fr'};gap:5px;background:#ddd;font:14px sans-serif}figure{margin:0;background:white}img{width:100%;display:block}</style>${images}`);
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,`d4-${theme}-${kind}-contact.png`),fullPage:true});await page.close();
  }
 }
 assert(result.errors.length===0,'browser errors');result.passed=true;
}catch(error){result.passed=false;result.failure=String(error);process.exitCode=1;}
finally{await browser.close();result.htmlSha256=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch21.html')).digest('hex');fs.writeFileSync('docs/reviews/ch21-independent-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frames:result.frames.length,copies:result.copies,errors:result.errors}));}
