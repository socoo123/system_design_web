import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const html=fs.readFileSync('chapters/ch24.html','utf8');
const baseline=fs.readFileSync('docs/reviews/ch22-ch23-ch24-baseline/ch24.html','utf8');
const ids=[...baseline.matchAll(/<title id="([^"]+)"/g)].map(m=>m[1]);
const output='docs/reviews/screenshots/ch24-independent';
fs.mkdirSync(output,{recursive:true});
const result={startedSha256:digest(html),layouts:[],errors:[],frames:[],interactions:{}};
const check=(name,value)=>{if(!value)throw Error(name)};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  for(const width of [390,1440]) for(const theme of ['parchment','dracula']) for(const locale of ['zh','en','both']) {
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    page.on('pageerror',e=>result.errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)result.errors.push(`${r.status()} ${r.url()}`)});
    await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
    const response=await page.goto('http://127.0.0.1:8765/chapters/ch24.html');
    const servedSha=digest(await response.text());
    await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
    const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
      ids:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),decks:document.querySelectorAll('.deck').length,
      cards:{count:document.querySelectorAll('.flip').length,inGrid:[...document.querySelectorAll('.flip')].every(e=>e.closest('.cards-grid')&&getComputedStyle(e.closest('.cards-grid')).display==='grid')},
      codes:[...document.querySelectorAll('pre')].map(e=>({file:e.dataset.source,language:e.dataset.language,kind:e.dataset.kind,text:e.textContent})),
      toc:[...document.querySelectorAll('.toc-links a')].every(e=>!!document.getElementById(decodeURIComponent(e.hash.slice(1))))
    }));
    check('actual viewport/page overflow',state.width===width&&state.scrollWidth===width);
    check('theme/locale',state.theme===theme&&state.locale===locale);
    check('original 6 decks/30 frame IDs',state.decks===6&&JSON.stringify(state.ids)===JSON.stringify(ids));
    check('14 uniform flashcards',state.cards.count===14&&state.cards.inGrid);
    check('TOC anchors',state.toc);
    check('8 kinds/source-labelled blocks',state.codes.length===8&&state.codes.every(c=>c.language&&c.kind&&c.file));
    for(const code of state.codes)check('source match '+code.file,code.text===fs.readFileSync(path.join('examples/ch24',code.file),'utf8').trimEnd());
    await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
    const expanded=await page.evaluate(()=>document.documentElement.scrollWidth);
    check('expanded details page overflow',expanded===width);
    let visited=0;
    if(locale==='both') for(const [n,deck]of (await page.locator('.deck').all()).entries()) {
      for(let i=0;i<5;i++){
        await deck.locator('.dot').nth(i).click();
        check('frame counter',(await deck.locator('.deck-count').innerText())===`${i+1} / 5`);
        check('one active frame',await deck.locator('.slide.is-on').count()===1);
        visited++;
        if(width===390&&[2,4,5].includes(n+1))for(const position of ['left','middle','right']){
          await deck.locator('.slide.is-on').evaluate((e,p)=>{e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2},position);
          await deck.screenshot({path:`${output}/d${n+1}s${i+1}-${theme}-${position}.png`});
        }
      }
      await deck.locator('.slide.is-on').evaluate(e=>e.scrollLeft=0);
      if(width===1440)await deck.screenshot({path:`${output}/d${n+1}-${theme}-desktop.png`});
    }
    await page.locator('.code-block').nth(6).evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-150,behavior:'instant'}));
    if(locale==='both')await page.screenshot({path:`${output}/${width}-${theme}-refund-code.png`});
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/${width}-${theme}-${locale}-top.png`});
    result.layouts.push({...state,codes:state.codes.map(({text,...c})=>({...c,sha256:digest(text)})),expandedScrollWidth:expanded,servedSha256:servedSha,visited});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:1440,height:1400},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();await page.goto('http://127.0.0.1:8765/chapters/ch24.html');
  await page.locator('[data-locale-set="en"]').click();await page.locator('[data-theme-set="dracula"]').click();
  let copied=0;
  for(const block of await page.locator('.code-block').all()){
    await block.locator('.code-copy').click();check('copied code equals visible DOM',await page.evaluate(()=>navigator.clipboard.readText())===await block.locator('code').textContent());copied++;
  }
  const deck=page.locator('.deck').first();await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
  check('keyboard advances',(await deck.locator('.deck-count').innerText()).startsWith('2 /'));
  await deck.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-150,behavior:'instant'}));
  await page.waitForFunction(()=>{const r=document.querySelector('.deck').getBoundingClientRect();return r.top>=100&&r.bottom<innerHeight});
  await deck.locator('.deck-toggle').click();await page.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:6000});await deck.locator('.deck-toggle').click();
  const card=page.locator('.flip').nth(9);await card.click();check('refund flashcard flips',(await card.getAttribute('class')).includes('is-flipped'));
  await card.focus();await page.keyboard.press('Enter');check('flashcard keyboard flips back',!(await card.getAttribute('class')).includes('is-flipped'));
  await page.locator('.read-toggle').click();await page.reload();check('read state persists',await page.locator('.read-toggle').getAttribute('aria-pressed')==='true');
  check('theme/locale persist',await page.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'));
  result.interactions={copied,keyboard:true,playback:true,flashcard:true,readPersistence:true,settings:true};await context.close();
  // Independently render all original frames, including every modified D2/D4 frame.
  const render=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
  for(const theme of ['parchment','dracula'])for(const svg of [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0])){
    const id=svg.match(/<title id="([^"]+)"/)[1].replace(/t$/,'');
    await render.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
    await render.evaluate(()=>document.fonts.ready);await render.screenshot({path:`${output}/${id}-${theme}-frame.png`});result.frames.push({id,theme,sourceSha256:result.startedSha256});
  }
  await render.close();
  result.endedSha256=digest(fs.readFileSync('chapters/ch24.html'));
  check('source stable during browser review',result.startedSha256===result.endedSha256&&result.layouts.every(l=>l.servedSha256===result.startedSha256));
  check('no browser or resource errors',result.errors.length===0);result.passed=true;
}catch(error){result.passed=false;result.failure=String(error);process.exitCode=1}
finally{await browser.close();fs.writeFileSync('docs/reviews/ch24-independent-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,visited:result.layouts.reduce((n,r)=>n+r.visited,0),frames:result.frames.length,interactions:result.interactions,errors:result.errors}))}
