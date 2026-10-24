import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const root = process.cwd();
const out = path.join(root, 'docs/reviews/screenshots/ch45-author/reading');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = { sha256: crypto.createHash('sha256').update(fs.readFileSync('chapters/ch45.html')).digest('hex'), shots: [] };
const plans = [
  { width: 320, locale: 'both', label: 'edit', selector: '[data-source="DomainModel.java#edit"]', code: true },
  { width: 320, locale: 'en', label: 'edit-tx', selector: '[data-source="edit.pseudo"]', code: true },
  { width: 390, locale: 'both', label: 'capture', selector: '[data-source="DomainModel.java#capture"]', code: true },
  { width: 390, locale: 'both', label: 'consume-tx', selector: '[data-source="consume.pseudo"]', code: true },
  { width: 390, locale: 'both', label: 'refund-scroll', deck: 6 },
  { width: 768, locale: 'both', label: 'assumptions', selector: 'article > section details', open: true },
  { width: 1440, locale: 'both', label: 'intro', selector: 'article > section' },
  { width: 1440, locale: 'both', label: 'cards', selector: '.cards-grid' },
];
try {
  for (const theme of ['parchment', 'dracula']) for (const plan of plans) {
    const context = await browser.newContext({ viewport: { width: plan.width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', locale);
    }, { theme, locale: plan.locale });
    await page.goto('http://127.0.0.1:8765/chapters/ch45.html');
    await page.waitForSelector('.deck-next');
    await page.evaluate(() => document.fonts.ready);
    let locator;
    if (plan.deck !== undefined) {
      locator = page.locator('.deck').nth(plan.deck);
      await locator.locator('.dot').last().click();
      await locator.locator('.slide.is-on').evaluate(e => e.scrollLeft = e.scrollWidth);
    } else {
      locator = page.locator(plan.selector).first();
      if (plan.open) await locator.evaluate(e => e.open = true);
      if (plan.code) locator = locator.locator('..');
    }
    await locator.evaluate(e => scrollTo({ top: scrollY + e.getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().height - 20, behavior: 'instant' }));
    const state = await page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (state.innerWidth !== plan.width || state.scrollWidth !== plan.width) throw Error('Real viewport mismatch');
    const file = path.join(out, `${theme}-${plan.width}-${plan.locale}-${plan.label}.png`);
    await page.screenshot({ path: file });
    result.shots.push({ theme, ...plan, ...state, file: path.relative(root, file) });
    await context.close();
  }
  result.passed = true;
} finally {
  await browser.close();
  fs.writeFileSync('docs/reviews/ch45-reading-results.json', JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: result.passed, screenshots: result.shots.length }));
