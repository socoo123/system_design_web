import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const index = read("index.html");
for (const id of ["ch01", "ch09"]) {
  if (!index.includes(`chapters/${id}.html`)) fail(`index does not link chapters/${id}.html`);
}

const linked = new Set();
for (const m of index.matchAll(/href="(chapters\/ch\d+\.html)"/g)) linked.add(m[1]);
if (!linked.size) fail("index has no chapter links");
for (const href of linked) {
  if (!fs.existsSync(path.join(root, href))) fail(`index links missing file ${href}`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs, out);
    else if (name.endsWith(".html") || name.endsWith(".js") || name.endsWith(".css")) out.push(abs);
  }
  return out;
}

const siteFiles = [
  path.join(root, "index.html"),
  ...walk(path.join(root, "chapters")),
  ...walk(path.join(root, "assets")),
];
for (const abs of siteFiles) {
  const text = fs.readFileSync(abs, "utf8");
  const rel = path.relative(root, abs);
  if (/```d2|mermaid/i.test(text)) fail(`${rel} still has d2 or mermaid`);
  if (/<script[^>]+src=["']https?:/i.test(text)) fail(`${rel} loads a CDN script`);
}

function decksOf(html) {
  const decks = [];
  const re = /<figure class="deck">([\s\S]*?)<\/figure>/g;
  let m;
  while ((m = re.exec(html))) decks.push(m[1]);
  return decks;
}

function deckRange(num) {
  if (num <= 8) return [4, 6];
  if (num <= 35) return [5, 7];
  return [6, 8];
}

const chapterFiles = fs.readdirSync(path.join(root, "chapters"))
  .filter((name) => /^ch\d+\.html$/.test(name))
  .sort();
const ranges = Object.fromEntries(chapterFiles.map((name) => {
  const num = Number(name.slice(2, 4));
  return [`chapters/${name}`, deckRange(num)];
}));
if (!fs.existsSync(path.join(root, "favicon.ico"))) fail("missing favicon.ico");

// Equal language-node counts miss cross-language nesting. Parse tag ancestry
// without adding a dependency; ignore raw-text elements and HTML comments.
const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
function checkLanguageAndChips(html, rel) {
  const source = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const stack = [];
  for (const match of source.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (token.startsWith("</")) {
      let i = stack.length - 1;
      while (i >= 0 && stack[i].tag !== tag) i--;
      if (i < 0) continue;
      const node = stack[i];
      if (node.classes.includes("chip")) {
        const label = source.slice(node.start, match.index).replace(/<[^>]+>/g, " ");
        const pending = /待重构|待上线|待复审|\bpending\b|\bplanned\b/i.test(label)
          || node.classes.includes("soon") || /aria-disabled\s*=\s*["']true["']/i.test(node.token);
        if (pending) {
          for (const target of new Set([...label.matchAll(/Ch(\d{2})\b/gi)].map((m) => `ch${m[1]}.html`))) {
            if (fs.existsSync(path.join(root, "chapters", target))) fail(`${rel} disables existing chapter ${target}`);
          }
        }
      }
      stack.length = i;
      continue;
    }
    const classes = (token.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "").split(/\s+/);
    const language = classes.includes("lang-zh") ? "zh" : classes.includes("lang-en") ? "en" : null;
    if (classes.includes("lang-zh") && classes.includes("lang-en")) fail(`${rel} has one node with both language classes`);
    if (language && stack.some((node) => node.language && node.language !== language)) {
      fail(`${rel} nests lang-${language} inside the other language`);
    }
    if (!voidTags.has(tag) && !token.endsWith("/>")) stack.push({ tag, classes, language, token, start: match.index });
  }
}

for (const [rel, [lo, hi]] of Object.entries(ranges)) {
  const html = read(rel);
  checkLanguageAndChips(html, rel);
  if (!html.includes('class="chapter"')) fail(`${rel} missing article.chapter`);
  if (!html.includes("lang-zh") || !html.includes("lang-en")) fail(`${rel} missing both languages`);
  if (!html.includes("read-toggle") || !html.includes('class="flip"')) fail(`${rel} missing flashcards or read toggle`);
  const decks = decksOf(html);
  if (decks.length < lo || decks.length > hi) {
    fail(`${rel} has ${decks.length} decks, want ${lo}–${hi}`);
  }
  decks.forEach((deck, i) => {
    const slides = deck.match(/<div class="slide">/g) || [];
    if (slides.length < 3 || slides.length > 6) {
      fail(`${rel} deck ${i + 1} has ${slides.length} slides, want 3–6`);
    }
    const boxes = [...deck.matchAll(/viewBox="0 0 ([\d.]+) ([\d.]+)"/g)];
    if (boxes.length < slides.length) fail(`${rel} deck ${i + 1} is missing an svg`);
    boxes.forEach((b, j) => {
      const w = Number(b[1]);
      const h = Number(b[2]);
      if (!(w > h)) fail(`${rel} deck ${i + 1} slide ${j + 1} viewBox ${w}×${h} is not landscape`);
    });
  });
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok favicon, index links ${linked.size}, ${chapterFiles.length} chapter file(s) with landscape SVG`);
