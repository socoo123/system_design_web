// Generate/check committed static SVGs with a pinned native CLI; no browser runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,validateSvg} from '../validation.mjs';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url),'utf8'));
const bin=process.env.D2_BIN || path.join(os.homedir(),'.cache','system-design-tools','d2',config.version,`d2-v${config.version}`,'bin','d2');
if(!fs.existsSync(bin))throw Error('D2 binary missing: node tools/diagrams/install.mjs, or set D2_BIN to the absolute path of D2 v'+config.version);
if(execFileSync(bin,['--version'],{encoding:'utf8'}).trim()!==`v${config.version}`)throw Error(`D2 version must be v${config.version}`);
const check=process.argv.includes('--check'), requested=process.argv.slice(2).filter(x=>x!=='--check');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]).filter(f=>f.endsWith('.d2'));}
const sources=requested.length?requested.map(f=>path.resolve(f)):walk(path.join(root,'diagrams'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sd-d2-'));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('D2_')&&!['SCALE','OMIT_VERSION'].includes(k)));
let outputs=0;
try{
 for(const input of sources){
  const rel=path.relative(path.join(root,'diagrams'),input);
  if(rel.startsWith('..')||path.isAbsolute(rel)||!rel.endsWith('.d2'))throw Error('source must be diagrams/**/*.d2');
  const source=fs.readFileSync(input,'utf8');
  if(/(?:^|\s)@|\.\.\.@|https?:\/\/|\b(?:icon|link|image)\s*:|\bd2-config\s*:|\b(?:layers|scenarios|steps)\s*:/i.test(source))throw Error(`${rel}: static sources must not override build config, load external assets, or define animation boards`);
  const metadata=JSON.parse(fs.readFileSync(input.replace(/\.d2$/,'.json'),'utf8'));
  if(!metadata.title?.trim()||!metadata.description?.trim())throw Error(`${rel}: metadata requires title and description`);
  const stem=rel.replace(/\.d2$/,'');
  for(const [theme,themeId]of Object.entries(config.themes)){
   const name=`${stem}.${theme}.svg`, output=path.join(root,'assets','diagrams',name),generated=path.join(temp,theme+'.svg');
   execFileSync(bin,[`--layout=${config.layout}`,`--theme=${themeId}`,'--dark-theme=-1',`--pad=${config.pad}`,`--scale=${config.scale}`,'--bundle=true','--sketch=false','--center=false','--target=','--animate-interval=0',`--salt=${stem.replaceAll('/','-')}-${theme}`,'--timeout=120',input,generated],{env,stdio:'pipe'});
   let svg=fs.readFileSync(generated,'utf8');
   svg=svg.replace(/<svg\b/, '<svg role="img" aria-labelledby="diagram-title diagram-desc"').replace(/(<svg\b[^>]*>)/,`$1<title id="diagram-title">${escape(metadata.title)}</title><desc id="diagram-desc">${escape(metadata.description)}</desc>`);
   const errors=validateSvg(svg,name);if(errors.length)throw Error(errors.join('\n'));
   if(check){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==svg)throw Error(`${name}: stale or missing generated output; run build.mjs`);}
   else{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,svg);}
   console.log(`${check?'VERIFIED':'GENERATED'} assets/diagrams/${name}`);outputs++;
  }
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log(`${outputs} static SVGs; D2 v${config.version}; ${config.layout}; fonts embedded by D2. Inspect rendered layouts separately.`);
