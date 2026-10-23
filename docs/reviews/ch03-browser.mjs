import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const source = fs.readFileSync('chapters/ch03.html', 'utf8');
const original = execFileSync('git', ['show', 'HEAD:chapters/ch03.html'], {encoding:'utf8'});
const svgs = s => [...s.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const geom = s => s.replace(/<(title|desc|text)\b([^>]*)>[\s\S]*?<\/\1>/g, '<$1$2></$1>');
const hash = s=>crypto.createHash('sha256').update(s).digest('hex');
const before=svgs(original), after=svgs(source);
if (before.length!==26 || after.length!==26 || before.some((s,i)=>geom(s)!==geom(after[i]))) throw Error('SVG geometry changed');
const java = fs.readFileSync('examples/ch03/CapacityEstimate.java','utf8').split('    // BEGIN PAGE\n')[1].split('    // END PAGE')[0].trimEnd().split('\n').map(s=>s.startsWith('    ')?s.slice(4):s).join('\n');
const output='docs/reviews/screenshots/ch03';
fs.mkdirSync(output,{recursive:true});
const result={svgGeometryPreserved:26, svgTextChanged:before.flatMap((s,i)=>s===after[i]?[]:[i+1]), layouts:[], errors:[], frames:0};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const width of [320,390,768,1440]) for(const theme of ['parchment','dracula']) for(const locale of ['zh','en','both']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400) result.errors.push(r.status()+' '+r.url());});
  await page.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale);},{theme,locale});
  await page.goto('http://127.0.0.1:8765/chapters/ch03.html');
  await page.waitForSelector('.deck-next');
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,locale:document.documentElement.dataset.locale,theme:document.documentElement.dataset.theme,code:document.querySelector('pre code').textContent,frames:document.querySelectorAll('.slide').length}));
  if(layout.width!==width || layout.scrollWidth!==width || layout.locale!==locale || layout.theme!==theme || layout.frames!==26) throw Error('layout mismatch '+JSON.stringify(layout));
  if(layout.code!==java) throw Error('Java/page drift');
  delete layout.code;result.layouts.push(layout);
  if(locale==='both' && width===1440) {
   for(const [d,deck] of (await page.locator('.deck').all()).entries()) {
    for(let f=0;f<await deck.locator('.dot').count();f++) {
     await deck.locator('.dot').nth(f).click();
     if(await deck.locator('.slide.is-on').count()!==1) throw Error('frame state');
     await deck.locator('.slide.is-on svg').screenshot({path:`${output}/${theme}-d${d+1}s${f+1}.png`});
     result.frames++;
    }
   }
  }
  if([320,390,768,1440].includes(width) && locale==='both') {
   await page.locator('pre').scrollIntoViewIfNeeded();
   await page.screenshot({path:`${output}/${width}-${theme}-code.png`});
   await page.locator('.deck').last().locator('.dot').nth(3).click();
   await page.locator('.deck').last().scrollIntoViewIfNeeded();
   await page.screenshot({path:`${output}/${width}-${theme}-fallback.png`});
  }
  await context.close();
 }
 if(result.errors.length) throw Error(JSON.stringify(result.errors));
 result.pass=true;
} finally {await browser.close();fs.writeFileSync('docs/reviews/ch03-browser-results.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({pass:result.pass,layouts:result.layouts.length,frames:result.frames,svgTextChanged:result.svgTextChanged}));
