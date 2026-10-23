// Render every retained frame in the real browser for visual inspection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const phase = process.argv[2] || 'after';
if (!['before','after'].includes(phase)) throw new Error('before or after');
const source = phase === 'before' ? 'docs/reviews/ch16-ch17-ch18-baseline/ch17.html' : 'chapters/ch17.html';
const html = fs.readFileSync(path.join(root, source), 'utf8');
const svgs = [...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
const output = path.join(root, `docs/reviews/screenshots/ch17/${phase}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const frames = [];
try {
  const page = await browser.newPage({ viewport: {width: 960, height: 420}, reducedMotion: 'reduce' });
  await page.goto(`${process.env.SITE_BASE || 'http://127.0.0.1:8765'}/chapters/ch17.html`);
  for (const theme of ['parchment','dracula']) for (const svg of svgs) {
    const id = svg.match(/<title id="([^"]+)"/)[1].replace(/t$/,'');
    await page.evaluate(({svg, theme}) => {
      document.documentElement.dataset.theme = theme;
      document.body.innerHTML = svg.replaceAll('class="is-new"','class="is-new-off"');
      const style = document.createElement('style');
      style.textContent = 'body{margin:0;padding:0}.board{width:960px;min-width:960px;height:420px;border-radius:0}';
      document.head.appendChild(style);
    },{svg,theme});
    await page.evaluate(() => document.fonts.ready);
    await page.locator('svg').screenshot({path:path.join(output, `${id}-${theme}.png`)});
    const geometry = await page.locator('svg').evaluate(el => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth, labels:[...el.querySelectorAll('text')].map(t=>{const b=t.getBBox();return {text:t.textContent,x:b.x,y:b.y,width:b.width,height:b.height};}) }));
    frames.push({id,theme,sha256:crypto.createHash('sha256').update(svg).digest('hex'),...geometry});
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(root,`docs/reviews/ch17-animation-${phase}.json`), JSON.stringify({source,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),frames},null,2)+'\n');
console.log(JSON.stringify({phase,frames:frames.length,output}));
