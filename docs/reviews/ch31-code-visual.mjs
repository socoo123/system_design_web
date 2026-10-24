import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const directory='docs/reviews/screenshots/ch31-browser';
const output=[];
for(const theme of ['parchment','dracula']) {
  const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','en');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch31.html');
  await page.waitForSelector('.code-block');await page.evaluate(()=>document.fonts.ready);
  for(let i=1;i<3;i++) {
    const block=page.locator('.code-block').nth(i);
    await block.evaluate(e=>scrollTo(0,scrollY+e.getBoundingClientRect().top-115));
    const name=`${directory}/code${i+1}-390-${theme}-en.png`;
    await page.screenshot({path:name});output.push(name);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync('docs/reviews/ch31-code-visual.json',JSON.stringify(output,null,2)+'\n');
console.log(output.join('\n'));
