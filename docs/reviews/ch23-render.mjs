import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const source = phase === 'before' ? 'docs/reviews/ch22-ch23-ch24-baseline/ch23.html' : 'chapters/ch23.html';
const html = fs.readFileSync(source, 'utf8');
const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m => m[0]);
const out = `docs/reviews/screenshots/ch23/${phase}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 420 }, reducedMotion: 'reduce' });
const result = { phase, source, sha256: crypto.createHash('sha256').update(html).digest('hex'), frames: [], pages: [] };
try {
  for (const theme of ['parchment', 'dracula']) for (const svg of svgs) {
    const id = svg.match(/<title id="([^"]+)"/)[1].replace(/t$/, '');
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const textBounds = await page.locator('svg text').evaluateAll(els => els.map(e => ({text:e.textContent,x:e.getBBox().x,y:e.getBBox().y,width:e.getBBox().width,height:e.getBBox().height})).filter(e=>e.x<0||e.y<0||e.x+e.width>960||e.y+e.height>420));
    await page.screenshot({ path: `${out}/${id}-${theme}.png` });
    result.frames.push({ id, theme, textBounds, screenshot: `${out}/${id}-${theme}.png` });
  }
  for (const width of [1440,390]) for (const theme of ['parchment','dracula']) {
    const context = await browser.newContext({ viewport:{width,height:1000}, reducedMotion:'reduce' });
    const p=await context.newPage();
    await p.addInitScript(({theme})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},{theme});
    await p.route('**/chapters/ch23.html',route=>route.fulfill({contentType:'text/html',body:html}));
    await p.goto('http://127.0.0.1:8765/chapters/ch23.html');
    await p.waitForSelector('.deck-next');
    await p.screenshot({path:`${out}/page-${width}-${theme}-top.png`});
    let i=0;
    for(const deck of await p.locator('.deck').all()){
      i++;
      await deck.locator('.dot').last().click();
      await deck.screenshot({path:`${out}/page-${width}-${theme}-d${i}-last.png`});
    }
    result.pages.push({width,theme,...await p.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}))});
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`docs/reviews/ch23-${phase}-render-results.json`,JSON.stringify(result,null,2)+'\n');
console.log(`${phase}: ${result.frames.length} frame renders, ${result.pages.length} real page layouts`);
