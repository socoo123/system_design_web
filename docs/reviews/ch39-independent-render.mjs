import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const source=process.argv[2] || 'chapters/ch39.html', out=process.argv[3] || 'docs/reviews/screenshots/ch39-independent/final-frames';
const html=fs.readFileSync(source,'utf8');
const svgs=[...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m=>m[0]);
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420},deviceScaleFactor:1});
const result=[];
for(const theme of ['parchment','dracula']) for(const svg of svgs){
 const id=svg.match(/aria-labelledby="(\S+)t /)[1];
 await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0}.board{display:block;width:960px;min-width:960px}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
 await page.evaluate(()=>document.fonts.ready);
 const file=path.join(out,`${id}-${theme}.png`);await page.screenshot({path:file});
 result.push({id,theme,file});
}
await browser.close();
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({source,frames:result},null,2)+'\n');
console.log(`${result.length} frames -> ${out}`);
