// Screenshot deck slides with headless Chrome so they can be reviewed one by one.
//
//   node tools/render-slides.mjs ch03                      every slide in chapters/ch03.html
//   node tools/render-slides.mjs ch03 d4s5,d5s5 --theme=dracula
//   node tools/render-slides.mjs --dir=/tmp/sd-gen/ch03 [ids]   *.html written by board-kit preview()
//   node tools/render-slides.mjs ch03 --page --locale=both --theme=parchment --section=4 --slide=5 --width=1280
//
// Output goes to /tmp/sd-render/<chapter>/ unless --out is given. Set CHROME to override the binary.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => {
  const [k, v = "1"] = a.slice(2).split("=");
  return [k, v];
}));
const pos = args.filter((a) => !a.startsWith("--"));
const chapter = opt.dir ? undefined : pos[0];
const only = opt.dir ? pos[0] : pos[1];
const theme = opt.theme || "parchment";
const out = opt.out || `/tmp/sd-render/${chapter || path.basename(opt.dir || "preview")}`;
fs.mkdirSync(out, { recursive: true });

function shot(file, png, w = 960, h = 420, extra = []) {
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1.4",
    ...extra, `--screenshot=${png}`, `--window-size=${w},${h}`, `file://${file}`], { stdio: "ignore" });
  console.log(png);
}

if (opt.dir) {
  const ids = fs.readdirSync(opt.dir).filter((n) => n.endsWith(".html")).map((n) => n.slice(0, -5));
  for (const id of ids) {
    if (only && !only.split(",").includes(id)) continue;
    shot(path.join(opt.dir, `${id}.html`), path.join(out, `${id}.png`));
  }
} else if (!chapter) {
  console.error("usage: node tools/render-slides.mjs chNN [ids] [--theme=dracula] | --dir=DIR | chNN --page");
  process.exit(1);
} else if (opt.page) {
  // The page is copied with absolute asset paths; everything but one section is hidden, because
  // smooth scrolling leaves headless screenshots blank. --slide pins one frame of every deck.
  const locale = opt.locale || "zh";
  let html = fs.readFileSync(path.join(root, "chapters", `${chapter}.html`), "utf8").replaceAll("../assets/", `file://${root}/assets/`);
  html = html.replace("<script src=\"file://", `<script>localStorage.setItem("sd-locale","${locale}");localStorage.setItem("sd-theme","${theme}");</script><script src="file://`);
  let css = ".topbar,.chapter>header{display:none}";
  if (opt.section) css += `.chapter>section:not(:nth-of-type(${opt.section})){display:none}`;
  if (opt.slide) css += `.deck .slide{visibility:hidden!important;opacity:0!important}.deck .slide:nth-of-type(${opt.slide}){visibility:visible!important;opacity:1!important;transform:none!important}.deck .slide .is-new{animation:none!important}`;
  html = html.replace("</head>", `<style>${css}</style></head>`);
  const name = `page-${locale}-${theme}-s${opt.section || "all"}-w${opt.width || 1280}`;
  const file = path.join(out, `${name}.html`);
  fs.writeFileSync(file, html);
  shot(file, path.join(out, `${name}.png`), Number(opt.width || 1280), Number(opt.height || 2400), ["--virtual-time-budget=3000"]);
} else {
  const html = fs.readFileSync(path.join(root, "chapters", `${chapter}.html`), "utf8");
  const svgs = [...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  svgs.forEach((svg, i) => {
    const id = (svg.match(/aria-labelledby="(\S+?)t\s/) || [])[1] || `s${String(i + 1).padStart(2, "0")}`;
    if (only && !only.split(",").includes(id)) return;
    const file = path.join(out, `${id}.html`);
    fs.writeFileSync(file, `<!DOCTYPE html><html data-theme="${theme}" data-locale="zh"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/assets/css/style.css">
<style>body{margin:0;background:#fff}.board{width:960px;min-width:960px}</style></head>
<body>${svg.replace(/class="is-new"/g, 'class="is-new-off"')}</body></html>`);
    shot(file, path.join(out, `${id}${theme === "parchment" ? "" : `-${theme}`}.png`));
  });
}
