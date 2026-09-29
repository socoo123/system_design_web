// Counts the OPUS_REFACTOR.md §7 acceptance numbers for one or more chapters.
//   node tools/audit-chapter.mjs ch02 ch03
// Exit code 1 if any hard rule fails. This does not replace looking at every rendered slide.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("usage: node tools/audit-chapter.mjs chNN [chNN...]");
  process.exit(1);
}

const count = (s, re) => (s.match(re) || []).length;
const hanFloor = (n) => (n <= 3 ? 5500 : 6500);
const deckRange = (n) => (n <= 8 ? [4, 6] : n <= 35 ? [5, 7] : [6, 8]);
let failed = false;

for (const id of ids) {
  const html = fs.readFileSync(path.join(root, "chapters", `${id}.html`), "utf8");
  const num = Number(id.slice(2));
  const decks = [...html.matchAll(/<figure class="deck">([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
  const perDeck = decks.map((d) => count(d, /<div class="slide">/g));
  const svgs = [...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  const noSvg = html.replace(/<svg\b[\s\S]*?<\/svg>/g, "");
  const han = count(noSvg, /\p{Script=Han}/gu);
  const zh = count(html, /class="[^"]*\blang-zh\b/g);
  const en = count(html, /class="[^"]*\blang-en\b/g);
  const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dupIds = [...new Set(idList.filter((x, i) => idList.indexOf(x) !== i))];
  const refs = new Set([...noSvg.matchAll(/\[(\d+)\]/g)].map((m) => m[1])).size;
  const [lo, hi] = deckRange(num);

  const rows = [
    ["decks", decks.length, decks.length >= lo && decks.length <= hi, `${lo}–${hi}`],
    ["slides per deck", perDeck.join("/"), perDeck.every((n) => n >= 3 && n <= 6), "3–6 each"],
    ["svg with <title>+<desc>", `${svgs.filter((s) => /<title\b/.test(s) && /<desc\b/.test(s)).length}/${svgs.length}`, svgs.every((s) => /<title\b/.test(s) && /<desc\b/.test(s)), "all"],
    ["svg with legend", `${svgs.filter((s) => />request</.test(s) && />reply</.test(s)).length}/${svgs.length}`, svgs.every((s) => />request</.test(s) && />reply</.test(s)), "all"],
    ["svg with <g class=\"is-new\">", `${svgs.filter((s) => /class="is-new"/.test(s)).length}/${svgs.length}`, svgs.every((s) => /class="is-new"/.test(s)), "all"],
    ["legacy ellipse+rect+ellipse stores", count(html, /<ellipse[^>]*class="store[^"]*"[^>]*\/>\s*<rect[^>]*class="store/g), count(html, /<ellipse[^>]*class="store[^"]*"[^>]*\/>\s*<rect[^>]*class="store/g) === 0, "0"],
    ["lang-zh / lang-en", `${zh} / ${en}`, zh === en && zh > 0, "equal"],
    ["Han characters (outside SVG)", han, han >= hanFloor(num), `≥ ${hanFloor(num)}`],
    ["duplicate ids", dupIds.length ? dupIds.slice(0, 5).join(",") : 0, dupIds.length === 0, "0"],
    ["distinct [n] citations", refs, refs >= (num <= 3 ? 3 : 6), `≥ ${num <= 3 ? 3 : 6}`],
  ];

  console.log(`\n${id}`);
  for (const [name, value, ok, want] of rows) {
    if (!ok) failed = true;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(36)} ${String(value).padEnd(14)} want ${want}`);
  }
}
process.exit(failed ? 1 : 0);
