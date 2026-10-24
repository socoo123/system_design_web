// Native-size SVG evidence; layout/interaction checks are separate.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const root = process.cwd();
const mode = process.argv[2] || 'after';
const source = mode === 'before' ? 'docs/reviews/ch40-ch41-ch42-baseline/ch42.html' : 'chapters/ch42.html';
const html = fs.readFileSync(source, 'utf8');
const frames = [...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
const output = path.join(root, 'docs/reviews/screenshots/ch42-author', mode);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 420 }, deviceScaleFactor: 1 });
  for (const theme of ['parchment', 'dracula']) for (const svg of frames) {
    const id = svg.match(/aria-labelledby="(\S+)t /)[1];
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0}.board{width:960px;min-width:960px}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const outside = await page.locator('svg').evaluate(svg => [...svg.querySelectorAll('text')].flatMap(t => {
      const b = t.getBBox();
      return b.x < 0 || b.x + b.width > 960 || b.y < 0 || b.y + b.height > 420 ? [{ text: t.textContent, x: b.x, right: b.x + b.width, y: b.y }] : [];
    }));
    await page.locator('svg').screenshot({ path: path.join(output, `${id}-${theme}.png`) });
    report.push({ id, theme, outside });
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(root, `docs/reviews/ch42-frames-${mode}.json`), JSON.stringify({ source, count: frames.length, report }, null, 2) + '\n');
console.log(JSON.stringify({ mode, frames: frames.length, screenshots: report.length, outside: report.filter(r => r.outside.length) }));
