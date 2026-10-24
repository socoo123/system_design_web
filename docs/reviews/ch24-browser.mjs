// Independent integration check. Does not modify the site or user browser.
// PLAYWRIGHT_MODULE points to an existing @playwright/test installation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = process.env.SITE_BASE || 'http://127.0.0.1:8765';
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/reviews/ch22-ch23-ch24-baseline.json')));
const output = path.join(root, 'docs/reviews/screenshots/ch24/browser');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const selectedChapters = process.env.CHAPTERS ? process.env.CHAPTERS.split(',') : ['ch24'];
const resultFile = path.join(root, 'docs/reviews/ch24-browser-results.json');
const previous = process.env.CHAPTERS && fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile)) : null;
const result = previous ? {
  layouts: previous.layouts.filter(r => !selectedChapters.includes(r.chapter)),
  interactions: previous.interactions.filter(r => !selectedChapters.includes(r.chapter)),
  errors: [], files: { ...previous.files }, runs: [...(previous.runs || [])]
} : { layouts: [], interactions: [], errors: [], files: {}, runs: [] };
result.runs.push({ chapters: selectedChapters, startedAt: new Date().toISOString() });
function check(condition, message) { if (!condition) throw new Error(message); }
function watch(page, label) {
  page.on('pageerror', error => result.errors.push(`${label}: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) result.errors.push(`${label}: ${response.status()} ${response.url()}`);
  });
}
try {
  for (const chapter of selectedChapters) {
    result.files[chapter] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, `chapters/${chapter}.html`))).digest('hex');
    for (const width of [390, 768, 1440]) for (const theme of ['parchment', 'dracula']) for (const locale of ['zh', 'en', 'both']) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      watch(page, `${chapter}/${width}/${theme}/${locale}`);
      await page.addInitScript(({ theme, locale }) => {
        localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', locale);
      }, { theme, locale });
      await page.goto(`${base}/chapters/${chapter}.html`);
      await page.waitForSelector('.deck-next');
      await page.evaluate(() => document.fonts.ready);
      const state = await page.evaluate(() => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        theme: document.documentElement.dataset.theme, locale: document.documentElement.dataset.locale,
        slides: [...document.querySelectorAll('.slide svg title')].map(e => e.id),
        invalidSvgAttributes: [...document.querySelectorAll('svg *')].flatMap(e => [...e.attributes].filter(a => /^(d|points|x|y|width|height|cx|cy|r|rx|ry|viewBox|transform)$/.test(a.name) && /NaN|undefined|Infinity/.test(a.value)).map(a => ({ tag: e.tagName, name: a.name, value: a.value }))),
        decks: document.querySelectorAll('.deck').length,
        code: [...document.querySelectorAll('pre')].map(e => ({ kind: e.dataset.kind, language: e.dataset.language, length: e.textContent.length })),
        images: [...document.images].map(e => ({ src: e.getAttribute('src'), loaded: e.complete && e.naturalWidth > 0 })),
        flashcards: { count: document.querySelectorAll('.flip').length, inGrid: [...document.querySelectorAll('.flip')].every(e => e.closest('.cards-grid') && getComputedStyle(e.closest('.cards-grid')).display === 'grid'), columns: [...document.querySelectorAll('.cards-grid')].map(e => getComputedStyle(e).gridTemplateColumns) },
        visibleCodeHasChinese: [...document.querySelectorAll('pre code')].some(e => e.getClientRects().length && /[\u3400-\u9fff]/.test(e.textContent)),
        toc: [...document.querySelectorAll('.toc-links a')].every(e => !!document.getElementById(decodeURIComponent(e.hash.slice(1))))
      }));
      check(state.width === width && state.scrollWidth === width, `Page overflow ${chapter}/${width}/${theme}/${locale}`);
      check(state.theme === theme && state.locale === locale, 'Theme/locale mismatch');
      check(JSON.stringify(state.slides) === JSON.stringify(baseline.chapters[chapter].slideIds), `Animation inventory changed ${chapter}`);
      check(state.decks === baseline.chapters[chapter].decks.length, `Deck inventory changed ${chapter}`);
      check(state.code.length && state.code.every(e => e.kind && e.language && e.length), `Unlabelled/empty code ${chapter}`);
      check(state.invalidSvgAttributes.length === 0, `Invalid SVG numeric attribute ${chapter}`);
      check(state.images.every(e => e.loaded), `Missing static image ${chapter}`);
      check(state.toc, `Broken TOC ${chapter}`);
      check(state.flashcards.count && state.flashcards.inGrid, `Flashcard grid ${chapter}`);
      if (locale === 'en') check(!state.visibleCodeHasChinese, `Chinese in English-mode code ${chapter}`);
      const expanded = await page.evaluate(() => {
        document.querySelectorAll('details').forEach(e => e.open = true);
        return { details: document.querySelectorAll('details').length, scrollWidth: document.documentElement.scrollWidth };
      });
      check(expanded.scrollWidth === width, `Expanded content overflow ${chapter}/${width}/${theme}/${locale}`);
      state.expanded = expanded;
      let frameVisits = 0;
      if ([390, 1440].includes(width) && locale === 'both') {
        let deckNumber = 0;
        for (const deck of await page.locator('.deck').all()) {
          deckNumber++;
          const count = await deck.locator('.dot').count();
          for (let i = 0; i < count; i++) {
            await deck.locator('.dot').nth(i).click();
            check(await deck.locator('.deck-count').innerText() === `${i + 1} / ${count}`, `Playback navigation ${chapter}`);
            check(await deck.locator('.slide.is-on').count() === 1, 'Multiple visible frames');
            frameVisits++;
            if (width === 390 && [2, 4, 5].includes(deckNumber)) {
              for (const position of ['left','middle','right']) {
                const active=deck.locator('.slide.is-on');
                await active.evaluate((e,p) => { e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2; },position);
                await deck.screenshot({path:path.join(output,`d${deckNumber}s${i+1}-${theme}-${position}.png`)});
              }
              await deck.locator('.slide.is-on').evaluate(e => e.scrollLeft=0);
            }
          }
          if (width === 1440) await deck.screenshot({ path: path.join(output, `${chapter}-${theme}-deck${deckNumber}-last.png`) });
        }
        const representativeCode = page.locator('.code-block').first();
        await representativeCode.evaluate(e => window.scrollTo({
          top: window.scrollY + e.getBoundingClientRect().top - 145,
          behavior: 'instant'
        }));
        await page.screenshot({ path: path.join(output, `${chapter}-${width}-${theme}-code.png`) });
      }
      await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({path:path.join(output,`${width}-${theme}-${locale}-top.png`)});
      result.layouts.push({ chapter, ...state, frameVisits });
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(); watch(page, `${chapter}/interaction`);
    await page.goto(`${base}/chapters/${chapter}.html`);
    await page.locator('[data-locale-set="en"]').click();
    await page.locator('[data-theme-set="dracula"]').click();
    let copied = 0;
    for (const block of await page.locator('.code-block').all()) {
      if (!(await block.isVisible())) continue;
      await block.locator('.code-copy').click();
      check(await page.evaluate(() => navigator.clipboard.readText()) === await block.locator('code').textContent(), `Clipboard mismatch ${chapter}`);
      copied++;
    }
    const deck = page.locator('.deck').first();
    await deck.locator('.dot').first().click();
    await deck.focus(); await page.keyboard.press('ArrowRight');
    check((await deck.locator('.deck-count').innerText()).startsWith('2 /'), `Keyboard navigation ${chapter}`);
    await deck.locator('.deck-speed').click(); await deck.locator('.deck-loop').click();
    const preferences = await page.evaluate(() => ({ speed: localStorage.getItem('sd-deck-speed'), loop: localStorage.getItem('sd-deck-loop') }));
    await deck.locator('.deck-toggle').click();
    await page.waitForFunction(() => !document.querySelector('.deck-count').textContent.startsWith('2 /'), null, { timeout: 6000 });
    await deck.locator('.deck-toggle').click();
    const flash = page.locator('.flip').first(); await flash.click();
    check((await flash.getAttribute('class')).includes('is-flipped'), `Flashcard ${chapter}`);
    await flash.focus(); await page.keyboard.press('Enter');
    check(!(await flash.getAttribute('class')).includes('is-flipped'), `Flashcard keyboard ${chapter}`);
    await page.keyboard.press('Space');
    check((await flash.getAttribute('class')).includes('is-flipped'), `Flashcard space ${chapter}`);
    await page.locator('.read-toggle').click(); await page.reload();
    check(await page.locator('.read-toggle').getAttribute('aria-pressed') === 'true', `Read persistence ${chapter}`);
    check(await page.evaluate(() => document.documentElement.dataset.theme === 'dracula' && document.documentElement.dataset.locale === 'en'), `Settings persistence ${chapter}`);
    check(JSON.stringify(await page.evaluate(() => ({ speed: localStorage.getItem('sd-deck-speed'), loop: localStorage.getItem('sd-deck-loop') }))) === JSON.stringify(preferences), `Playback preferences ${chapter}`);
    result.interactions.push({ chapter, copied, keyboard: true, playback: true, flashcards: true, progress: true, settings: true });
    await context.close();
  }
  check(result.errors.length === 0, JSON.stringify(result.errors));
  result.passed = true;
} catch (error) {
  result.passed = false; result.failure = String(error); process.exitCode = 1;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(root, 'docs/reviews/ch24-browser-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, failure: result.failure, layouts: result.layouts.length, frameVisits: result.layouts.reduce((n, r) => n + r.frameVisits, 0), interactions: result.interactions, errors: result.errors }));
}
