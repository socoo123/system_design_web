import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const chapter = path.resolve(here, '../../chapters/ch40.html');
const original = fs.readFileSync(chapter, 'utf8');
let count = 0;
const html = original.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g, (_, start, source, old, end) => {
  const [file, region] = source.split(':');
  const full = fs.readFileSync(path.join(here, file), 'utf8');
  const match = full.match(new RegExp(`        // BEGIN ${region}\\n([\\s\\S]*?)        // END ${region}`))
    || full.match(new RegExp(`    // BEGIN ${region}\\n([\\s\\S]*?)    // END ${region}`));
  if (!match) throw new Error(`Missing region ${source}`);
  const indent = match[0].startsWith('        ') ? 8 : 4;
  const value = match[1].replace(new RegExp(`^ {${indent}}`, 'gm'), '');
  const escaped = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (process.argv.includes('--check') && old !== escaped) throw new Error(`Out of sync: ${source}`);
  count++;
  return start + escaped + end;
});
if (count !== 3) throw new Error(`Expected three source excerpts, got ${count}`);
if (!process.argv.includes('--check')) fs.writeFileSync(chapter, html);
console.log(`Ch40: ${count} exact Java 17 source excerpts ${process.argv.includes('--check') ? 'verified' : 'synchronized'}`);
