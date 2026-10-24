import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const phase=process.argv[2]||'before';
if(!['before','after'].includes(phase))throw Error('phase must be before/after');
const dir=`docs/reviews/screenshots/ch19-ch20-ch21-root/${phase}`;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const ch of ['ch19','ch20','ch21'])for(const theme of ['parchment','dracula']){
const imgs=Array.from({length:6},(_,i)=>{const f=path.join(dir,`${ch}-${theme}-d${i+1}-last.png`);return `<figure><figcaption>${ch} ${theme} D${i+1} final</figcaption><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"></figure>`;}).join('');
const page=await browser.newPage({viewport:{width:1840,height:1000}});
await page.setContent(`<style>body{margin:0;background:#ddd;display:grid;grid-template-columns:1fr 1fr;gap:8px;font:18px sans-serif}figure{margin:0;min-width:0;background:white}img{display:block;width:100%}figcaption{padding:6px}</style>${imgs}`);
await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
await page.screenshot({path:path.join(dir,`${ch}-${theme}-contact.png`),fullPage:true});await page.close();
}}finally{await browser.close();}
console.log(`Saved 6 ${phase} contact sheets`);
