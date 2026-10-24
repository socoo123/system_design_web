import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const page=path.resolve(dir,'../../chapters/ch27.html');
let html=fs.readFileSync(page,'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let count=0;
html=html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,file,old,end)=>{
  const content=escape(fs.readFileSync(path.join(dir,file),'utf8').replace(/\n$/,''));
  if(process.argv.includes('--check') && old!==content)throw new Error(`Source mismatch: ${file}`);
  count++;return start+content+end;
});
if(count!==7)throw new Error(`Expected 7 sources, found ${count}`);
if(!process.argv.includes('--check'))fs.writeFileSync(page,html);
console.log(`${count} page snippets match chapter sources`);
