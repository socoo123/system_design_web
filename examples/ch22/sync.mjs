import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../../chapters/ch22.html');
const source = fs.readFileSync(target, 'utf8');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let blocks = 0;
const updated = source.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)[\s\S]*?(<\/code><\/pre>)/g, (all, before, name, after) => {
  let code = fs.readFileSync(path.join(here, name), 'utf8');
  const region = before.match(/data-region="([^"]+)"/)?.[1];
  if (region) code = code.split(`// BEGIN PAGE ${region}\n`)[1].split(`// END PAGE ${region}`)[0].split('\n').map(s => s.startsWith('    ')?s.slice(4):s).join('\n').trim();
  blocks++;
  return before + escape(code.trimEnd()) + after;
});
if (blocks !== 4) throw new Error(`Expected four source snippets, got ${blocks}`);
if (process.argv.includes('--check')) {
  if (updated !== source) throw new Error('Page snippets differ from their source');
  console.log(`${blocks} source snippets match`);
} else {
  fs.writeFileSync(target,updated);
  console.log(`Updated ${blocks} snippets`);
}
