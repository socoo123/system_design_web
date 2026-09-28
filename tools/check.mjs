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
for (const [rel, [lo, hi]] of Object.entries(ranges)) {
  const html = read(rel);
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
