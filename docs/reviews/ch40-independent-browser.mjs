import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const output = 'docs/reviews/screenshots/ch40-independent-author42';
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync('chapters/ch40.html', 'utf8');
const before = fs.readFileSync('docs/reviews/ch40-ch41-ch42-baseline/ch40.html', 'utf8');
const ids = value => [...value.matchAll(/<(?:title|desc) id="([^"]+)"/g)].map(m => m[1]);
if (JSON.stringify(ids(html)) !== JSON.stringify(ids(before))) throw new Error('Animation ID/order changed');
const result = { chapterSha256: crypto.createHash('sha256').update(html).digest('hex'), layouts: [], frames: [], errors: [], interaction: {} };
const check = (value, text) => { if (!value) throw new Error(text); };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [320, 1440]) for (const theme of ['parchment', 'dracula']) for (const locale of ['zh', 'en', 'both']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.message));
    await page.addInitScript(({ theme, locale }) => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', locale); }, { theme, locale });
    await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
    await page.waitForSelector('.code-copy');
    await page.evaluate(() => { document.querySelectorAll('details').forEach(e => e.open = true); return document.fonts.ready; });
    const state = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      theme: document.documentElement.dataset.theme, locale: document.documentElement.dataset.locale,
      code: [...document.querySelectorAll('.code-bar')].map(e => ({
        overlap: e.firstElementChild.getBoundingClientRect().right > e.querySelector('.code-copy').getBoundingClientRect().left,
        label: e.firstElementChild.textContent,
      })),
      cards: document.querySelectorAll('.cards-grid .flip').length,
    }));
    check(state.width === width && state.scrollWidth === width, 'Real viewport page overflow');
    check(state.theme === theme && state.locale === locale, 'Setting mismatch');
    check(state.code.length === 3 && state.code.every(e => !e.overlap), 'Code label overlap');
    check(state.cards === 12, 'Card grid inventory');
    result.layouts.push(state);
    if (locale === 'both') {
      const writer = page.locator('.code-block').last();
      await writer.evaluate(e => scrollTo({ top: scrollY + e.getBoundingClientRect().top - document.querySelector('.topbar').getBoundingClientRect().height - 16, behavior: 'instant' }));
      await page.screenshot({ path: `${output}/${width}-${theme}-writer.png` });
    }
    await context.close();
  }
  for (const theme of ['parchment', 'dracula']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
    await page.evaluate(() => document.fonts.ready);
    for (const index of [3, 6]) {
      const deck = page.locator('.deck').nth(index);
      for (let n = 0; n < await deck.locator('.dot').count(); n++) {
        await deck.locator('.dot').nth(n).click();
        const svg = deck.locator('.slide.is-on svg');
        const file = `${output}/${theme}-d${index + 1}-s${n + 1}.png`;
        await svg.screenshot({ path: file });
        const outside = await svg.evaluate(e => [...e.querySelectorAll('text')].flatMap(t => {
          const b = t.getBBox(); return b.x < 0 || b.y < 0 || b.x + b.width > 960 || b.y + b.height > 420 ? [t.textContent] : [];
        }));
        check(outside.length === 0, 'SVG text outside viewBox');
        result.frames.push({ theme, deck: index + 1, frame: n + 1, file, outside });
      }
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    for (const index of [3, 6]) {
      const deck = page.locator('.deck').nth(index);
      await deck.locator('.dot').last().click();
      const state = await deck.locator('.slide.is-on').evaluate(e => {
        e.scrollLeft = e.scrollWidth - e.clientWidth;
        return { width: innerWidth, pageScrollWidth: document.documentElement.scrollWidth, scrollLeft: e.scrollLeft };
      });
      check(state.width === 390 && state.pageScrollWidth === 390 && state.scrollLeft > 0, '390px diagram end unreachable');
      await deck.screenshot({ path: `${output}/390-${theme}-d${index + 1}-right.png` });
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
  await page.locator('[data-locale-set="en"]').click();
  await page.locator('[data-theme-set="dracula"]').click();
  for (const block of await page.locator('.code-block').all()) {
    await block.locator('.code-copy').click();
    check(await page.evaluate(() => navigator.clipboard.readText()) === await block.locator('code').textContent(), 'Clipboard differs');
  }
  const card = page.locator('.flip').first();
  await card.click(); check((await card.getAttribute('class')).includes('is-flipped'), 'Card failed');
  await page.locator('.read-toggle').click();
  await page.reload();
  check(await page.locator('.read-toggle').getAttribute('aria-pressed') === 'true', 'Read flag not durable');
  check(await page.evaluate(() => document.documentElement.dataset.theme === 'dracula' && document.documentElement.dataset.locale === 'en'), 'Settings not durable');
  result.interaction = { copied: 3, flip: true, readAndSettingsPersisted: true };
  await context.close();
  check(result.errors.length === 0, 'Page errors');
  result.passed = true;
} catch (error) { result.passed = false; result.failure = String(error); process.exitCode = 1; }
finally {
  await browser.close();
  fs.writeFileSync('docs/reviews/ch40-independent-browser-results.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, layouts: result.layouts.length, modifiedFrames: result.frames.length, failure: result.failure }));
}
