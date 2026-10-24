import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const file=path.resolve(dir,'../../chapters/ch32.html');
const before=fs.readFileSync(file,'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let count=0;
const after=before.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,ref,current,end)=>{
  const [name,region]=ref.split('#');
  let source=fs.readFileSync(path.join(dir,name),'utf8');
  if(region) {
    const begin=`# BEGIN ${region}\n`, finish=`# END ${region}`;
    if(!source.includes(begin)||!source.includes(finish)) throw new Error(`Missing region ${ref}`);
    source=source.split(begin)[1].split(finish)[0];
  }
  source=escape(source.trimEnd());
  if(process.argv.includes('--check') && source!==current) throw new Error(`Source mismatch ${ref}`);
  count++;
  return start+source+end;
});
if(count!==4) throw new Error(`Expected 4 blocks, found ${count}`);
if(!process.argv.includes('--check')) {
  if(fs.readFileSync(file,'utf8')!==before) throw new Error('Concurrent chapter edit');
  fs.writeFileSync(file,after);
}
console.log(`${count} Ch32 blocks match sources`);
