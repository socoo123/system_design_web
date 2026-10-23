import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch13-independent';
fs.mkdirSync(out,{recursive:true});
const expected=JSON.parse(fs.readFileSync('docs/reviews/ch13-ch14-ch15-baseline.json')).chapters.ch13.slideIds;
const digest=()=>crypto.createHash('sha256').update(fs.readFileSync('chapters/ch13.html')).digest('hex');
const report={sha256:digest(),layouts:[],frameVisits:0,interactions:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
function check(v,m){if(!v)throw Error(m);}
try {
 for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))report.errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch13.html');
  await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>document.querySelectorAll('article details').forEach(d=>d.open=true));
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,
   theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,
   ids:[...document.querySelectorAll('.slide svg title')].map(e=>e.id),
   codes:[...document.querySelectorAll('pre')].map(e=>({kind:e.dataset.kind,source:e.dataset.source})),
   flashcards:document.querySelectorAll('.cards-grid .flip').length,
   brokenAnchors:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(decodeURIComponent(a.hash.slice(1)))).length,
   codeHasChinese:[...document.querySelectorAll('pre code')].some(e=>e.getClientRects().length&&/[\u3400-\u9fff]/.test(e.textContent))}));
  check(state.innerWidth===width&&state.scrollWidth===width,'page overflow');
  check(state.theme===theme&&state.locale===locale,'settings');
  check(JSON.stringify(state.ids)===JSON.stringify(expected),'animation inventory');
  check(state.flashcards===15&&!state.brokenAnchors,'cards/anchors');
  if(locale==='en')check(!state.codeHasChinese,'Chinese code in EN');
  if(locale==='both'&&[390,1440].includes(width)) {
   const decks=await page.locator('.deck').all();
   for(let d=0;d<decks.length;d++) {
    const frames=[0,3,4].includes(d)?[0,1,2,3,4]:[0,4];
    for(const frame of frames) {
     await decks[d].locator('.dot').nth(frame).click();
     check(await decks[d].locator('.deck-count').innerText()===`${frame+1} / 5`,'frame navigation');report.frameVisits++;
     const slide=decks[d].locator('.slide.is-on');
     if([0,3,4].includes(d)) {
      if(width===1440)await slide.locator('svg').screenshot({path:`${out}/d${d+1}s${frame+1}-${theme}-desktop.png`});
      else for(const position of ['left','middle','right']) {
       await slide.evaluate((e,p)=>e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2,position);
       await decks[d].screenshot({path:`${out}/d${d+1}s${frame+1}-${theme}-390-${position}.png`});
      }
      await slide.evaluate(e=>e.scrollLeft=0);
     }
    }
   }
  }
  if([320,1440].includes(width)&&locale!=='zh') {
   await page.locator('pre').first().scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/${width}-${theme}-${locale}-code.png`});
  }
  report.layouts.push({width,theme,locale,...state});await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8765/chapters/ch13.html');
 await page.locator('[data-locale-set="en"]').click();
 let count=0;for(const code of await page.locator('.code-block').all()) {
  await code.locator('.code-copy').click();
  check(await page.evaluate(()=>navigator.clipboard.readText())===await code.locator('code').textContent(),'copy mismatch');count++;
 }
 const card=page.locator('.flip').last();await card.click();check((await card.getAttribute('class')).includes('is-flipped'),'flashcard');
 const deck=page.locator('.deck').first();await deck.locator('.dot').first().click();await deck.focus();await page.keyboard.press('ArrowRight');
 check((await deck.locator('.deck-count').innerText()).startsWith('2 /'),'keyboard');
 report.interactions.push({copied:count,lastFlashcard:true,keyboard:true});await context.close();
 check(!report.errors.length,JSON.stringify(report.errors));check(digest()===report.sha256,'page changed during review');report.passed=true;
} catch(e) {report.passed=false;report.failure=String(e);process.exitCode=1;}
finally {
 await browser.close();fs.writeFileSync('docs/reviews/ch13-independent-browser-results.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,hash:report.sha256,layouts:report.layouts.length,frames:report.frameVisits,interactions:report.interactions,errors:report.errors,failure:report.failure}));
}
