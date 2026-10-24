import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stage = process.argv[2] || 'after';
if (!['before', 'after'].includes(stage)) throw new Error('Use before or after');
const source = stage === 'before' ? 'docs/reviews/ch43-ch44-ch45-baseline/ch44.html' : 'chapters/ch44.html';
const html = fs.readFileSync(path.join(root, source), 'utf8');
const out = path.join(root, `docs/reviews/screenshots/ch44-independent/${stage}`);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = { stage, source, sha256: crypto.createHash('sha256').update(html).digest('hex'), frames: [], errors: [] };
try {
  for (const theme of ['parchment', 'dracula']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.message));
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    await page.route('**/chapters/ch44.html', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://127.0.0.1:8765/chapters/ch44.html');
    await page.waitForSelector('.deck-next');
    await page.evaluate(() => document.fonts.ready);
    for (const [d, deck] of (await page.locator('.deck').all()).entries()) {
      const dots = deck.locator('.dot');
      for (let s = 0; s < await dots.count(); s++) {
        await dots.nth(s).click();
        const svg = deck.locator('.slide.is-on svg');
        const file = path.join(out, `${theme}-d${d + 1}-s${s + 1}.png`);
        await svg.screenshot({ path: file });
        const metrics = await svg.evaluate(e => ({
          title: e.querySelector('title').id,
          outside: [...e.querySelectorAll('text')].map(t => ({ label: t.textContent, box: t.getBBox() })).filter(t => t.box.x < 0 || t.box.y < 0 || t.box.x + t.box.width > 960 || t.box.y + t.box.height > 420),
          renderedWidth: e.getBoundingClientRect().width
        }));
        result.frames.push({ theme, deck: d + 1, slide: s + 1, file: path.relative(root, file), ...metrics });
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
result.passed = result.errors.length === 0 && result.frames.length === 72 && result.frames.every(f => !f.outside.length);
fs.writeFileSync(path.join(root, `docs/reviews/ch44-independent-${stage}-frames.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed: result.passed, frames: result.frames.length, errors: result.errors, outside: result.frames.filter(f => f.outside.length) }));
if (!result.passed) process.exitCode = 1;
