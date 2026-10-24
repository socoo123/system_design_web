import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const output='docs/reviews/screenshots/ch37-author/ui-baseline';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={layouts:[],scope:'Existing shared topbar at actual 320px/both; no shared UI changes'};
try{
 for(const phase of ['before','after'])for(const theme of ['parchment','dracula']){
  const file=phase==='before'?'docs/reviews/ch37-ch38-ch39-baseline/ch37.html':'chapters/ch37.html';const html=fs.readFileSync(file,'utf8');
  const page=await browser.newPage({viewport:{width:320,height:1000},reducedMotion:'reduce'});
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.route('**/chapters/ch37.html',route=>route.fulfill({body:html,contentType:'text/html'}));await page.goto('http://127.0.0.1:8765/chapters/ch37.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,topbarHeight:document.querySelector('.topbar').getBoundingClientRect().height,brandWidth:document.querySelector('.brand').getBoundingClientRect().width,brandText:document.querySelector('.brand').textContent}));
  const png=`${output}/${phase}-${theme}-320-both.png`;await page.screenshot({path:png});result.layouts.push({phase,theme,file,sha256:crypto.createHash('sha256').update(html).digest('hex'),png,...state});await page.close();
 }
 result.sameHeight=result.layouts[0].topbarHeight===result.layouts[2].topbarHeight&&result.layouts[1].topbarHeight===result.layouts[3].topbarHeight;
 result.sharedHashes=Object.fromEntries(['assets/css/style.css','assets/js/nav.js','assets/js/lang.js','assets/js/boot.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch37-ui-baseline.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.layouts));}
