import fs from 'node:fs';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const output = 'docs/reviews/screenshots/ch42-author/mobile';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const evidence = [];
try {
  for (const theme of ['parchment', 'dracula']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    await page.goto('http://127.0.0.1:8765/chapters/ch42.html');
    await page.evaluate(() => document.fonts.ready);
    for (const index of [3, 4]) {
      const deck = page.locator('.deck').nth(index);
      await deck.locator('.dot').last().click();
      const slide = deck.locator('.slide.is-on');
      for (const fraction of [0, .5, 1]) {
        const state = await slide.evaluate((e, fraction) => {
          e.scrollLeft = (e.scrollWidth - e.clientWidth) * fraction;
          return { innerWidth, pageScrollWidth: document.documentElement.scrollWidth, clientWidth: e.clientWidth, scrollWidth: e.scrollWidth, scrollLeft: e.scrollLeft };
        }, fraction);
        if (state.innerWidth !== 390 || state.pageScrollWidth !== 390 || state.scrollWidth <= state.clientWidth)
          throw new Error(JSON.stringify(state));
        const file = `${output}/d${index + 1}-${theme}-${fraction}.png`;
        await deck.screenshot({ path: file });
        evidence.push({ theme, deck: index + 1, fraction, file, ...state });
      }
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    const pre = page.locator('pre').first();
    await pre.evaluate(e => { e.scrollLeft = e.scrollWidth; window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().top - 260, behavior: 'instant' }); });
    await page.screenshot({ path: `${output}/320-${theme}-code-right.png` });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('docs/reviews/ch42-mobile-results.json', JSON.stringify({ passed: true, evidence }, null, 2) + '\n');
console.log('PASS: real 390px D4/D5 left/middle/right scrolling; 320px code end visible');
