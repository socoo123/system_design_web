import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const file=path.resolve(dir,'../../chapters/ch39.html');
const before=fs.readFileSync(file,'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
let count=0;
const after=before.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(_,start,ref,current,end)=>{
 const [name,region]=ref.split('#');
 let source=fs.readFileSync(path.join(dir,name),'utf8');
 if(region) source=source.split(`// BEGIN ${region}\n`)[1]?.split(`// END ${region}`)[0];
 if(source===undefined) throw new Error(`Missing region ${ref}`);
 const lines=source.trimEnd().split('\n');
 const indent=Math.min(...lines.filter(s=>s.trim()).map(s=>s.match(/^ */)[0].length));
 source=escape(lines.map(s=>s.slice(indent)).join('\n'));
 if(process.argv.includes('--check')&&source!==current)throw new Error(`Source mismatch ${ref}`);
 count++;return start+source+end;
});
if(count!==3)throw new Error(`Expected 3 blocks, found ${count}`);
if(!process.argv.includes('--check')) {
 if(fs.readFileSync(file,'utf8')!==before)throw new Error('Concurrent chapter edit');
 fs.writeFileSync(file,after);
}
console.log(`${count} Ch39 blocks match executable Java17 source`);
