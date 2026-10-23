import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const hash=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch11.html')).digest('hex');
if(hash!=='8ad7f22ec98006fd51731ddbfdf88c57ec6f4e575236567c49fbbd6a0a9b4258')throw new Error('final hash mismatch');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={hash,layouts:[],passed:false};
for(const width of [320,390,1440])for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width,height:1100},reducedMotion:'reduce'});const page=await context.newPage();
 await page.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},{theme});
 await page.goto('http://127.0.0.1:8765/chapters/ch11.html');await page.evaluate(()=>document.fonts.ready);
 const deck=page.locator('.deck').nth(4);await deck.locator('.dot').last().click();const caption=deck.locator('.slide.is-on figcaption');
 const text=await caption.textContent();
 if(!text.includes('预算耗尽且仍有后续候选')||!text.includes('confirmed exhaustion permits a normal short page'))throw new Error('P2 not fixed');
 await caption.scrollIntoViewIfNeeded();await page.screenshot({path:`docs/reviews/screenshots/ch11-independent/recheck-${width}-${theme}-caption.png`});
 const layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(layout.innerWidth!==width||layout.scrollWidth!==width)throw new Error('overflow');
 result.layouts.push({width,theme,text,...layout});await context.close();
}
await browser.close();result.passed=true;fs.writeFileSync('docs/reviews/ch11-independent-recheck-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,hash,layouts:result.layouts.length}));
