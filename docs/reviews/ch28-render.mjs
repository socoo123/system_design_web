import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const phase = process.argv.includes('--before') ? 'before' : 'after';
const source = phase === 'before' ? 'docs/reviews/ch28-ch29-ch30-baseline/ch28.html' : 'chapters/ch28.html';
const html = fs.readFileSync(source, 'utf8');
const out = `docs/reviews/screenshots/ch28-${phase}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = { phase, source, sha256: crypto.createHash('sha256').update(html).digest('hex'), actualPage: true, frames: [] };
try {
  for (const theme of ['parchment', 'dracula']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    if (phase === 'before') await page.route('**/chapters/ch28.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await page.goto('http://127.0.0.1:8765/chapters/ch28.html');
    await page.waitForSelector('.deck-next');
    await page.evaluate(() => document.fonts.ready);
    for (const [di, deck] of (await page.locator('.deck').all()).entries()) {
      for (let si = 0; si < await deck.locator('.dot').count(); si++) {
        await deck.locator('.dot').nth(si).click();
        const svg = deck.locator('.slide.is-on svg');
        const id = await svg.locator('title').getAttribute('id');
        const file = `${out}/${id.replace(/t$/, '')}-${theme}.png`;
        await svg.screenshot({ path: file });
        result.frames.push({ deck: di + 1, frame: si + 1, id, theme, file, box: await svg.boundingBox(), width: await page.evaluate(() => innerWidth) });
      }
    }
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`docs/reviews/ch28-${phase}-render-results.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ phase, frames: result.frames.length, sha256: result.sha256 }));
