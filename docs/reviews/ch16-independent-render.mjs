import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';

const before = process.argv.includes('--before');
const phase = before ? 'before' : 'after';
const source = before ? 'docs/reviews/ch16-ch17-ch18-baseline/ch16.html' : 'chapters/ch16.html';
const html = fs.readFileSync(source, 'utf8');
const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m => m[0]);
const out = `docs/reviews/screenshots/ch16-independent/${phase}`;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 420 }, reducedMotion: 'reduce' });
const results = { phase, sha256: crypto.createHash('sha256').update(html).digest('hex'), frames: [] };
try {
  for (const theme of ['parchment', 'dracula']) for (const svg of svgs) {
    const id = svg.match(/<title id="([^"]+)"/)[1].replace(/t$/, '');
    await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/${id}-${theme}.png` });
    results.frames.push({ id, theme, viewport: await page.evaluate(() => ({ width:innerWidth,scrollWidth:document.documentElement.scrollWidth })) });
  }
} finally { await browser.close(); }
fs.writeFileSync(`docs/reviews/ch16-independent-${phase}-render-results.json`, JSON.stringify(results,null,2)+'\n');
console.log(`${phase}: rendered ${results.frames.length} frames`);
