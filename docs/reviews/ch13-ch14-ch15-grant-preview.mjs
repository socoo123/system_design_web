import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const out='docs/reviews/screenshots/ch13-ch14-ch15-root';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const rows=[];
try {
 for (const theme of ['parchment','dracula']) {
  const context=await browser.newContext({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch14.html');await page.evaluate(()=>document.fonts.ready);
  const block=page.locator('.code-block').filter({has:page.locator('pre[data-source="grant.pseudo"]')});
  for (const end of [false,true]) {
   await block.evaluate((e,end)=>window.scrollTo({top:scrollY+e.getBoundingClientRect().top+(end?e.getBoundingClientRect().height-850:0)-145,behavior:'instant'}),end);
   await page.screenshot({path:`${out}/ch14-390-${theme}-grant-${end?'bottom':'top'}.png`});
  }
  rows.push({theme,width:await page.evaluate(()=>innerWidth),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth),source:'grant.pseudo'});
  await context.close();
 }
}finally{await browser.close();}
const result={pageSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch14.html')).digest('hex'),rows};
fs.writeFileSync('docs/reviews/ch13-ch14-ch15-grant-preview.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
