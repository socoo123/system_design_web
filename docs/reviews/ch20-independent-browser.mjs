// Independent review only. Target chapter/examples remain read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch20/independent';fs.mkdirSync(out,{recursive:true});
const freshResult={htmlSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch20.html')).digest('hex'),layouts:[],errors:[],frameVisits:0,desktopFrames:0,narrowFigures:0};
const interactionOnly=process.argv.includes('--interaction-only');
const result=interactionOnly?JSON.parse(fs.readFileSync('docs/reviews/ch20-independent-browser-results.json')):freshResult;
if(interactionOnly&&result.htmlSha256!==freshResult.htmlSha256)throw new Error('Changed chapter; full rerun required');
const baseline=fs.readFileSync('docs/reviews/ch19-ch20-ch21-baseline/ch20.html','utf8');
const ids=[...baseline.matchAll(/<title id="([^"]+)"/g)].map(m=>m[1]);
function check(x,m){if(!x)throw new Error(m);}
function watch(page){page.on('pageerror',e=>result.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(`${r.status()} ${r.url()}`);});}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 if(!interactionOnly)for(const width of [390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['en','both']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();watch(page);
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch20.html');await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('.code-copy');
  const normal=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
    titles:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),decks:document.querySelectorAll('.deck').length,
    cards:document.querySelectorAll('.cards-grid .flip').length,grid:getComputedStyle(document.querySelector('.cards-grid')).display,
    sources:[...document.querySelectorAll('pre')].map(e=>e.dataset.source),
    invalidSvg:[...document.querySelectorAll('.slide svg *')].filter(e=>[...e.attributes].some(a=>/NaN|undefined|Infinity/.test(a.value))).length,
    toc:[...document.querySelectorAll('.toc-links a')].every(a=>document.getElementById(decodeURIComponent(a.hash.slice(1))))}));
  check(normal.width===width&&normal.scrollWidth===width&&state.width===width&&state.scrollWidth===width,'real viewport overflow');
  check(state.theme===theme&&state.locale===locale&&state.cards===14&&state.grid==='grid','theme/locale/grid');
  check(state.decks===6&&JSON.stringify(state.titles)===JSON.stringify(ids)&&state.sources.length===6&&state.toc&&state.invalidSvg===0,'inventory/TOC/SVG');
  if(locale==='en')check(!await page.locator('pre').evaluateAll(es=>es.some(e=>/[\u3400-\u9fff]/.test(e.textContent))),'Chinese in English code');
  if(locale==='both'&&[390,1440].includes(width))for(const number of [2,4]){
   const deck=page.locator('.deck').nth(number-1);
   for(let i=0;i<5;i++){
    await deck.locator('.dot').nth(i).click();check(await deck.locator('.deck-count').innerText()===`${i+1} / 5`,'frame navigation');result.frameVisits++;
    const slide=deck.locator('.slide.is-on');
    if(width===1440){await slide.locator('svg').screenshot({path:`${out}/d${number}s${i+1}-${theme}.png`});result.desktopFrames++;}
    else for(const position of ['left','middle','right']){
     await slide.evaluate((e,p)=>{e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;},position);
     await deck.screenshot({path:`${out}/d${number}s${i+1}-${theme}-${position}.png`});result.narrowFigures++;
    }
   }
  }
  if(width===390&&locale==='en')for(const source of ['PartitionProgress.java','rebalance.pseudo','apply-event.pseudo','kafka-transaction.pseudo']){
    const pre=page.locator(`pre[data-source="${source}"]`);await pre.evaluate(e=>{scrollTo({top:e.closest('.code-block').getBoundingClientRect().top+scrollY-document.querySelector('.topbar').getBoundingClientRect().height-10,behavior:'instant'});});
    await page.screenshot({path:`${out}/code-${source.replaceAll('.','-')}-${theme}.png`});
  }
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/top-${width}-${theme}-${locale}.png`});
  result.layouts.push({requestedWidth:width,normal,...state});await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();watch(page);await page.goto('http://127.0.0.1:8765/chapters/ch20.html');
 await page.locator('[data-locale-set="en"]').click();await page.locator('[data-theme-set="dracula"]').click();
 let copied=0;for(const block of await page.locator('.code-block').all()){await block.locator('.code-copy').click();check(await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent(),'copy exact');copied++;}
 const deck=page.locator('.deck').nth(3);await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');check((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard frame');
 await deck.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(150);
 await deck.locator('.deck-toggle').click();await page.waitForFunction(()=>!document.querySelectorAll('.deck-count')[3].textContent.startsWith('2 /'),null,{timeout:6000});await deck.locator('.deck-toggle').click();
 await deck.locator('.deck-speed').click();await deck.locator('.deck-loop').click();
 const settings=await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}));
 const card=page.locator('.cards-grid .flip').first();await card.click();check((await card.getAttribute('class')).includes('is-flipped'),'flip click');await card.focus();await page.keyboard.press('Enter');check(!(await card.getAttribute('class')).includes('is-flipped'),'flip Enter');await page.keyboard.press('Space');check((await card.getAttribute('class')).includes('is-flipped'),'flip Space');
 await page.locator('.read-toggle').click();await page.reload();check(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','progress persists');
 check(await page.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'),'reader prefs');
 check(JSON.stringify(settings)===JSON.stringify(await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}))),'playback prefs');
 result.interactions={copied,keyboard:true,playback:true,flashcards:true,progress:true,prefs:true};await context.close();
 check(result.errors.length===0,JSON.stringify(result.errors));result.passed=true;delete result.failure;
}catch(e){result.passed=false;result.failure=String(e);process.exitCode=1;}finally{await browser.close();fs.writeFileSync('docs/reviews/ch20-independent-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frameVisits:result.frameVisits,desktopFrames:result.desktopFrames,narrowFigures:result.narrowFigures,interactions:result.interactions,errors:result.errors}));}
