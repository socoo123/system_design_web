import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const file=path.resolve(dir,'../../chapters/ch34.html');
let html=fs.readFileSync(file,'utf8'), count=0;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
html=html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,source,old,end)=>{
  const content=escape(fs.readFileSync(path.join(dir,source),'utf8').replace(/\n$/,''));
  if(process.argv.includes('--check') && old!==content)throw new Error(`Source mismatch: ${source}`);
  count++;return start+content+end;
});
if(count!==4)throw new Error(`Expected four contracts; found ${count}`);
if(!process.argv.includes('--check'))fs.writeFileSync(file,html);
console.log(`${count} snippets match examples/ch34 sources`);
