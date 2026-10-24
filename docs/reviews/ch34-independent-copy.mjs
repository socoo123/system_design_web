import crypto from 'node:crypto';
import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const sourceSha=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch34.html')).digest('hex');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});let rows=[];
fs.mkdirSync('docs/reviews/screenshots/ch34-independent/copy',{recursive:true});
try{for(const width of [320,390])for(const theme of ['parchment','dracula'])for(const locale of ['en','both']){
const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});await page.goto('http://127.0.0.1:8765/chapters/ch34.html');await page.waitForSelector('.code-copy');
let n=0;for(const block of await page.locator('.code-block').all()){n++;const x=await block.locator('.code-copy').evaluate(e=>({label:e.textContent,height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}));rows.push({viewportWidth:width,theme,locale,block:n,buttonText:x.label,buttonWidth:x.width,height:x.height,passed:x.height<40});if(x.height>=40)await block.screenshot({path:`docs/reviews/screenshots/ch34-independent/copy/${width}-${theme}-${locale}-code${n}.png`});}await page.close();}
}finally{await browser.close()}
fs.writeFileSync('docs/reviews/ch34-independent-copy-results.json',JSON.stringify({passed:rows.every(x=>x.passed),htmlSha256:sourceSha,rows},null,2));console.log(JSON.stringify({passed:rows.every(x=>x.passed),checks:rows.length,failures:rows.filter(x=>!x.passed)}));
