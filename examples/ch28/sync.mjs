import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(dir, '../../chapters/ch28.html');
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let count = 0;
const html = fs.readFileSync(target, 'utf8').replace(/(<pre\b([^>]*data-source="([^"]+)"[^>]*)><code>)([\s\S]*?)(<\/code><\/pre>)/g,
  (_, start, attrs, file, old, end) => {
    let source = fs.readFileSync(path.join(dir, file), 'utf8').trimEnd();
    const snippet = attrs.match(/data-snippet="([^"]+)"/)?.[1];
    if (snippet) source = source.split(`    // BEGIN page:${snippet}\n`)[1].split(`    // END page:${snippet}`)[0]
      .trimEnd().split('\n').map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n');
    const escaped = escape(source);
    if (process.argv.includes('--check') && old !== escaped) throw new Error(`Source mismatch: ${file}/${snippet || 'full'}`);
    count++;
    return start + escaped + end;
  });
if (count !== 7) throw new Error(`Expected 7 snippets, found ${count}`);
if (!process.argv.includes('--check')) fs.writeFileSync(target, html);
console.log(`${count} page blocks match their chapter sources`);
