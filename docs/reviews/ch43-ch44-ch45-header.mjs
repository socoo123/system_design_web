// Establish whether the 320px bilingual header predates this content batch.
import fs from 'node:fs';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const prefix = 'ch43-ch44-ch45';
const out = `docs/reviews/screenshots/${prefix}-root/header`;
fs.mkdirSync(out,{recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result = {layouts:[],images:[]};
try {
  for (const chapter of ['ch43','ch44','ch45']) for (const mode of ['before','after']) {
    const source = mode === 'before' ? `docs/reviews/${prefix}-baseline/${chapter}.html` : `chapters/${chapter}.html`;
    const html = fs.readFileSync(source,'utf8');
    const context = await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});
    const page = await context.newPage();
    await page.addInitScript(()=>{localStorage.setItem('sd-locale','both');localStorage.setItem('sd-theme','parchment');});
    await page.route(`**/chapters/${chapter}.html`,route=>route.fulfill({contentType:'text/html',body:html}));
    await page.goto(`http://127.0.0.1:8765/chapters/${chapter}.html`);
    await page.evaluate(()=>document.fonts.ready);
    const metrics = await page.evaluate(()=>{
      const bar=document.querySelector('.topbar').getBoundingClientRect();
      const brand=document.querySelector('.brand').getBoundingClientRect();
      return {innerWidth,scrollWidth:document.documentElement.scrollWidth,headerHeight:bar.height,brandWidth:brand.width,brandHeight:brand.height,readingHeight:innerHeight-bar.height};
    });
    const image=`${out}/${chapter}-${mode}.png`;
    await page.screenshot({path:image});
    result.layouts.push({chapter,mode,source,sha256:crypto.createHash('sha256').update(html).digest('hex'),...metrics});
    result.images.push({image,sha256:crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex')});
    await context.close();
  }
} finally {await browser.close();}
result.sameBeforeAfter=result.layouts.filter(x=>x.mode==='before').every(before=>{
  const after=result.layouts.find(x=>x.chapter===before.chapter&&x.mode==='after');
  return ['innerWidth','scrollWidth','headerHeight','brandWidth','brandHeight','readingHeight'].every(k=>before[k]===after[k]);
});
fs.writeFileSync(`docs/reviews/${prefix}-header-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sameBeforeAfter:result.sameBeforeAfter,layouts:result.layouts}));
