// Verify this wave against the full working-tree baseline, not against HEAD.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/reviews/ch22-ch23-ch24-baseline.json')));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const permitted = name => name === 'PLAN.md' || /^docs\/reviews\/(?:ch(?:22|23|24)(?:[.\/-])|screenshots\/ch(?:22|23|24)(?:[\/-]))/.test(name) || /^(chapters\/ch(?:22|23|24)\.html|(?:examples|diagrams)\/ch(?:22|23|24)\/|assets\/diagrams\/ch(?:22|23|24)\/)/.test(name);
const changed = [], unexpected = [], missing = [], additions = [], inventory = {};
for (const [name, expected] of Object.entries(baseline.files)) {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) { missing.push(name); continue; }
  if (sha(fs.readFileSync(full)) !== expected) { changed.push(name); if (!permitted(name)) unexpected.push(name); }
}
function walk(dir) {
  if (!fs.existsSync(path.join(root, dir))) return;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['.git', 'node_modules', '.DS_Store', '.venv'].includes(entry.name)) continue;
    const name = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(name);
    else if (entry.isFile() && !(name in baseline.files)) { additions.push(name); if (!permitted(name)) unexpected.push(name); }
  }
}
walk('');
for (const chapter of baseline.scope) {
  const html = fs.readFileSync(path.join(root, `chapters/${chapter}.html`), 'utf8');
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m => m[0]);
  const ids = [...html.matchAll(/<title id="([^"]+)"/g)].map(m => m[1]);
  const original = fs.readFileSync(path.join(root, `docs/reviews/ch22-ch23-ch24-baseline/${chapter}.html`), 'utf8');
  const descriptionIds = content => [...content.matchAll(/<desc id="([^"]+)"/g)].map(m => m[1]);
  const geometry = svgs.map(s => sha(s.replace(/(<(?:title|desc|text)\b[^>]*>)[\s\S]*?(<\/(?:title|desc|text)>)/g, '$1$2')));
  inventory[chapter] = { sha256: sha(html), frames: svgs.length,
    idsPreserved: JSON.stringify(ids) === JSON.stringify(baseline.chapters[chapter].slideIds),
    descIdsPreserved: JSON.stringify(descriptionIds(html)) === JSON.stringify(descriptionIds(original)),
    framesPreserved: svgs.length === baseline.chapters[chapter].svgs.length,
    svgChanged: svgs.flatMap((s, i) => sha(s) === baseline.chapters[chapter].svgs[i] ? [] : [i + 1]),
    geometryChanged: geometry.flatMap((s, i) => s === baseline.chapters[chapter].svgGeometry[i] ? [] : [i + 1]) };
}
const passed = !missing.length && !unexpected.length && Object.values(inventory).every(i => i.idsPreserved && i.descIdsPreserved && i.framesPreserved);
const result = { passed, changed, additions, unexpected, missing, inventory };
fs.writeFileSync(path.join(root, 'docs/reviews/ch22-ch23-ch24-scope-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ passed, changed, additions: additions.length, unexpected, missing, inventory }));
if (!passed) process.exitCode = 1;
