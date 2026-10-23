import fs from 'node:fs';import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch07-independent';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const results={layouts:[],screenshots:[],errors:[]};
for(const width of [320,390,1440])for(const theme of ['parchment','dracula']) {
 const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 p.on('pageerror',e=>results.errors.push(e.message));
 await p.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},{theme});
 await p.goto('http://127.0.0.1:8765/chapters/ch07.html');await p.evaluate(()=>document.fonts.ready);
 const layout=await p.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale}));results.layouts.push(layout);if(layout.innerWidth!==width||layout.scrollWidth!==width)throw Error('overflow');
 if(width===1440)for(const [di,d] of (await p.locator('.deck').all()).entries()) {
  const dots=await d.locator('.dot').all();
  for(let i=0;i<dots.length;i++){if(di!==2&&i!==dots.length-1)continue;await dots[i].click();const name=`${theme}-d${di+1}s${i+1}.png`;await d.locator('.slide.is-on svg').screenshot({path:`${out}/${name}`});results.screenshots.push(name);}
 }
 if(width===390){const d=p.locator('.deck').nth(2);await d.locator('.dot').last().click();await d.screenshot({path:`${out}/${theme}-390-d3-left.png`});await d.locator('.slide.is-on').evaluate(e=>e.scrollLeft=e.scrollWidth);await d.screenshot({path:`${out}/${theme}-390-d3-right.png`});}
 await p.locator('pre').nth(1).scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/${theme}-${width}-java.png`});await p.close();
}
results.sha256=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch07.html')).digest('hex');await browser.close();fs.writeFileSync('docs/reviews/ch07-independent-browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
