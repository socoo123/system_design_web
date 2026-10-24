import fs from 'node:fs';
const file = 'chapters/ch45.html';
const before = fs.readFileSync(file, 'utf8');
let html = before;
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const java = fs.readFileSync('examples/ch45/DomainModel.java', 'utf8');
const sources = {
  'DomainModel.java#edit': java.match(/\/\/ BEGIN edit\n([\s\S]*?)        \/\/ END edit/)[1].replace(/^        /gm, '').trimEnd(),
  'DomainModel.java#capture': java.match(/\/\/ BEGIN capture\n([\s\S]*?)        \/\/ END capture/)[1].replace(/^        /gm, '').trimEnd(),
  'edit.pseudo': fs.readFileSync('examples/ch45/edit.pseudo', 'utf8').trimEnd(),
  'consume.pseudo': fs.readFileSync('examples/ch45/consume.pseudo', 'utf8').trimEnd(),
};
for (const [name, source] of Object.entries(sources)) {
  const marker = `data-source="${name}"`;
  const start = html.indexOf(marker);
  if (start < 0 || html.indexOf(marker, start + 1) !== -1) throw Error(`Missing or repeated ${name}`);
  const codeStart = html.indexOf('<code>', start) + 6;
  const codeEnd = html.indexOf('</code></pre>', codeStart);
  if (codeStart < 6 || codeEnd < 0) throw Error(`Malformed ${name}`);
  html = html.slice(0, codeStart) + escape(source) + html.slice(codeEnd);
}
if (process.argv.includes('--check')) {
  if (html !== before) throw Error('Ch45 snippets differ from sources');
  console.log(JSON.stringify({ passed: true, snippets: Object.keys(sources) }));
} else fs.writeFileSync(file, html);
