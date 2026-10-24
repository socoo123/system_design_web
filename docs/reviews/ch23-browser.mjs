import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';

const baseline=JSON.parse(fs.readFileSync('docs/reviews/ch22-ch23-ch24-baseline.json')).chapters.ch23;
const out='docs/reviews/screenshots/ch23/browser';
fs.mkdirSync(out,{recursive:true});
const result={startedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch23.html')).digest('hex'),layouts:[],interactions:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const check=(ok,message)=>{if(!ok)throw new Error(message)};
function watch(page,label){
  page.on('pageerror',e=>result.errors.push(label+': '+e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))result.errors.push(label+': '+r.status()+' '+r.url())});
}
try{
  for(const width of [1440,390])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();watch(page,`${width}/${theme}/${locale}`);
    await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
    await page.goto('http://127.0.0.1:8765/chapters/ch23.html');
    await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
      slideIds:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),decks:document.querySelectorAll('.deck').length,
      code:[...document.querySelectorAll('pre')].map(e=>({source:e.dataset.source,language:e.dataset.language,kind:e.dataset.kind,hasChinese:/[\u3400-\u9fff]/.test(e.textContent)})),
      flashcards:{count:document.querySelectorAll('.flip').length,grid:[...document.querySelectorAll('.flip')].every(e=>e.closest('.cards-grid')&&getComputedStyle(e.closest('.cards-grid')).display==='grid')},
      toc:[...document.querySelectorAll('.toc-links a')].every(e=>!!document.getElementById(decodeURIComponent(e.hash.slice(1))))
    }));
    check(layout.width===width&&layout.scrollWidth===width,'page overflow '+JSON.stringify(layout));
    check(layout.theme===theme&&layout.locale===locale,'settings');
    check(JSON.stringify(layout.slideIds)===JSON.stringify(baseline.slideIds),'frame IDs');
    check(layout.decks===6&&layout.code.length===6,'deck/snippet inventory');
    check(layout.code.every(e=>e.source&&e.language&&e.kind&&!e.hasChinese),'code labels/English');
    check(layout.flashcards.count===17&&layout.flashcards.grid&&layout.toc,'flashcards/TOC');
    await page.screenshot({path:`${out}/${width}-${theme}-${locale}-top.png`});
    const expanded=await page.evaluate(()=>{document.querySelectorAll('details').forEach(e=>e.open=true);return document.documentElement.scrollWidth});
    check(expanded===width,'expanded detail overflow');
    layout.expandedScrollWidth=expanded;layout.frameVisits=0;layout.horizontalPositions=[];
    if(locale==='both'){
      let group=0;
      for(const deck of await page.locator('.deck').all()){
        group++;const count=await deck.locator('.dot').count();
        for(let i=0;i<count;i++){
          await deck.locator('.dot').nth(i).click();
          check(await deck.locator('.deck-count').innerText()===`${i+1} / ${count}`,'frame navigation');
          check(await deck.locator('.slide.is-on').count()===1,'active frame');layout.frameVisits++;
          if([1,4,6].includes(group)){
            if(width===390){
              for(const position of ['left','middle','right']){
                const scrolled=await deck.locator('.slide.is-on').evaluate((e,p)=>{
                  e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;
                  return {position:p,scrollLeft:e.scrollLeft,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth};
                },position);
                layout.horizontalPositions.push({frame:`d${group}s${i+1}`,...scrolled});
                await deck.screenshot({path:`${out}/${width}-${theme}-d${group}s${i+1}-${position}.png`});
              }
              await deck.locator('.slide.is-on').evaluate(e=>e.scrollLeft=0);
            }else await deck.screenshot({path:`${out}/${width}-${theme}-d${group}s${i+1}.png`});
          }
        }
      }
      for(const block of [page.locator('.code-block').first(),page.locator('.code-block').nth(4)]){
        await block.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-145,behavior:'instant'}));
        const source=await block.locator('pre').getAttribute('data-source');
        await page.screenshot({path:`${out}/${width}-${theme}-${source.replaceAll(/[.#/]/g,'_')}.png`});
      }
      const flash=page.locator('.cards-grid');await flash.screenshot({path:`${out}/${width}-${theme}-flashcards.png`});
    }
    result.layouts.push(layout);await context.close();
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();watch(page,'interactions');
  await page.goto('http://127.0.0.1:8765/chapters/ch23.html');
  await page.locator('[data-locale-set="en"]').click();await page.locator('[data-theme-set="dracula"]').click();
  let copied=0;
  for(const block of await page.locator('.code-block').all()){
    await block.locator('.code-copy').click();
    check(await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent(),'clipboard source mismatch');copied++;
  }
  const deck=page.locator('.deck').first();await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
  check((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard frame');
  await deck.locator('.deck-speed').click();await deck.locator('.deck-loop').click();
  const preferences=await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}));
  await deck.locator('.deck-toggle').click();
  await page.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:6000});
  await deck.locator('.deck-toggle').click();
  const flash=page.locator('.flip').first();await flash.click();check((await flash.getAttribute('class')).includes('is-flipped'),'flip');
  await flash.focus();await page.keyboard.press('Enter');check(!(await flash.getAttribute('class')).includes('is-flipped'),'keyboard flip');
  await page.locator('.read-toggle').click();await page.reload();
  check(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','progress persistence');
  check(await page.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'),'settings persistence');
  check(JSON.stringify(preferences)===JSON.stringify(await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}))),'playback preference persistence');
  result.interactions.push({copied,keyboard:true,playback:true,flashcard:true,progress:true,settings:true});await context.close();
  check(result.errors.length===0,JSON.stringify(result.errors));result.passed=true;
}catch(e){result.passed=false;result.failure=String(e);process.exitCode=1}
finally{
  await browser.close();fs.writeFileSync('docs/reviews/ch23-browser-results.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frameVisits:result.layouts.reduce((n,e)=>n+e.frameVisits,0),interactions:result.interactions,errors:result.errors}));
}
