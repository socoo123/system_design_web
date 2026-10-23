import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const rows=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:8765/chapters/ch10.html');await page.waitForSelector('.dot');
 for(const theme of ['parchment','dracula']){
  await page.locator(`[data-theme-set="${theme}"]`).click();
  for(const d of [0,1]){
  const deck=page.locator('.deck').nth(d);
  for(let f=0;f<(d===0?5:6);f++){
   await deck.locator('.dot').nth(f).click();
   const labels=await deck.locator('.slide.is-on svg').evaluate(svg=>[...svg.querySelectorAll('text')]
     .filter(t=>['POST','202','202 + id'].includes(t.textContent))
     .map(t=>{const b=t.getBBox();return {text:t.textContent,x:Number(t.getAttribute('x')),right:b.x+b.width,margin:128-b.x-b.width};}));
   if(!labels.every(l=>l.x===94&&l.margin>=10))throw new Error('entry label crossed boundary');
   rows.push({theme,deck:d+1,frame:f+1,labels});
  }
  }
 }
}finally{await browser.close();}
const pageSha256=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch10.html')).digest('hex');
fs.writeFileSync('docs/reviews/ch10-label-results.json',JSON.stringify({pageSha256,passed:true,rows},null,2)+'\n');
console.log(JSON.stringify({passed:true,frames:rows.length,minMargin:Math.min(...rows.flatMap(r=>r.labels.map(l=>l.margin)))}));
