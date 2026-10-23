// Real 390px viewport: inspect every frame of the three modified groups D1/D4/D5 at both scroll edges.
import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch13/narrow';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const rows=[];
try{
 for(const theme of ['parchment','dracula']){
  const page=await browser.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'});
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch13.html');
  await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  for(const d of [0,3,4]){
   const deck=page.locator('.deck').nth(d);
   for(let f=0;f<await deck.locator('.dot').count();f++){
    await deck.locator('.dot').nth(f).click();await deck.scrollIntoViewIfNeeded();
    const slide=deck.locator('.slide.is-on');
    await slide.evaluate(e=>{e.scrollLeft=0;});
    await page.screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-left.png`});
    await slide.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
    await page.screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-middle.png`});
    await slide.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
    await page.screenshot({path:`${out}/d${d+1}s${f+1}-${theme}-right.png`});
    rows.push({theme,deck:d+1,frame:f+1,...await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})),
      slide:await slide.evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,right:e.scrollLeft}))});
   }
  }
  await page.close();
 }
 if(!rows.every(r=>r.width===390&&r.scrollWidth===390&&r.slide.right>0))throw new Error('narrow viewport/scroll reachability failed');
}finally{await browser.close();}
fs.writeFileSync('docs/reviews/ch13-narrow-results.json',JSON.stringify({pageSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch13.html')).digest('hex'),rows},null,2)+'\n');
console.log(JSON.stringify({frames:rows.length,screenshots:rows.length*3,viewport:390,passed:true}));
