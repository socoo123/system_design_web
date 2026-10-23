import fs from 'node:fs';import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const out='docs/reviews/screenshots/ch08-independent';fs.mkdirSync(out,{recursive:true});
const result={layouts:[],frames:[],errors:[]};const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
for(const width of [320,390,1440])for(const theme of ['parchment','dracula']){
 const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});p.on('pageerror',e=>result.errors.push(e.message));
 await p.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},{theme});await p.goto('http://127.0.0.1:8765/chapters/ch08.html');await p.evaluate(()=>document.fonts.ready);
 result.layouts.push(await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale})));
 await p.screenshot({path:`${out}/${width}-${theme}-top.png`});
 const selected={1:[2,3,4,5],2:[5],3:[4,5],4:[4,5,6],5:[5]};
 for(const [deck,slides]of Object.entries(selected))for(const slide of slides){
  const d=p.locator('.deck').nth(Number(deck)-1);await d.locator('.dot').nth(slide-1).click();
  if(width===1440){await d.locator('.slide.is-on svg').screenshot({path:`${out}/${theme}-d${deck}s${slide}.png`});result.frames.push(`${theme}/d${deck}s${slide}`)}
 }
 if(width===390){const d=p.locator('.deck').last();await d.scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${width}-${theme}-dense-left.png`});await d.locator('.slide.is-on').evaluate(e=>e.scrollLeft=e.scrollWidth);await p.screenshot({path:`${out}/${width}-${theme}-dense-right.png`});await p.locator('pre').nth(4).scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${width}-${theme}-code.png`});}
 await p.close();
}
await b.close();if(result.errors.length||result.layouts.some(x=>x.width!==x.scrollWidth))throw new Error(JSON.stringify(result));result.htmlSha256=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch08.html')).digest('hex');fs.writeFileSync('docs/reviews/ch08-independent-browser-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
