import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(base, '../../chapters/ch11.html');
const sources = ['schema.sql', 'publish.pseudo', 'fanout.pseudo', 'cache.pseudo', 'FeedPage.java'];
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
let html = fs.readFileSync(target, 'utf8');
for (const source of sources) {
  let text = fs.readFileSync(path.join(base, source), 'utf8');
  if (source.endsWith('.java')) text = text.split('  // BEGIN PAGE SNIPPET\n')[1].split('  // END PAGE SNIPPET')[0];
  const regex = new RegExp(`(<pre[^>]*data-source="${source.replaceAll('.', '\\.')}"[^>]*><code>)([\\s\\S]*?)(</code></pre>)`);
  const match = html.match(regex);
  if (!match) throw new Error(`Missing source block ${source}`);
  if (process.argv.includes('--check')) {
    if (match[2] !== escape(text)) throw new Error(`Source drift ${source}`);
  } else html = html.replace(regex, (_, start, body, end) => start + escape(text) + end);
}
if (!process.argv.includes('--check')) fs.writeFileSync(target, html);
console.log(`PASS: ${sources.length} shared code sources`);
