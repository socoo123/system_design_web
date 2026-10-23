import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const stage=process.argv[2]||'after';
const out=`docs/reviews/screenshots/ch11/${stage}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:8765/chapters/ch11.html');
await page.evaluate(()=>document.fonts.ready);
for(const theme of ['parchment','dracula']){
 await page.locator(`[data-theme-set="${theme}"]`).click();
 for(const [d,deck] of (await page.locator('.deck').all()).entries()){
  for(let s=0;s<await deck.locator('.dot').count();s++){
   await deck.locator('.dot').nth(s).click();
   await deck.locator('.slide.is-on svg').screenshot({path:`${out}/d${d+1}s${s+1}-${theme}.png`});
  }
 }
}
await browser.close();
