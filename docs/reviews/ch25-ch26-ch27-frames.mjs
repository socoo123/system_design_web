// Render every frame of each changed deck at its original 960px SVG width.
// Images are evidence for human review, not an automated correctness verdict.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const prefix = 'ch25-ch26-ch27';
const chapters = process.env.CHAPTERS?.split(',') || ['ch25', 'ch26', 'ch27'];
const out = `docs/reviews/screenshots/${prefix}-root/changed-frames`;
fs.mkdirSync(out, { recursive: true });
const target = `docs/reviews/${prefix}-frames.json`;
const previous = process.env.CHAPTERS && fs.existsSync(target) ? JSON.parse(fs.readFileSync(target)) : null;
const results = previous || { files: {}, chapters: {} };
const figures = html => [...html.matchAll(/<figure\b[^>]*class="deck"[^>]*>[\s\S]*?<\/figure>/g)].map(m => m[0]);
const svgs = figure => [...figure.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m => m[0]);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const ch of chapters) {
    const source = fs.readFileSync(`chapters/${ch}.html`, 'utf8');
    const old = figures(fs.readFileSync(`docs/reviews/${prefix}-baseline/${ch}.html`, 'utf8'));
    const now = figures(source);
    results.files[`chapters/${ch}.html`] = crypto.createHash('sha256').update(source).digest('hex');
    results.chapters[ch] = [];
    for (let i = 0; i < now.length; i++) {
      const current = svgs(now[i]), baseline = svgs(old[i]);
      const changed = current.flatMap((svg, j) => svg === baseline[j] ? [] : [j+1]);
      if (!changed.length) continue;
      const sheets = [];
      for (const theme of ['parchment', 'dracula']) {
        const page = await browser.newPage({ viewport: { width: 1960, height: 1000 }, reducedMotion: 'reduce' });
        const cards = current.map((svg, j) => `<figure><figcaption>${ch} D${i+1} F${j+1} · ${theme}</figcaption>${svg.replaceAll('class="is-new"', 'class="is-new-off"')}</figure>`).join('');
        await page.setContent(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0;padding:12px;display:grid;grid-template-columns:960px 960px;gap:12px}figure{margin:0;min-width:0}.board{width:960px;min-width:960px;display:block}figcaption{padding:8px;font-size:16px}</style></head><body>${cards}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(out, `${ch}-${theme}-d${i+1}-all.png`);
        await page.screenshot({ path: file, fullPage: true });
        sheets.push(file);
        await page.close();
      }
      results.chapters[ch].push({ deck: i+1, frames: current.length, changedFrames: changed, sheets });
    }
  }
} finally {
  await browser.close();
}
results.at = new Date().toISOString();
fs.writeFileSync(target, JSON.stringify(results, null, 2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(results.chapters).map(([ch, decks]) => [ch, decks.map(d => ({ deck: d.deck, frames: d.frames, changedFrames: d.changedFrames }))]))));
