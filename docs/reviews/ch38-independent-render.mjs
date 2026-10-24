import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const phase=process.argv[2]||'final';
const selected=phase==='initial-extra'?[2,5,6]:[1,3,4,5,7];
const file=phase==='initial-extra'?'docs/reviews/ch38-independent-initial/ch38.html':'chapters/ch38.html';
const html=fs.readFileSync(file,'utf8');
const output=`docs/reviews/screenshots/ch38-independent/${phase}-frames`;fs.mkdirSync(output,{recursive:true});
const result={file,phase,chapterSha256:crypto.createHash('sha256').update(html).digest('hex'),frames:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
 await page.route('**/chapters/ch38.html',route=>route.fulfill({body:html,contentType:'text/html'}));
 await page.goto('http://127.0.0.1:8765/chapters/ch38.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const decks=await page.locator('.deck').all();
 for(const d of selected){const deck=decks[d-1];for(let i=0;i<await deck.locator('.dot').count();i++){
  await deck.locator('.dot').nth(i).click();const png=`${output}/d${d}s${i+1}-${theme}.png`;await deck.locator('.slide.is-on svg').screenshot({path:png});
  result.frames.push({deck:d,slide:i+1,theme,png,sha256:crypto.createHash('sha256').update(fs.readFileSync(png)).digest('hex')});
 }}await page.close();
}}finally{await browser.close();fs.writeFileSync(`docs/reviews/ch38-independent-${phase}-frames.json`,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({frames:result.frames.length}));
