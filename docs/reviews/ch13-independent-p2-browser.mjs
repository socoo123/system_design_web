import fs from 'node:fs';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const rows=[];
try {
 for(const [width,theme,locale] of [[320,'parchment','both'],[390,'dracula','en'],[1440,'parchment','both']]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch13.html');await page.waitForSelector('.code-copy');
  await page.evaluate(()=>{document.documentElement.style.setProperty('scroll-behavior','auto','important');return document.fonts.ready;});
  const link=page.locator('a[href="../examples/ch13/SearchMerge.java"]:visible').first();
  await link.evaluate(e=>{const p=e.closest('.bilingual');scrollTo({top:scrollY+p.getBoundingClientRect().top-document.querySelector('.topbar').getBoundingClientRect().height-12,behavior:'instant'});});
  await page.waitForTimeout(100);
  await page.screenshot({path:`docs/reviews/screenshots/ch13-independent/p2-${width}-${theme}-${locale}.png`});
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,kind:document.querySelector('pre').dataset.kind}));
  if(state.width!==width||state.scrollWidth!==width||state.kind!=='teaching')throw Error('P2 layout/label regression');
  rows.push({width,theme,locale,...state});await page.close();
 }
}finally{await browser.close();}
fs.writeFileSync('docs/reviews/ch13-independent-p2-layout-results.json',JSON.stringify({passed:true,rows},null,2)+'\n');
console.log('P2 label/link screenshots: 3 actual viewport combinations passed');
