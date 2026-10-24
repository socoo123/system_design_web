import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch38-independent/supplement';fs.mkdirSync(out,{recursive:true});
const result={chapterSha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch38.html')).digest('hex'),cases:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const theme of ['parchment','dracula'])for(const width of [320,390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);await page.goto('http://127.0.0.1:8765/chapters/ch38.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
 const card=page.locator('.flip').last();await card.click();await card.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-24,behavior:'instant'}));
 const png=`${out}/${width}-${theme}-new-card.png`;await page.screenshot({path:png});result.cases.push({width,theme,kind:'A9 new card',png,visible:await card.isVisible(),class:await card.getAttribute('class'),text:await card.innerText()});
 if(width===390){const deck=page.locator('.deck').nth(4);for(const slide of [2,3]){
  await deck.locator('.dot').nth(slide).click();await deck.locator('.slide.is-on').evaluate(e=>e.scrollLeft=0);
  const shot=`${out}/390-${theme}-d5s${slide+1}.png`;await deck.screenshot({path:shot});result.cases.push({width,theme,kind:`D5s${slide+1}`,png:shot});
 }}await page.close();
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch38-independent-supplement.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({cases:result.cases.length,chapterSha256:result.chapterSha256}));
