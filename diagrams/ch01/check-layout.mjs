// Layout evidence for Ch01 only. Supply PLAYWRIGHT_MODULE to a local Playwright install.
import fs from 'node:fs';
import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const root=new URL('../../',import.meta.url);
const path=s=>new URL(s,root).pathname;
const out=path('docs/reviews/screenshots/ch01-layout');fs.mkdirSync(out,{recursive:true});
const current=fs.readFileSync(path('chapters/ch01.html'),'utf8');
const before=fs.readFileSync(process.env.CH01_BEFORE || '/tmp/ch01-svg-revision-before.html','utf8');
const outside=s=>s.replace(/<svg\b[\s\S]*?<\/svg>/g,'<SVG>');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(outside(before)!==outside(current))throw Error('NON-SVG CONTENT CHANGED');
const css=fs.readFileSync(path('assets/css/style.css'),'utf8');
const svgs=s=>[...s.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const id=svg=>svg.match(/aria-labelledby="(\S+?)t /)[1];
const oldIds=svgs(before).map(id),newIds=svgs(current).map(id);
if(JSON.stringify(oldIds)!==JSON.stringify(newIds)||newIds.length!==20)throw Error('FRAME ORDER CHANGED');
const b=await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await b.newPage({viewport:{width:960,height:420},deviceScaleFactor:1,reducedMotion:'reduce'});
const frames=[];
for(const theme of ['parchment','dracula'])for(const svg of svgs(current)){
 const frame=id(svg);
 await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${css}\nbody{margin:0}.board{width:960px;min-width:960px;border-radius:0}.board .is-new{animation:none!important;transform:none!important}</style></head><body>${svg}</body></html>`);
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const geometry=await page.evaluate(()=>{
  const svg=document.querySelector('svg');
  const bbox=e=>{const b=e.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height}};
  const hit=(a,b,p=0)=>a.x<b.x+b.w+p&&a.x+a.w>b.x-p&&a.y<b.y+b.h+p&&a.y+a.h>b.y-p;
  const dist=(b,x,y)=>Math.hypot(Math.max(b.x-x,0,x-b.x-b.w),Math.max(b.y-y,0,y-b.y-b.h));
  const ts=[...svg.querySelectorAll('text')].map(e=>({e,text:e.textContent,box:bbox(e),node:e.closest('[data-node]')}));
  const nodes=[...svg.querySelectorAll('[data-node]')].map(e=>({e,id:e.dataset.node,box:bbox(e)}));
  const problems=[];const fontSizes=[...new Set(ts.map(t=>getComputedStyle(t.e).fontSize))];
  for(let i=0;i<ts.length;i++){
   const t=ts[i];
   if(t.box.x<2||t.box.x+t.box.w>958||t.box.y<2||t.box.y+t.box.h>418)problems.push({kind:'viewbox',text:t.text,box:t.box});
   for(const n of nodes)if(n.e!==t.node&&hit(t.box,n.box,4))problems.push({kind:'foreign-node-margin',text:t.text,node:n.id});
   for(let j=i+1;j<ts.length;j++)if(hit(t.box,ts[j].box,4))problems.push({kind:'text-margin',texts:[t.text,ts[j].text]});
   for(const wire of svg.querySelectorAll('path.wire')){
    const length=wire.getTotalLength();let min=Infinity;
    for(let d=0;d<=length;d+=.5){const p=wire.getPointAtLength(d);min=Math.min(min,dist(t.box,p.x,p.y));}
    if(min<4)problems.push({kind:'wire-margin',text:t.text,distance:min,path:wire.getAttribute('d')});
   }
   for(const head of svg.querySelectorAll('polygon.head'))if(hit(t.box,bbox(head),4))problems.push({kind:'arrowhead-margin',text:t.text});
   for(const boundary of svg.querySelectorAll('rect.boundary')){
    const r=bbox(boundary);const edges=[{x:r.x,y:r.y,w:r.w,h:0},{x:r.x,y:r.y+r.h,w:r.w,h:0},{x:r.x,y:r.y,w:0,h:r.h},{x:r.x+r.w,y:r.y,w:0,h:r.h}];
    if(edges.some(e=>hit(t.box,e,4)))problems.push({kind:'boundary-margin',text:t.text});
   }
  }
  return {problems,fontSizes,labels:ts.map(({text,box})=>({text,box})),nodes:nodes.map(({id,box})=>({id,box}))};
 });
 frames.push({theme,frame,...geometry});await page.screenshot({path:`${out}/${frame}-${theme}.png`});
}
// Save representative prior frames through the same renderer for an equal-scale comparison.
for(const frame of ['d1s4','d2s2','d3s4','d5s4']){
 const svg=svgs(before).find(s=>id(s)===frame);
 await page.setContent(`<!doctype html><html data-theme="parchment"><head><style>${css}\nbody{margin:0}.board{width:960px;min-width:960px}.board .is-new{animation:none!important;transform:none!important}</style></head><body>${svg}</body></html>`);
 await page.screenshot({path:`${out}/${frame}-before.png`});
}
// Actual learning page: both themes at desktop and a genuine mobile viewport.
const pages=[];
for(const theme of ['parchment','dracula'])for(const width of [390,1440]){
 const p=await b.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 await p.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','zh')},theme);
 await p.goto((process.env.SITE_BASE||'http://localhost:8765')+'/chapters/ch01.html');
 const r=await p.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(r.innerWidth!==width||r.scrollWidth>width)throw Error('Page overflow');
 for(let d=0;d<5;d++){
  const deck=p.locator('.deck').nth(d);await deck.locator('.dot').nth(3).click();await deck.scrollIntoViewIfNeeded();
  await p.screenshot({path:`${out}/page-${width}-${theme}-d${d+1}.png`});
  if(width===390){const sc=deck.locator('.slide.is-on');r[`d${d+1}Scroll`]=await sc.evaluate(e=>{e.scrollLeft=e.scrollWidth;return e.scrollLeft});await p.screenshot({path:`${out}/page-${width}-${theme}-d${d+1}-right.png`});}
 }
 pages.push({theme,...r});await p.close();
}
const manifest={beforeChapterSHA256:hash(before),afterChapterSHA256:hash(current),beforeNonSvgSHA256:hash(outside(before)),afterNonSvgSHA256:hash(outside(current)),frameIds:newIds,frames,pages};
fs.writeFileSync(out+'/geometry.json',JSON.stringify(manifest,null,2));
const problems=frames.flatMap(f=>f.problems.map(p=>({frame:f.frame,theme:f.theme,...p})));
console.log(JSON.stringify({frames:frames.length,problems,pages,nonSvgSHA256:manifest.afterNonSvgSHA256},null,2));await b.close();
if(problems.length)process.exitCode=1;
