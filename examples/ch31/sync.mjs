import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const page = path.resolve(dir, '../../chapters/ch31.html');
let html = fs.readFileSync(page, 'utf8');
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let count = 0;
html = html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,
  (_, start, source, previous, end) => {
    const [file, region] = source.split('#');
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    const marker = file.endsWith('.java') ? '// ' : '# ';
    if (region) content = content.split(`${marker}BEGIN ${region}\n`)[1]?.split(`${marker}END ${region}`)[0];
    if (!content) throw new Error(`Missing source ${source}`);
    content = content.trimEnd();
    const indent = Math.min(...content.split('\n').filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
    content = escape(content.split('\n').map(l => l.slice(indent)).join('\n'));
    if (process.argv.includes('--check') && previous !== content) throw new Error(`Source mismatch ${source}`);
    count++; return start + content + end;
  });
if (count !== 3) throw new Error(`Expected 3 snippets, got ${count}`);
if (!process.argv.includes('--check')) fs.writeFileSync(page, html);
console.log(`${count} snippets match examples/ch31 sources`);
