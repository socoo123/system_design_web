import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const files=[];
for(const width of [390,1440])for(const theme of ['parchment','dracula']){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage();
 await page.addInitScript(({theme,width})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',width===390?'both':'en');},{theme,width});
 await page.goto('http://127.0.0.1:8765/chapters/ch21.html');await page.evaluate(()=>document.fonts.ready);
 await page.locator('pre[data-source="delivery.pseudo"]').evaluate(e=>scrollTo(0,e.getBoundingClientRect().top+scrollY-420));
 const path=`docs/reviews/screenshots/ch21/browser/event-${width}-${theme}.png`;await page.screenshot({path});files.push(path);await context.close();
}
await browser.close();
fs.writeFileSync('docs/reviews/ch21-event-preview.json',JSON.stringify({sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch21.html')).digest('hex'),files},null,2)+'\n');
