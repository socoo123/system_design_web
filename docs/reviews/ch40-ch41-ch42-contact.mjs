// Native-size SVG contact sheets for human review; not a correctness test.
import fs from 'node:fs';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const prefix = 'ch40-ch41-ch42';
const mode = process.argv.includes('--before') ? 'before' : 'after';
const out = `docs/reviews/screenshots/${prefix}-root/contact-${mode}`;
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
const result = {mode, sources:{}, sheets:[]};
try {
  for (const ch of ['ch40','ch41','ch42']) {
    const filename = mode === 'before' ? `docs/reviews/${prefix}-baseline/${ch}.html` : `chapters/${ch}.html`;
    const html = fs.readFileSync(filename,'utf8');
    result.sources[filename] = crypto.createHash('sha256').update(html).digest('hex');
    const figures = [...html.matchAll(/<figure\b[^>]*class="deck"[^>]*>[\s\S]*?<\/figure>/g)].map(m=>m[0]);
    const finals = figures.map(f=>[...f.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].at(-1)[0]);
    for(const theme of ['parchment','dracula']) {
      const page = await browser.newPage({viewport:{width:1960,height:1000},reducedMotion:'reduce'});
      await page.setContent(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0;padding:12px;display:grid;grid-template-columns:960px 960px;gap:12px}figure{margin:0;min-width:0}.board{width:960px;min-width:960px;display:block}figcaption{padding:8px;font-size:16px}</style></head><body>${finals.map((svg,i)=>`<figure><figcaption>${ch} D${i+1} final · ${theme} · ${mode}</figcaption>${svg.replaceAll('class="is-new"','class="is-new-off"')}</figure>`).join('')}</body></html>`);
      await page.evaluate(()=>document.fonts.ready);
      const image = `${out}/${ch}-${theme}.png`;
      await page.screenshot({path:image,fullPage:true});
      result.sheets.push({image,sha256:crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex')});
      await page.close();
    }
  }
} finally {await browser.close();}
fs.writeFileSync(`docs/reviews/${prefix}-contact-${mode}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({mode,sheets:result.sheets.length}));
