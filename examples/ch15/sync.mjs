import fs from 'node:fs';
const file = 'chapters/ch15.html';
let html = fs.readFileSync(file,'utf8');
const decode = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&amp;/g,'&');
const encode = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
let count = 0;
html = html.replace(/(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)(<\/code><\/pre>)/g,(all,start,src,body,end) => {
  const source = fs.readFileSync(`examples/ch15/${src}`,'utf8').replace(/\n$/,''); count++;
  if(process.argv.includes('--check')) {
    if(decode(body)!==source) throw new Error(`HTML/source mismatch: ${src}`);
    return all;
  }
  return start+encode(source)+end;
});
if(count!==5) throw new Error(`Expected 5 source blocks, found ${count}`);
if(!process.argv.includes('--check')) fs.writeFileSync(file,html);
console.log(`${count} HTML/source blocks ${process.argv.includes('--check')?'identical':'synchronized'}`);
