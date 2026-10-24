import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const html=fs.readFileSync('chapters/ch25.html','utf8');
const svgs=[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420}});
const results={sha256:crypto.createHash('sha256').update(html).digest('hex'),frames:[],purpose:'Geometry assists visual review; line-box candidates do not establish glyph collisions.'};
try {
 for (const svg of svgs) {
  await page.setContent(`<html data-theme="parchment"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"></head><body>${svg}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  results.frames.push(await page.evaluate(()=>{
   const svg=document.querySelector('svg');
   const boxes=[...svg.querySelectorAll('rect.boundary')].map(e=>({x:+e.getAttribute('x'),y:+e.getAttribute('y'),width:+e.getAttribute('width'),height:+e.getAttribute('height')}));
   const texts=[...svg.querySelectorAll('text')].map(e=>{const b=e.getBBox();return{text:e.textContent,x:b.x,y:b.y,width:b.width,height:b.height};});
   const cut=texts.filter(t=>t.x<0 || t.y<0 || t.x+t.width>960 || t.y+t.height>420);
   const boundaryCross=texts.flatMap(t=>boxes.filter(b=>
    (t.y<b.y+b.height && t.y+t.height>b.y && ((t.x<b.x && t.x+t.width>b.x)||(t.x<b.x+b.width && t.x+t.width>b.x+b.width))) ||
    (t.x<b.x+b.width && t.x+t.width>b.x && ((t.y<b.y && t.y+t.height>b.y)||(t.y<b.y+b.height && t.y+t.height>b.y+b.height)))
   ).map(b=>({text:t.text,boundary:b})));
   return{id:svg.querySelector('title').id,boxes,texts,cut,boundaryCross};
  }));
 }
 results.cut=results.frames.flatMap(f=>f.cut.map(t=>({id:f.id,...t})));
 results.boundaryCross=results.frames.flatMap(f=>f.boundaryCross.map(t=>({id:f.id,...t})));
 results.targetGaps=results.frames.flatMap(f=>f.texts.filter(t=>['POST packet','202 pending','claim p9','retry user'].includes(t.text)).map(t=>({id:f.id,text:t.text,leftOfTextMinusBoundary:t.x-f.boxes[0].x})));
 results.passed=results.cut.length===0 && results.boundaryCross.length===0;
 results.d5CommitGaps=results.frames.filter(f=>f.id.startsWith('d5')).map(f=>{const t=f.texts.find(t=>t.text==='commit');return {id:f.id,text:t,leftGap:t.x-280,rightGap:350-t.x-t.width};});
} finally {await browser.close();fs.writeFileSync('docs/reviews/ch25-independent-geometry-results.json',JSON.stringify(results,null,2)+'\n');}
console.log(JSON.stringify({passed:results.passed,cut:results.cut,boundaryCross:results.boundaryCross,targetGaps:results.targetGaps}));
