import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const report=path.join(root,'docs/reviews/ch11-caption-fix-results.json');
const result=JSON.parse(fs.readFileSync(report));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'chapters/ch11.html'))).digest('hex');
if(hash!==result.afterSHA256)throw new Error('Freeze hash mismatch');
const out=path.join(root,'docs/reviews/screenshots/ch11/caption-fix');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
result.layouts=[];result.errors=[];
try{
  for(const width of [320,390,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    page.on('pageerror',e=>result.errors.push(String(e)));
    await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
    await page.goto('http://127.0.0.1:8765/chapters/ch11.html');
    await page.evaluate(()=>document.fonts.ready);
    const deck=page.locator('.deck').nth(4);await deck.locator('.dot').last().click();
    const caption=deck.locator('.slide.is-on figcaption');
    await caption.scrollIntoViewIfNeeded();
    const text=await caption.innerText();
    if(locale!=='en'&&!text.includes('预算耗尽且仍有后续候选时'))throw new Error('Missing Chinese condition');
    if(locale!=='zh'&&!text.includes('only when the budget is exhausted and more candidates remain'))throw new Error('Missing English condition');
    const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));
    if(state.width!==width||state.scrollWidth!==width||state.theme!==theme||state.locale!==locale)throw new Error('Layout/preferences mismatch');
    await caption.screenshot({path:path.join(out,`${width}-${theme}-${locale}-caption.png`)});
    if(locale==='both')await page.screenshot({path:path.join(out,`${width}-${theme}-page.png`)});
    result.layouts.push({...state,text,frame:'D5F5'});
    await context.close();
  }
  if(result.errors.length)throw new Error(result.errors.join('\n'));
  result.passed=true;
}catch(error){result.passed=false;result.failure=String(error);process.exitCode=1;}
finally{await browser.close();fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({passed:result.passed,layouts:result.layouts.length,errors:result.errors,failure:result.failure}));
