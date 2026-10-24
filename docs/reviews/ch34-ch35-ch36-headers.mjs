// Diagnose actual 320px code headers; no site mutation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const rows = [];
try {
  for (const chapter of ['ch34', 'ch35', 'ch36']) for (const locale of ['en', 'both']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 1000 } });
    await page.addInitScript(locale => { localStorage.setItem('sd-locale', locale); localStorage.setItem('sd-theme', 'parchment'); }, locale);
    await page.goto(`http://127.0.0.1:8765/chapters/${chapter}.html`);
    await page.evaluate(() => { document.querySelectorAll('details').forEach(e => e.open = true); return document.fonts.ready; });
    const metrics = await page.evaluate(() => [...document.querySelectorAll('.code-bar')].map(bar => {
      const copy = bar.querySelector('.code-copy'), style = getComputedStyle(copy), r = copy.getBoundingClientRect();
      const en = copy.querySelector('.lang-en');
      return { label: bar.firstElementChild.textContent, copy: copy.textContent,
        height: r.height, width: r.width, lineHeight: style.lineHeight,
        paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth,
        enRects: [...en.getClientRects()].map(b => ({ top: b.top, width: b.width, height: b.height })) };
    }));
    rows.push({ chapter, locale, sourceHash: crypto.createHash('sha256').update(fs.readFileSync(`chapters/${chapter}.html`)).digest('hex'), metrics });
    await page.locator('.code-bar').first().screenshot({ path: `docs/reviews/screenshots/ch34-ch35-ch36-root/${chapter}-320-${locale}-header.png` });
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync('docs/reviews/ch34-ch35-ch36-code-header-preview.json', JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify(rows.map(r => ({ chapter: r.chapter, locale: r.locale, headers: r.metrics.map(m => ({ label: m.label, height: m.height, enRects: m.enRects })) }))));
