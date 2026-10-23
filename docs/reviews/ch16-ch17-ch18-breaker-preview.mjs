import fs from 'node:fs';
import crypto from 'node:crypto';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const directory = 'docs/reviews/screenshots/ch16-ch17-ch18-root/breaker-final';
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const result = { htmlSha256: crypto.createHash('sha256').update(fs.readFileSync('chapters/ch17.html')).digest('hex'), views: [] };
try {
  for (const width of [390, 1440]) for (const theme of ['parchment', 'dracula']) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, reducedMotion: 'reduce' });
    await page.addInitScript(({theme}) => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, {theme});
    await page.goto('http://127.0.0.1:8765/chapters/ch17.html');
    await page.evaluate(() => document.fonts.ready);
    const block = page.locator('pre[data-source="GatewayPolicy.java#breaker"]').locator('..');
    await block.screenshot({ path: `${directory}/${width}-${theme}-code.png` });
    await block.evaluate(e => window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().bottom - 160, behavior: 'instant' }));
    await page.screenshot({ path: `${directory}/${width}-${theme}-explanation.png` });
    const view = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (view.width !== width || view.scrollWidth !== width) throw new Error('Preview overflow');
    result.views.push({ ...view, theme });
    await page.close();
  }
  result.passed = true;
} finally { await browser.close(); }
fs.writeFileSync('docs/reviews/ch16-ch17-ch18-breaker-preview.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
