import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)), file=path.resolve(dir,'../../chapters/ch38.html');
let html=fs.readFileSync(file,'utf8'), count=0;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
html=html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,source,old,end)=>{
  const [name,region]=source.split(':');let value=fs.readFileSync(path.join(dir,name),'utf8');
  if(region){const match=value.match(new RegExp(`    // BEGIN ${region}\\n([\\s\\S]*?)    // END ${region}`));if(!match)throw new Error(`Missing region ${source}`);value=match[1].replace(/^    /gm,'');}
  const content=escape(value.replace(/\n$/,''));
  if(process.argv.includes('--check') && content!==old)throw new Error(`Source mismatch ${source}`);
  count++;return start+content+end;
});
if(count!==4)throw new Error(`Expected four snippets, got ${count}`);
if(!process.argv.includes('--check'))fs.writeFileSync(file,html);
console.log(`${count} snippets match examples/ch38`);
