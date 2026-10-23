import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const source=fs.readFileSync('chapters/ch12.html','utf8');
const sha=crypto.createHash('sha256').update(source).digest('hex');
if(sha!=='58da6191abc8c56750711fe3b45932e641a4c136eb5cca2b17e0c870fe376428')throw new Error('unexpected chapter version');
const before=fs.readFileSync('docs/reviews/ch10-ch11-ch12-baseline/ch12.html','utf8');
const ids=s=>[...s.matchAll(/<title id="([^"]+)"/g)].map(m=>m[1]);
if(JSON.stringify(ids(source))!==JSON.stringify(ids(before)))throw new Error('frame inventory changed');
const out='docs/reviews/screenshots/ch12-independent';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={pageSha256:sha,layouts:[],frames:[],errors:[]};
try{
 for(const width of [1440,390])for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch12.html');await page.waitForSelector('.dot');
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,
    decks:document.querySelectorAll('.deck').length,cards:document.querySelectorAll('.cards-grid .flip').length,
    code:document.querySelectorAll('.code-block').length,revisionScope:document.body.innerText.includes('修订应用不等于发现变更')
      &&document.body.innerText.includes('Applying a revision is separate from discovering a change')}));
  if(layout.innerWidth!==width||layout.scrollWidth!==width||layout.cards!==15||layout.code!==5||!layout.revisionScope)throw new Error('layout/scope regression');
  report.layouts.push({width,theme,...layout});
  for(const d of [0,3,5]){
   const deck=page.locator('.deck').nth(d);
   for(let f=0;f<5;f++){
    await deck.locator('.dot').nth(f).click();await deck.scrollIntoViewIfNeeded();
    if(await deck.locator('.deck-count').innerText()!==`${f+1} / 5`)throw new Error('frame navigation');
    const slide=deck.locator('.slide.is-on');
    if(width===1440)await slide.locator('svg').screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-desktop.png`});
    else for(const [edge,fraction] of [['left',0],['middle',0.5],['right',1]]){
     await slide.evaluate((e,fraction)=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)*fraction;},fraction);
     await page.screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-${edge}.png`});
    }
    report.frames.push({width,theme,deck:d+1,frame:f+1,
      labels:await slide.locator('svg').evaluate(svg=>[...svg.querySelectorAll('text')].map(t=>t.textContent))});
   }
  }
  await page.close();
 }
 if(report.errors.length)throw new Error(JSON.stringify(report.errors));
 report.passed=true;
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch12-independent-browser-results.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({passed:report.passed,layouts:report.layouts.length,frameVisits:report.frames.length,errors:report.errors.length}));
