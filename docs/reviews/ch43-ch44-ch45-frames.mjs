// Render every frame of each changed deck at its original 960px SVG width.
// Images are evidence for human review, not an automated correctness verdict.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const prefix = 'ch43-ch44-ch45';
const chapters = process.env.CHAPTERS?.split(',') || ['ch43', 'ch44', 'ch45'];
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
    const old = figures(fs.readFileSync(`docs/reviews/ch43-ch44-ch45-baseline/${ch}.html`, 'utf8'));
    const now = figures(source);
    results.files[`chapters/${ch}.html`] = crypto.createHash('sha256').update(source).digest('hex');
    results.chapters[ch] = [];
    const changedDecks = now.map((figure, i) => ({ current: svgs(figure), baseline: svgs(old[i]), index: i }))
      .map(d => ({ ...d, changed: d.current.flatMap((svg, j) => svg === d.baseline[j] ? [] : [j + 1]) }))
      .filter(d => d.changed.length);
    for (const d of changedDecks) results.chapters[ch].push({ deck: d.index + 1, frames: d.current.length, changedFrames: d.changed, nativeFrames: [], sheets: [] });
    for (const theme of ['parchment', 'dracula']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
      await page.route(`**/chapters/${ch}.html`, route => route.fulfill({ contentType: 'text/html', body: source }));
      await page.goto(`http://127.0.0.1:8765/chapters/${ch}.html`);
      await page.waitForSelector('.deck-next');
      await page.evaluate(() => document.fonts.ready);
      // QA-only sizing on the actual page; the separate layout matrix uses unmodified CSS.
      await page.addStyleTag({ content: '.deck{width:990px;max-width:none}.deck .board{width:960px;min-width:960px;max-width:none}' });
      for (const d of changedDecks) {
        const entry = results.chapters[ch].find(e => e.deck === d.index + 1);
        const deck = page.locator('.deck').nth(d.index);
        const images = [];
        for (let j = 0; j < d.current.length; j++) {
          await deck.locator('.dot').nth(j).click();
          const svg = deck.locator('.slide.is-on svg');
          const width = await svg.evaluate(e => e.getBoundingClientRect().width);
          if (width !== 960) throw new Error(`Expected native SVG width: ${ch}/${d.index + 1}/${j + 1}: ${width}`);
          const filename = path.join(out, `${ch}-${theme}-d${d.index + 1}-s${j + 1}.png`);
          await svg.screenshot({ path: filename });
          entry.nativeFrames.push({ theme, slide: j + 1, image: filename, sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') });
          images.push(filename);
        }
        const sheetPage = await context.newPage();
        await sheetPage.setViewportSize({ width: 1960, height: 1000 });
        await sheetPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:${theme === 'parchment' ? '#f0f7ef' : '#101116'};color:${theme === 'parchment' ? '#294c3b' : '#eee'};display:grid;grid-template-columns:960px 960px;gap:12px;font:14px sans-serif}figure{margin:0}figcaption{padding:8px}img{display:block;width:960px}</style></head><body>${images.map((image, j) => `<figure><figcaption>${ch} D${d.index + 1} F${j + 1} · ${theme} · actual page at native SVG width</figcaption><img src="http://127.0.0.1:8765/${image}"></figure>`).join('')}</body></html>`);
        if (!(await sheetPage.evaluate(() => [...document.images].every(e => e.complete && e.naturalWidth === 960)))) throw new Error('Contact image load failed');
        const sheet = path.join(out, `${ch}-${theme}-d${d.index + 1}-all.png`);
        await sheetPage.screenshot({ path: sheet, fullPage: true });
        entry.sheets.push(sheet);
        await sheetPage.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
results.at = new Date().toISOString();
fs.writeFileSync(target, JSON.stringify(results, null, 2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(results.chapters).map(([ch, decks]) => [ch, decks.map(d => ({ deck: d.deck, frames: d.frames, changedFrames: d.changedFrames }))]))));
