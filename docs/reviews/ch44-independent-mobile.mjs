import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/reviews/screenshots/ch44-independent/mobile');
fs.mkdirSync(out, { recursive: true });
const result = { sourceHashes: { 'chapters/ch44.html': crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'chapters/ch44.html'))).digest('hex') }, layouts: [], errors: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [320, 390]) for (const theme of ['parchment', 'dracula']) for (const locale of ['both', 'en']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error)));
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', locale);
    }, { theme, locale });
    await page.goto('http://127.0.0.1:8765/chapters/ch44.html');
    await page.waitForSelector('.code-copy');
    await page.evaluate(() => document.fonts.ready);
    const prefix = `${width}-${theme}-${locale}`;
    const code = page.locator('pre').first();
    await code.evaluate(e => e.scrollLeft = e.scrollWidth);
    const codeScroll = await code.evaluate(e => ({ left: e.scrollLeft, width: e.clientWidth, scrollWidth: e.scrollWidth }));
    if (!(codeScroll.left > 0 && codeScroll.scrollWidth > codeScroll.width)) throw new Error('code scroll failed');
    await code.evaluate(e => e.scrollLeft = 0);
    await code.evaluate(e => scrollTo({ top: scrollY + e.closest('.code-block').getBoundingClientRect().top - document.querySelector('.topbar').offsetHeight - 18, behavior: 'instant' }));
    await page.screenshot({ path: path.join(out, `${prefix}-code.png`) });
    const deck = page.locator('.deck').nth(4);
    await deck.locator('.dot').last().click();
    const slide = deck.locator('.slide.is-on');
    await slide.evaluate(e => e.scrollLeft = e.scrollWidth);
    const diagramScroll = await slide.evaluate(e => ({ left: e.scrollLeft, width: e.clientWidth, scrollWidth: e.scrollWidth }));
    if (!(diagramScroll.left > 0 && diagramScroll.scrollWidth > diagramScroll.width)) throw new Error('diagram scroll failed');
    await deck.evaluate(e => scrollTo({ top: scrollY + e.getBoundingClientRect().top - document.querySelector('.topbar').offsetHeight - 18, behavior: 'instant' }));
    await page.screenshot({ path: path.join(out, `${prefix}-d5s5-right.png`) });
    await slide.evaluate(e => e.scrollLeft = 0);
    await page.screenshot({ path: path.join(out, `${prefix}-d5s5-left.png`) });
    const state = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, headingCount: document.querySelectorAll('.chapter h2').length }));
    if (state.viewport !== width || state.page !== width || state.headingCount !== 12) throw new Error(JSON.stringify(state));
    result.layouts.push({ width, theme, locale, codeScroll, diagramScroll, ...state });
    await context.close();
  }
  result.passed = result.errors.length === 0;
} catch (error) { result.passed = false; result.failure = String(error); process.exitCode = 1; }
finally {
  await browser.close();
  fs.writeFileSync(path.join(root, 'docs/reviews/ch44-independent-mobile-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, layouts: result.layouts.length, failure: result.failure, errors: result.errors }));
}
