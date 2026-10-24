import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/reviews/screenshots/ch40-cid-fix');
fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const html = fs.readFileSync(path.join(root, 'chapters/ch40.html'), 'utf8');
const previous = JSON.parse(fs.readFileSync(path.join(root, 'docs/reviews/ch40-cid-fix-before.json')));
const result = { chapterSha256: sha(html), previousChapterSha256: previous.chapterSha256, changedFrames: [], layouts: [], frames: [], errors: [], passed: false };
function check(ok, label) { if (!ok) throw new Error(label); }
const svgHashes = Object.fromEntries([...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m => [m[0].match(/<title id="([^"]+)"/)[1], sha(m[0])]));
result.changedFrames = Object.keys(svgHashes).filter(id => svgHashes[id] !== previous.svgHashes[id]);
check(JSON.stringify(result.changedFrames) === JSON.stringify(['d7s4t', 'd7s5t']), 'Only two CID frames may change');
check(JSON.stringify([...html.matchAll(/<(?:title|desc) id="([^"]+)"/g)].map(m => m[1])) === JSON.stringify(previous.ids), 'Original IDs/order must remain');
check(JSON.stringify([...html.matchAll(/<pre\b[\s\S]*?<\/pre>/g)].map(m => sha(m[0]))) === JSON.stringify(previous.codeHashes), 'Code must remain byte-identical');
for (const [file, hash] of Object.entries(previous.exampleHashes)) check(sha(fs.readFileSync(path.join(root, file))) === hash, `Example changed: ${file}`);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const width of [390, 1440]) for (const theme of ['parchment', 'dracula']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
    await page.waitForSelector('.deck-next');
    await page.evaluate(() => document.fonts.ready);
    const deck = page.locator('.deck').nth(6);
    for (let i = 0; i < 5; i++) {
      await deck.locator('.dot').nth(i).click();
      check(await deck.locator('.deck-count').innerText() === `${i + 1} / 5`, 'D7 navigation');
      const svg = deck.locator('.slide.is-on svg');
      if (i >= 3) check((await svg.textContent()).includes('New local address: validate path; use a fresh CID'), 'Active migration requires fresh CID');
      if (width === 1440) {
        const file = `${theme}-d7-s${i + 1}.png`;
        await svg.screenshot({ path: path.join(out, file) });
        const outside = await svg.evaluate(e => [...e.querySelectorAll('text')].filter(t => { const b = t.getBBox(); return b.x < 0 || b.x + b.width > 960 || b.y < 0 || b.y + b.height > 420; }).map(t => t.textContent));
        check(!outside.length, 'D7 text bounds');
        result.frames.push({ theme, slide: i + 1, file });
      }
    }
    const card = page.locator('.flip').last();
    await card.click();
    const answer = await card.locator('.a').textContent();
    check(answer.includes('fresh CIDs for active local-address changes') && answer.includes('主动换本地地址用新CID'), 'Bilingual flashcard matches the active-migration rule');
    await card.screenshot({ path: path.join(out, `${theme}-${width}-last-card.png`) });
    const state = await page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    check(state.innerWidth === width && state.scrollWidth === width, 'Page overflow after CID text change');
    result.layouts.push({ width, theme, ...state });
    await context.close();
  }
  check(!result.errors.length, 'Browser errors');
  result.passed = true;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(root, 'docs/reviews/ch40-cid-fix-results.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: result.passed, chapterSha256: result.chapterSha256, changedFrames: result.changedFrames, renderedFrames: result.frames.length, layouts: result.layouts.length }));
