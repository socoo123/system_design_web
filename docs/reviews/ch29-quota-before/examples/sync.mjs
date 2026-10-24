import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(dir, '../../chapters/ch29.html');
const before = fs.readFileSync(file, 'utf8');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
let count = 0;
const after = before.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g, (_, start, ref, current, end) => {
  const [name, region] = ref.split('#');
  let source = fs.readFileSync(path.join(dir, name), 'utf8');
  if (region) {
    const match = source.match(new RegExp(`    // BEGIN ${region}\\n([\\s\\S]*?)    // END ${region}`));
    if (!match) throw new Error(`Missing region ${ref}`);
    source = match[1].split('\n').map(s => s.startsWith('    ') ? s.slice(4) : s).join('\n');
  }
  source = escape(source.replace(/\n$/, ''));
  if (process.argv.includes('--check') && source !== current) throw new Error(`Source mismatch ${ref}`);
  count++;
  return start + source + end;
});
if (count !== 6) throw new Error(`Expected 6 snippets, found ${count}`);
if (!process.argv.includes('--check')) {
  if (fs.readFileSync(file, 'utf8') !== before) throw new Error('Concurrent chapter modification');
  fs.writeFileSync(file, after);
}
console.log(`${count} snippets match chapter sources`);
