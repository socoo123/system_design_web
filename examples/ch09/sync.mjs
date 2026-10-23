// Sync shared, language-neutral snippets into this chapter. Use --check in review.
import fs from 'node:fs';
const file='chapters/ch09.html';let h=fs.readFileSync(file,'utf8');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const name of ['schema.sql','create.pseudo','redirect.pseudo','revoke.sql']){
 const re=new RegExp(`(<pre[^>]*data-source="${name}"[^>]*><code>)[\\s\\S]*?(</code></pre>)`);
 if(!re.test(h))throw Error(`Missing ${name}`);
 h=h.replace(re,(_,a,b)=>a+escape(fs.readFileSync('examples/ch09/'+name,'utf8').trimEnd())+b);
}
if(process.argv.includes('--check')){if(h!==fs.readFileSync(file,'utf8'))throw Error('Snippet drift');console.log('Four shared snippets match source.');}
else fs.writeFileSync(file,h);
