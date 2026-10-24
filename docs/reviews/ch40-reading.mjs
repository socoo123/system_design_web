import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/reviews/screenshots/ch40-reading');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
  for (const theme of ['parchment', 'dracula']) {
    for (const item of [
      { width: 320, locale: 'en', selector: '.code-block', index: 2, label: 'writer' },
      { width: 390, locale: 'both', selector: '.code-block', index: 1, label: 'resume' },
      { width: 768, locale: 'both', selector: 'section:nth-of-type(2) table', index: 0, label: 'decision' },
      { width: 1440, locale: 'both', selector: '.cards-grid', index: 0, label: 'cards' },
      { width: 390, locale: 'both', selector: '.deck', index: 3, label: 'snapshot-scroll' },
    ]) {
      const context = await browser.newContext({ viewport: { width: item.width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(({ theme, locale }) => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', locale); }, { theme, locale: item.locale });
      await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
      await page.waitForSelector('.deck-next');
      await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); return document.fonts.ready; });
      const target = page.locator(item.selector).nth(item.index);
      let internalScroll = null;
      if (item.label === 'snapshot-scroll') {
        await target.locator('.dot').last().click();
        internalScroll = await target.locator('.slide.is-on').evaluate(e => {
          e.scrollLeft = e.scrollWidth - e.clientWidth;
          return { clientWidth: e.clientWidth, scrollWidth: e.scrollWidth, scrollLeft: e.scrollLeft };
        });
        if (!(internalScroll.scrollLeft > 0)) throw new Error('Expected horizontally scrollable diagram');
      }
      await target.evaluate(e => window.scrollTo({ top: scrollY + e.getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().height - 24, behavior: 'instant' }));
      const file = `${theme}-${item.width}-${item.locale}-${item.label}.png`;
      await page.screenshot({ path: path.join(out, file) });
      results.push({ ...item, theme, file, internalScroll, innerWidth: await page.evaluate(() => innerWidth), scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
      await context.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(root, 'docs/reviews/ch40-reading-results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Ch40: ${results.length} focused reading screenshots`);
