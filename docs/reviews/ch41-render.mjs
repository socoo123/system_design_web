import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const phase=process.argv[2]||'after';
const root=process.cwd();
const file=phase==='before'?'docs/reviews/ch40-ch41-ch42-baseline/ch41.html':'chapters/ch41.html';
const html=fs.readFileSync(file,'utf8');
const dir=`docs/reviews/screenshots/ch41-author/${phase}`;
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const selectedDecks=phase==='before'?[1,2,3,4,5,6,7,8]:[5,8];
const results={phase,file,selectedDecks,sha256:crypto.createHash('sha256').update(html).digest('hex'),frames:[]};
try{
for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
 await page.route('**/chapters/ch41.html',route=>route.fulfill({body:html,contentType:'text/html'}));
 await page.goto('http://127.0.0.1:8765/chapters/ch41.html');
 await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const decks=await page.locator('.deck').all();
 for(let d=0;d<decks.length;d++){
  if(!selectedDecks.includes(d+1)) continue;
  const deck=decks[d], dots=deck.locator('.dot'),n=await dots.count();
  for(let s=0;s<n;s++){
   await dots.nth(s).click();
   const svg=deck.locator('.slide.is-on svg');
   const png=`${dir}/d${d+1}s${s+1}-${theme}.png`;
   await svg.screenshot({path:png});
   results.frames.push({deck:d+1,slide:s+1,theme,png,title:await svg.locator('title').textContent()});
  }
 }
 await page.close();
}
}finally{await browser.close();fs.writeFileSync(`docs/reviews/ch41-${phase}-frames.json`,JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({phase,frames:results.frames.length}));
