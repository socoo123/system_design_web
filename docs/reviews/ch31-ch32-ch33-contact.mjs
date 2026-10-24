// Actual SVG contact sheets. Each source is saved by hash; visual review is separate.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const phase = process.argv[2] || 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Expected before/after');
const root = process.cwd(), prefix = 'ch31-ch32-ch33';
const dir = `docs/reviews/screenshots/${prefix}-root/${phase}`;
fs.mkdirSync(dir, { recursive: true });
const base = process.env.SITE_BASE || 'http://127.0.0.1:8765';
const selected = process.env.CHAPTERS ? process.env.CHAPTERS.split(',') : ['ch31', 'ch32', 'ch33'];
if (!selected.every(ch => ['ch31', 'ch32', 'ch33'].includes(ch))) throw new Error('Unexpected chapter');
const resultPath = `docs/reviews/${prefix}-contact-${phase}.json`;
const previous = process.env.CHAPTERS && fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath)) : null;
const result = previous ? { ...previous, sheets: previous.sheets.filter(file => !selected.some(ch => path.basename(file).startsWith(ch + '-'))) }
  : { phase, files: {}, sheets: [], at: new Date().toISOString() };
result.runs = [...(result.runs || []), { at: new Date().toISOString(), chapters: selected }];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const chapter of selected) {
    const source = phase === 'before' ? `docs/reviews/${prefix}-baseline/${chapter}.html` : `chapters/${chapter}.html`;
    const html = fs.readFileSync(source, 'utf8');
    result.files[source] = crypto.createHash('sha256').update(html).digest('hex');
    const figures = [...html.matchAll(/<figure\b[^>]*class="deck"[^>]*>[\s\S]*?<\/figure>/g)].map(m => m[0]);
    if (figures.length !== 6) throw new Error(`Unexpected figure count ${chapter}`);
    for (const theme of ['parchment', 'dracula']) {
      const page = await browser.newPage({ viewport: { width: 1960, height: 1000 }, reducedMotion: 'reduce' });
      const cards = figures.map((figure, i) => {
        const svgs = [...figure.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
        return `<figure><figcaption>${chapter} D${i + 1} F${svgs.length} · ${theme}</figcaption>${svgs.at(-1).replaceAll('class="is-new"', 'class="is-new-off"')}</figure>`;
      }).join('');
      await page.setContent(`<!doctype html><html data-theme="${theme}" data-locale="zh"><head><meta charset="utf-8"><link rel="stylesheet" href="${base}/assets/css/style.css"><style>body{margin:0;padding:12px;display:grid;grid-template-columns:960px 960px;gap:12px}figure{margin:0;min-width:0}.board{width:960px;min-width:960px;display:block}figcaption{padding:8px;font-size:16px}</style></head><body>${cards}</body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const png = path.join(dir, `${chapter}-${theme}-contact.png`);
      await page.screenshot({ path: png, fullPage: true });
      result.sheets.push(png);
      await page.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ phase, updatedSheets: selected.length * 2, totalSheets: result.sheets.length }));
