import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const out = 'docs/reviews/screenshots/ch20/browser';
const narrow = 'docs/reviews/screenshots/ch20/narrow';
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const captures = [];
try {
  for (const theme of ['parchment','dracula']) for (const n of [2,4]) {
    const imgs = Array.from({length:5},(_,f)=>['left','middle','right'].map(position=>{
      const file=path.join(narrow,`d${n}s${f+1}-${theme}-${position}.png`);
      return `<figure><figcaption>D${n} F${f+1} ${position}</figcaption><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"></figure>`;
    }).join('')).join('');
    const page = await browser.newPage({viewport:{width:1080,height:1600}});
    await page.setContent(`<style>body{margin:0;background:#ddd;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;font:14px sans-serif}figure{margin:0;background:white}img{display:block;width:100%}figcaption{padding:4px}</style>${imgs}`);
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    await page.screenshot({path:path.join(narrow,`d${n}-${theme}-contact.png`),fullPage:true});
    await page.close();
  }
  for (const [width,theme,locale,kind,index] of [
    [390,'dracula','en','java',1], [390,'parchment','zh','inbox',3],
    [390,'dracula','en','transaction',4], [768,'parchment','both','java',1],
    [1440,'dracula','both','transaction',4], [390,'parchment','both','flashcards',null]
  ]) {
    const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
    await page.goto(`${process.env.SITE_BASE||'http://127.0.0.1:8765'}/chapters/ch20.html`);
    await page.waitForSelector('.code-copy');
    await page.evaluate(()=>document.fonts.ready);
    const target=index===null?page.locator('.cards-grid'):page.locator('.code-block').nth(index);
    await target.evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.evaluate(()=>scrollBy(0,-150));
    const file=path.join(out,`${kind}-${width}-${theme}-${locale}.png`);
    await page.screenshot({path:file});
    const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    if(state.innerWidth!==width||state.scrollWidth!==width)throw Error('viewport overflow');
    captures.push({width,theme,locale,kind,file,...state});
    await context.close();
  }
} finally { await browser.close(); }
const sha256=crypto.createHash('sha256').update(fs.readFileSync('chapters/ch20.html')).digest('hex');
fs.writeFileSync('docs/reviews/ch20-preview.json',JSON.stringify({sha256,captures},null,2)+'\n');
console.log(JSON.stringify({pageCaptures:captures.length,narrowContacts:4,sha256}));
