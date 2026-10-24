// Affected-scope recheck after the author's active-migration CID fix.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const oldReview = JSON.parse(fs.readFileSync('docs/reviews/ch40-independent-check-results.json'));
const oldBrowser = JSON.parse(fs.readFileSync('docs/reviews/ch40-independent-browser-results.json'));
const before = JSON.parse(fs.readFileSync('docs/reviews/ch40-cid-fix-before.json'));
const html = fs.readFileSync('chapters/ch40.html', 'utf8');
const sourceFiles = ['chapters/ch40.html', ...fs.readdirSync('examples/ch40').map(f => `examples/ch40/${f}`)].filter(f => fs.statSync(f).isFile());
const hashes = () => Object.fromEntries(sourceFiles.map(f => [f, sha(fs.readFileSync(f))]));
const sourceHashes = hashes();
const output = 'docs/reviews/screenshots/ch40-independent-author42';
const result = { passed: false, sourceHashes, previousSourceHashes: oldReview.sourceHashes, previousChapterSha256: oldBrowser.chapterSha256, changedFrames: [], frames: [], layouts: [], openFindings: [], closedFindings: [{ id: 'CH40-I1', severity: 'P1', previous: 'Active Wi-Fi/mobile local-address change described CID rotation as optional.', correction: 'D7S4/S5 require a fresh CID; same QUIC connection remains; bilingual caption/description/flashcard agree.', source: 'https://www.rfc-editor.org/rfc/rfc9000.html#section-9.5' }] };
const check = (ok, message) => { if (!ok) throw new Error(message); };
check(oldReview.passed && oldBrowser.passed, 'Initial independent evidence failed');
check(before.chapterSha256 === oldBrowser.chapterSha256, 'Fix baseline differs from reviewed source');
for (const f of sourceFiles.filter(f => f.startsWith('examples/')))
  check(sourceHashes[f] === oldReview.sourceHashes[f], `Previously tested example changed: ${f}`);
const svgHashes = Object.fromEntries([...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m => [m[0].match(/<title id="([^"]+)"/)[1], sha(m[0])]));
result.changedFrames = Object.keys(svgHashes).filter(k => svgHashes[k] !== before.svgHashes[k]);
check(JSON.stringify(result.changedFrames) === JSON.stringify(['d7s4t', 'd7s5t']), 'Unexpected frame changes');
check(JSON.stringify([...html.matchAll(/<pre\b[\s\S]*?<\/pre>/g)].map(m => sha(m[0]))) === JSON.stringify(before.codeHashes), 'Previously compiled code excerpts changed');
check(!html.includes('CID may rotate') && html.includes('fresh CIDs for active local-address changes'), 'Optional CID wording survived');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  for (const theme of ['parchment', 'dracula']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(theme => { localStorage.setItem('sd-theme', theme); localStorage.setItem('sd-locale', 'both'); }, theme);
    await page.goto('http://127.0.0.1:8765/chapters/ch40.html');
    await page.evaluate(() => document.fonts.ready);
    const deck = page.locator('.deck').nth(6);
    for (let i = 0; i < 5; i++) {
      await deck.locator('.dot').nth(i).click();
      const svg = deck.locator('.slide.is-on svg');
      if (i >= 3) check((await svg.textContent()).includes('New local address: validate path; use a fresh CID'), 'Wrong active migration label');
      const file = `${output}/fixed-${theme}-d7-s${i + 1}.png`;
      await svg.screenshot({ path: file });
      result.frames.push({ theme, frame: i + 1, file });
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const state = await page.evaluate(() => ({ innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      check(state.innerWidth === width && state.scrollWidth === width, 'Affected text introduced overflow');
      result.layouts.push({ theme, ...state });
      if (width === 390) {
        const slide = deck.locator('.slide.is-on');
        await slide.evaluate(e => { e.scrollLeft = (e.scrollWidth - e.clientWidth) / 2; });
        await deck.screenshot({ path: `${output}/fixed-390-${theme}-d7-middle.png` });
      }
      const card = page.locator('.flip').last();
      if (!(await card.getAttribute('class')).includes('is-flipped')) await card.click();
      const answer = await card.locator('.a').textContent();
      check(answer.includes('主动换本地地址用新CID') && answer.includes('fresh CIDs for active local-address changes'), 'Card differs from the fixed rule');
      await card.screenshot({ path: `${output}/fixed-${width}-${theme}-card.png` });
    }
    await context.close();
  }
  check(JSON.stringify(hashes()) === JSON.stringify(sourceHashes), 'Author source changed during final recheck');
  result.passed = true;
} catch (error) { result.failure = String(error); result.openFindings.push({ severity: 'P1', description: String(error) }); process.exitCode = 1; }
finally {
  await browser.close();
  fs.writeFileSync('docs/reviews/ch40-independent-final.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ passed: result.passed, chapterSha256: sourceHashes['chapters/ch40.html'], openFindings: result.openFindings, changedFrames: result.changedFrames, frames: result.frames.length, layouts: result.layouts.length }));
}
