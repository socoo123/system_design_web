// Actual Playwright viewport/interaction verification; no Chrome CLI mobile crops.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root=process.cwd();
const output='docs/reviews/screenshots/ch37-author/browser';fs.mkdirSync(output,{recursive:true});
const expected=JSON.parse(fs.readFileSync('docs/reviews/ch37-inventory-before.json'));
const titles=expected.decks.flatMap(d=>d.frames.map(f=>f.ids[0]));
const result={startedAt:new Date().toISOString(),chapterSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch37.html')).digest('hex'),layouts:[],interactions:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
function check(ok,message){if(!ok)throw new Error(message);}
function watch(page,label){
 page.on('pageerror',e=>result.errors.push(`${label}: ${e.message}`));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(`${label}: ${r.status()} ${r.url()}`);});
}
try{
 for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();const label=`${width}-${theme}-${locale}`;watch(page,label);
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch37.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
   ids:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),decks:document.querySelectorAll('.deck').length,
   code:[...document.querySelectorAll('pre')].map(e=>({kind:e.dataset.kind,language:e.dataset.language,source:e.dataset.source})),
   cards:{count:document.querySelectorAll('.flip').length,grid:[...document.querySelectorAll('.flip')].every(e=>e.closest('.cards-grid')&&getComputedStyle(e.closest('.cards-grid')).display==='grid')},
   toc:[...document.querySelectorAll('.toc-links a')].every(e=>document.getElementById(decodeURIComponent(e.hash.slice(1))))}));
  check(state.width===width&&state.scrollWidth===width,`overflow ${label}`);check(state.theme===theme&&state.locale===locale,`settings ${label}`);
  check(JSON.stringify(state.ids)===JSON.stringify(titles)&&state.decks===7,`inventory ${label}`);check(state.cards.count===12&&state.cards.grid,`cards ${label}`);check(state.toc,`TOC ${label}`);check(state.code.length===3&&state.code.every(c=>c.kind&&c.language&&c.source),`code labels ${label}`);
  await page.evaluate(()=>document.querySelectorAll('details').forEach(e=>e.open=true));
  state.expandedScrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);check(state.expandedScrollWidth===width,`details overflow ${label}`);
  const codeBlocks=await page.locator('.code-block').all();state.copied=0;state.copyButtons=[];
  for(const block of codeBlocks){
   const button=block.locator('.code-copy');await button.click();
   const copied=await page.evaluate(()=>navigator.clipboard.readText());check(copied===await block.locator('code').textContent(),`copy ${label}`);state.copied++;
   const box=await button.boundingBox();state.copyButtons.push(box);check(box&&box.width>20&&box.height>=20&&box.x>=0&&box.x+box.width<=width,`copy visibility ${label}`);
   if(width===320)check(box.height<40,`wrapped copy label ${label}`);
  }
  if(locale==='en')check(!await page.locator('pre').evaluateAll(es=>es.some(e=>/[\u3400-\u9fff]/.test(e.textContent))),`Chinese code ${label}`);
  state.frameVisits=0;
  if([390,1440].includes(width)&&locale==='both'){
   const decks=await page.locator('.deck').all();
   for(let d=0;d<decks.length;d++){
    const deck=decks[d],dots=deck.locator('.dot'),count=await dots.count();
    for(let i=0;i<count;i++){await dots.nth(i).click();check(await deck.locator('.deck-count').innerText()===`${i+1} / ${count}`,`frame ${label}`);check(await deck.locator('.slide.is-on').count()===1,`multiple frames ${label}`);state.frameVisits++;}
    if(width===390){
     const active=deck.locator('.slide.is-on');
     for(const position of ['left','middle','right']){
      await active.evaluate((e,pos)=>{e.scrollLeft=pos==='left'?0:pos==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;},position);
      const actual=await active.evaluate(e=>({clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft}));
      check(actual.clientWidth<actual.scrollWidth,`diagram does not scroll ${label}`);
      await deck.screenshot({path:`${output}/d${d+1}-${theme}-${position}.png`});
     }
     await active.evaluate(e=>e.scrollLeft=0);
    }
   }
  }
  if([320,390].includes(width)&&locale!=='zh'){
   await codeBlocks[0].evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-24,behavior:'instant'}));
   await page.screenshot({path:`${output}/${label}-code.png`});
  }
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/${label}-top.png`});
  result.layouts.push({...state,label});await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();watch(page,'interaction');await page.goto('http://127.0.0.1:8765/chapters/ch37.html');
 await page.locator('[data-theme-set="dracula"]').click();await page.locator('[data-locale-set="en"]').click();
 const deck=page.locator('.deck').first();await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');check((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard next');
 await deck.locator('.deck-speed').click();await deck.locator('.deck-loop').click();
 const prefs=await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}));
 await deck.locator('.deck-toggle').click();await page.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:6000});await deck.locator('.deck-toggle').click();
 const card=page.locator('.flip').first();await card.click();check((await card.getAttribute('class')).includes('is-flipped'),'flip click');await card.focus();await page.keyboard.press('Enter');check(!(await card.getAttribute('class')).includes('is-flipped'),'flip enter');await page.keyboard.press('Space');check((await card.getAttribute('class')).includes('is-flipped'),'flip space');
 await page.locator('.read-toggle').click();await page.reload();check(await page.locator('.read-toggle').getAttribute('aria-pressed')==='true','read persistence');check(await page.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'),'settings persist');
 check(JSON.stringify(prefs)===JSON.stringify(await page.evaluate(()=>({speed:localStorage.getItem('sd-deck-speed'),loop:localStorage.getItem('sd-deck-loop')}))),'playback settings persist');
 result.interactions.push({keyboard:true,playback:true,flashcards:true,progress:true,settings:true});await context.close();
 check(result.errors.length===0,JSON.stringify(result.errors));result.passed=true;
}catch(error){result.passed=false;result.failure=String(error);process.exitCode=1;}
finally{await browser.close();result.finishedAt=new Date().toISOString();fs.writeFileSync('docs/reviews/ch37-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,failure:result.failure,layouts:result.layouts.length,frameVisits:result.layouts.reduce((n,r)=>n+r.frameVisits,0),copied:result.layouts.reduce((n,r)=>n+r.copied,0),errors:result.errors}));}
