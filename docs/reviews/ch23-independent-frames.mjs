import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
const result={frames:[],sources:{}};
try{for(const phase of ['before','after']){
 const source=phase==='before'?'docs/reviews/ch22-ch23-ch24-baseline/ch23.html':'chapters/ch23.html';
 const html=fs.readFileSync(source,'utf8');result.sources[phase]=crypto.createHash('sha256').update(html).digest('hex');
 const decks=[...html.matchAll(/<figure class="deck">[\s\S]*?<\/figure>/g)].map(x=>x[0]);
 const out=`docs/reviews/screenshots/ch23-independent/${phase}`;fs.mkdirSync(out,{recursive:true});
 for(const theme of ['parchment','dracula'])for(let d=0;d<decks.length;d++){
  if(phase==='before'&&![0,3,5].includes(d))continue;
  for(const match of decks[d].matchAll(/<svg\b[\s\S]*?<\/svg>/g)){
   const svg=match[0];const id=svg.match(/<title id="([^"]+)"/)[1].replace(/t$/,'');
   await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
   await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/${id}-${theme}.png`});
   result.frames.push({phase,theme,deck:d+1,id});
  }
 }
}}finally{await browser.close();fs.writeFileSync('docs/reviews/ch23-independent-frames-results.json',JSON.stringify(result,null,2)+'\n')}
console.log('independent frame renders',result.frames.length);
