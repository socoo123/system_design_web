import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const browser=await chromium.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const records=[],out='docs/reviews/screenshots/ch09/page';fs.mkdirSync(out,{recursive:true});
for(const width of [1440,768,390,320])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.SITE_BASE||'http://127.0.0.1:8765')+'/chapters/ch09.html');await p.evaluate(()=>document.fonts.ready);
 const state=await p.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,codeBlocks:document.querySelectorAll('pre').length}));
 assert.equal(state.innerWidth,width);assert.equal(state.scrollWidth,width);assert.equal(state.theme,theme);assert.equal(state.locale,locale);assert.equal(state.codeBlocks,5);
 const named=`${width}-${theme}-${locale}`;
 if(locale==='zh'||(width===390&&locale==='en'))await p.screenshot({path:`${out}/${named}-top.png`});
 const codes=p.locator('pre[data-source]');for(let i=0;i<await codes.count();i++){const pre=codes.nth(i);await pre.scrollIntoViewIfNeeded();const can=await pre.evaluate(e=>{e.scrollLeft=e.scrollWidth;return {max:e.scrollWidth-e.clientWidth,at:e.scrollLeft};});if(can.max>1)assert.ok(can.at>0);}
 const create=p.locator('pre[data-source="create.pseudo"]');await create.scrollIntoViewIfNeeded();
 if(locale==='zh'||(width===390&&locale==='en'))await p.screenshot({path:`${out}/${named}-code.png`});
 await create.evaluate(e=>{e.scrollLeft=0});
 if(locale==='zh'&&(width===390||width===320))await p.screenshot({path:`${out}/${named}-code-left.png`});
 await create.locator('..').locator('.code-copy').click();const copied=await p.evaluate(()=>navigator.clipboard.readText());assert.equal(copied,await create.textContent());
 for(let d=0;d<7;d++){
  const deck=p.locator('.deck').nth(d),dots=deck.locator('.dot');
  if(width===1440&&locale==='zh')for(let i=0;i<await dots.count();i++){await dots.nth(i).click();assert.equal(await deck.locator('.slide.is-on').count(),1);}
  await dots.last().click();await deck.scrollIntoViewIfNeeded();
  if(locale==='zh'&&(width===1440||width===390)){
   await p.screenshot({path:`${out}/${named}-d${d+1}.png`});
   if(width===390){const scroll=await deck.locator('.slide.is-on').evaluate(e=>{e.scrollLeft=e.scrollWidth;return e.scrollLeft});assert.ok(scroll>0);await p.screenshot({path:`${out}/${named}-d${d+1}-right.png`});}
  }
 }
 const card=p.locator('.flip').first();await card.click();assert.equal(await card.getAttribute('aria-expanded'),'true');
 assert.deepEqual(errors,[]);records.push({...state,width,theme,locale,clipboard:true,frameNavigation:true,pageErrors:errors});await context.close();
}
await browser.close();fs.writeFileSync('docs/reviews/ch09-page-results.json',JSON.stringify(records,null,2));console.log(`${records.length} real viewport/theme/locale combinations PASS; source copy and local scroll verified`);
