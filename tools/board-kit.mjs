// SVG primitives for chapter decks, extracted from the Ch02 / Ch03 generators.
// Classes map to `.board` rules in assets/css/style.css. Usage: see OPUS_REFACTOR.md §4.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const f = (n) => Math.round(n * 10) / 10;
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// cls: label 16px bold · sub 13px · tiny 12px · clock mono accent
export function text(x, y, s, cls = "tiny", anchor) {
  return `<text x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ""} class="${cls}">${esc(s)}</text>`;
}

// Orthogonal polyline with rounded corners. The line stops at the arrowhead base,
// so the tip lands exactly on the last point: put that point on the target's border.
// kind: '' request · 'reply' · 'async' · 'fail' · 'hit', optionally plus 'muted'.
export function arrow(pts, kind = "", { head = true } = {}) {
  const kinds = kind.split(" ").filter(Boolean);
  const cls = ["wire", ...kinds].join(" ");
  const hcls = ["head", ...kinds].join(" ");
  const p = pts.map(([x, y]) => ({ x, y }));
  const end = p.at(-1);
  const prev = p.at(-2);
  const len = Math.hypot(end.x - prev.x, end.y - prev.y);
  const ux = (end.x - prev.x) / len;
  const uy = (end.y - prev.y) / len;
  const HL = 10;
  const HW = 5;
  const base = head ? { x: end.x - ux * HL, y: end.y - uy * HL } : end;
  const q = [...p.slice(0, -1), base];
  let d = `M${f(q[0].x)} ${f(q[0].y)}`;
  for (let i = 1; i < q.length - 1; i++) {
    const a = q[i - 1];
    const b = q[i];
    const c = q[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(8, l1 / 2, l2 / 2);
    const p1 = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r };
    d += ` L${f(p1.x)} ${f(p1.y)} Q${f(b.x)} ${f(b.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  d += ` L${f(q.at(-1).x)} ${f(q.at(-1).y)}`;
  let s = `<path d="${d}" class="${cls}"/>`;
  if (head) {
    const nx = -uy;
    const ny = ux;
    s += `<polygon points="${f(end.x)},${f(end.y)} ${f(base.x + nx * HW)},${f(base.y + ny * HW)} ${f(base.x - nx * HW)},${f(base.y - ny * HW)}" class="${hcls}"/>`;
  }
  return s;
}

// Stateless service. cls: 'box' · 'box ok' · 'box bad' · 'box alt'
export function box(x, y, w, h, label, sub, cls = "box", rx = 12) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`;
  if (sub) s += text(cx, cy - 3, label, "label", "middle") + text(cx, cy + 16, sub, "sub", "middle");
  else s += text(cx, cy + 6, label, "label", "middle");
  return s;
}

// Edge / LB / gateway. Arrows must end on the flat top/bottom edge or at cy on the round end.
export const pill = (x, y, w, h, label, sub) => box(x, y, w, h, label, sub, "box alt", h / 2);

// Durable store: one body path + one lid ellipse. Never ellipse + rect + ellipse.
// With a sub label keep y2 - y1 >= 46, or the sub text sits on the bottom arc.
export function cyl(cx, y1, y2, rx, label, sub, bad = false) {
  const ry = 12;
  const c = bad ? "store bad" : "store";
  let s = `<path d="M${cx - rx} ${y1} V${y2} A${rx} ${ry} 0 0 0 ${cx + rx} ${y2} V${y1}" class="${c}"/>`;
  s += `<ellipse cx="${cx}" cy="${y1}" rx="${rx}" ry="${ry}" class="${c}"/>`;
  const mid = (y1 + y2) / 2 + ry;
  if (sub) s += text(cx, mid - 2, label, "label", "middle") + text(cx, mid + 16, sub, "sub", "middle");
  else s += text(cx, mid + 6, label, "label", "middle");
  return s;
}

// Cache: two stacked rects offset by 7 px. Arrows attach to the front rect (x, y, w, h).
export function cache(x, y, w, h, label, sub, bad = false) {
  const c = bad ? "cache bad" : "cache";
  return `<rect x="${x + 7}" y="${y + 7}" width="${w}" height="${h}" rx="8" class="${c}"/>` + box(x, y, w, h, label, sub, c, 8);
}

// MQ / event stream: capsule with three slots on the tail end.
export function queue(x, y, w, h, label, bad = false) {
  const c = bad ? "queue bad" : "queue";
  const r = h / 2;
  let s = `<path d="M${x + r} ${y} h${w - 2 * r} a${r} ${r} 0 0 1 0 ${h} h${-(w - 2 * r)} a${r} ${r} 0 0 1 0 ${-h}" class="${c}"/>`;
  for (const dx of [28, 36, 44]) s += `<path d="M${x + w - dx} ${y + 9} v${h - 18}" class="${c}"/>`;
  s += text(x + (w - 44) / 2 + 6, y + h / 2 + 6, label, "label", "middle");
  return s;
}

export function badge(x, y, w, label) {
  return `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" class="badge"/><text x="${x + w / 2}" y="${y + 14}" text-anchor="middle" class="badge-text">${esc(label)}</text>`;
}

// Person icon centred on (cx, cy). Ports: request leaves at cy - 9, reply arrives at cy + 9, x = cx + 26.
export function client(cx, cy, label = "Client") {
  return `<circle cx="${cx}" cy="${cy - 24}" r="12" class="box"/><path d="M${cx - 20} ${cy + 22} Q${cx} ${cy - 10} ${cx + 20} ${cy + 22}" class="wire"/>` + text(cx, cy + 44, label, "label", "middle");
}

// System / region / trust boundary. Keep the bottom at or above y = 384 so it clears the legend.
export const frame = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" class="boundary"/>`;

// Fixed legend row at y = 400 on every slide.
export function legend(y = 400, x0 = 128) {
  let x = x0;
  let s = "";
  for (const [kind, name] of [["", "request"], ["reply", "reply"], ["async", "async"], ["fail", "failure / fallback"]]) {
    s += arrow([[x, y], [x + 26, y]], kind) + text(x + 32, y + 4, name);
    x += 32 + name.length * 6.4 + 24;
  }
  return s;
}

// slide = { id, title, desc, old: [svg...], fresh: [svg...], zh: html, en: html }
// `old` is everything already on the board; `fresh` is this frame's new stroke.
const IND = "          ";
export function slideHTML(sl) {
  return [
    `      <div class="slide">`,
    `        <svg viewBox="0 0 960 420" class="board" role="img" aria-labelledby="${sl.id}t ${sl.id}d">`,
    `${IND}<title id="${sl.id}t">${esc(sl.title)}</title>`,
    `${IND}<desc id="${sl.id}d">${esc(sl.desc)}</desc>`,
    `${IND}${legend()}`,
    ...sl.old.map((s) => IND + s),
    `${IND}<g class="is-new">`,
    ...sl.fresh.map((s) => `${IND}  ${s}`),
    `${IND}</g>`,
    `        </svg>`,
    `        <figcaption><span class="lang-zh">${sl.zh}</span><span class="lang-en">${sl.en}</span></figcaption>`,
    `      </div>`,
  ].join("\n");
}

export const figureHTML = (slides) => `<figure class="deck">\n${slides.map(slideHTML).join("\n")}\n    </figure>`;

// Replace every <figure class="deck"> in the chapter, in order. Throws if the counts differ.
export function splice(file, decks) {
  let html = fs.readFileSync(file, "utf8");
  let i = 0;
  html = html.replace(/<figure class="deck">[\s\S]*?<\/figure>/g, () => figureHTML(decks[i++] || []));
  if (i !== decks.length) throw new Error(`${file} has ${i} decks, generator has ${decks.length}`);
  fs.writeFileSync(file, html);
  return { decks: decks.length, slides: decks.flat().length };
}

// Write one standalone HTML per slide (is-new animation off) for tools/render-slides.mjs --dir.
export function preview(decks, dir, theme = "parchment") {
  const css = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/css/style.css");
  fs.mkdirSync(dir, { recursive: true });
  for (const sl of decks.flat()) {
    const svg = slideHTML(sl).replace(/class="is-new"/g, "");
    fs.writeFileSync(path.join(dir, `${sl.id}.html`), `<!DOCTYPE html><html data-theme="${theme}"><head><meta charset="utf-8"><link rel="stylesheet" href="file://${css}"><style>body{margin:0;background:#fff}.board{width:960px;min-width:960px}figcaption{display:none}</style></head><body>${svg}</body></html>`);
  }
  return decks.flat().length;
}
