import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const page=path.resolve(dir,'../../chapters/ch33.html');
let html=fs.readFileSync(page,'utf8'),count=0;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
html=html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,source,old,end)=>{
  const content=escape(fs.readFileSync(path.join(dir,source),'utf8').replace(/\n$/,''));
  if(process.argv.includes('--check') && old!==content)throw new Error(`Source mismatch: ${source}`);
  count++;return start+content+end;
});
if(count!==3)throw new Error(`Expected 3 meaningful contracts; found ${count}`);
if(!process.argv.includes('--check'))fs.writeFileSync(page,html);
console.log(`${count} snippets match examples/ch33 sources`);
