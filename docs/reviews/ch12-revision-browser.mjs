import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out='docs/reviews/screenshots/ch12/revision';fs.mkdirSync(out,{recursive:true});
const result={hash:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch12.html')).digest('hex'),layouts:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const width of [320,390,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']){
  const context=await browser.newContext({viewport:{width,height:1100},reducedMotion:'reduce'});const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch12.html');await page.evaluate(()=>document.fonts.ready);
  const zh=page.locator('p').filter({hasText:'修订应用不等于发现变更。'});const en=page.locator('p').filter({hasText:'Applying a revision is separate from discovering a change.'});
  if(await zh.count()!==1||await en.count()!==1)throw new Error('missing revision paragraph');
  if(locale!=='en'&&!(await zh.isVisible()))throw new Error('Chinese paragraph hidden');
  if(locale!=='zh'&&!(await en.isVisible()))throw new Error('English paragraph hidden');
  const target=locale==='en'?en:zh;await target.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/${width}-${theme}-${locale}.png`});
  const layout=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,locale:document.documentElement.dataset.locale,theme:document.documentElement.dataset.theme}));
  if(layout.innerWidth!==width||layout.scrollWidth!==width)throw new Error('page overflow');
  result.layouts.push({width,theme,locale,...layout});await context.close();
 }
 result.passed=result.errors.length===0;
} finally {await browser.close();fs.writeFileSync('docs/reviews/ch12-revision-browser-results.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({passed:result.passed,hash:result.hash,layouts:result.layouts.length,errors:result.errors}));
