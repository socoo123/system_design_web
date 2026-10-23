// Pinned, user-cache-only installation. No sudo, shell installer or PATH mutation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
const config=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url),'utf8'));
if(process.platform!=='darwin'||process.arch!=='arm64'){
  console.error(`This checksum-pinned installer supports macOS arm64. Install D2 v${config.version} from the official release for your platform, then set D2_BIN. See tools/diagrams/README.md.`);process.exit(1);
}
const dir=path.join(os.homedir(),'.cache','system-design-tools','d2',config.version),bin=path.join(dir,`d2-v${config.version}`,'bin','d2');
if(fs.existsSync(bin)&&execFileSync(bin,['--version'],{encoding:'utf8'}).trim()===`v${config.version}`){console.log(bin);process.exit(0);}
const url=`https://github.com/d2lang/d2/releases/download/v${config.version}/d2-v${config.version}-macos-arm64.tar.gz`;
console.log(`Downloading ${url}`);
fs.mkdirSync(dir,{recursive:true});const archive=path.join(dir,'archive.tar.gz');
// curl uses the host trust store (Node's bundled CA set may omit managed roots).
execFileSync('curl',['--fail','--location','--silent','--show-error',url,'--output',archive],{stdio:'inherit'});
const data=fs.readFileSync(archive);
if(crypto.createHash('sha256').update(data).digest('hex')!==config.macosArm64ArchiveSha256)throw Error('archive SHA256 mismatch');
execFileSync('tar',['-xzf',archive,'-C',dir]);
if(execFileSync(bin,['--version'],{encoding:'utf8'}).trim()!==`v${config.version}`)throw Error('installed version mismatch');
fs.unlinkSync(archive);console.log(bin);
