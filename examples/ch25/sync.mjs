import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const page = path.resolve(dir, '../../chapters/ch25.html');
const original = fs.readFileSync(page, 'utf8');
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let count = 0;
const html = original.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g, (_, start, file, old, end) => {
  const source = escape(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\n$/, ''));
  if (process.argv.includes('--check') && old !== source) throw new Error(`Source mismatch: ${file}`);
  count++; return start + source + end;
});
if (count !== 6) throw new Error(`Expected six shared sources, found ${count}`);
if (!process.argv.includes('--check')) {
  if (fs.readFileSync(page,'utf8') !== original) throw new Error('Concurrent chapter modification');
  fs.writeFileSync(page, html);
}
console.log(`${count} page snippets match chapter sources`);
