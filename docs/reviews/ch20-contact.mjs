import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const phase = process.argv[2] || 'after';
if (!['before', 'after'].includes(phase)) throw Error('before/after');
const dir = `docs/reviews/screenshots/ch20/${phase}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (let deck = 1; deck <= 6; deck++) for (const theme of ['parchment', 'dracula']) {
    const imgs = Array.from({length:5}, (_, i) => {
      const file = path.join(dir, `d${deck}s${i + 1}-${theme}.png`);
      return `<figure><figcaption>D${deck} F${i + 1} ${theme}</figcaption><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}"></figure>`;
    }).join('');
    const page = await browser.newPage({ viewport: { width: 1920, height: 1400 } });
    await page.setContent(`<style>body{margin:0;background:#ddd;display:grid;grid-template-columns:1fr 1fr;gap:6px;font:16px sans-serif}figure{margin:0;min-width:0;background:white}img{display:block;width:100%}figcaption{padding:6px}</style>${imgs}`);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await page.screenshot({path:path.join(dir, `d${deck}-${theme}-contact.png`),fullPage:true});
    await page.close();
  }
} finally { await browser.close(); }
console.log(`Saved ${phase} Ch20 contact sheets`);
