import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const before=process.argv.includes('--before');
const file=before?'/tmp/sd-ch04-ch09-authorized-20261022/ch04.html':'chapters/ch04.html';
const source=fs.readFileSync(file,'utf8'),css=fs.readFileSync('assets/css/style.css','utf8');
const svgs=[...source.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
const inventory=[];
for(const theme of (before?['parchment']:['parchment','dracula']))for(const svg of svgs){
const id=svg.match(/aria-labelledby="(\S+?)t /)[1];
await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${css}\nbody{margin:0}.board{width:960px;min-width:960px;border-radius:0}.board .is-new{animation:none!important;transform:none!important}</style></head><body>${svg}</body></html>`);
await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:`docs/reviews/screenshots/ch04/${id}-${before?'before':theme}.png`});
const geometry=await page.evaluate(()=>{
 const svg=document.querySelector('svg');
 const bbox=e=>{const b=e.getBBox();return {x:b.x,y:b.y,w:b.width,h:b.height}};
 const hit=(a,b,p=0)=>a.x<b.x+b.w+p&&a.x+a.w>b.x-p&&a.y<b.y+b.h+p&&a.y+a.h>b.y-p;
 const texts=[...svg.querySelectorAll('text')].map(e=>({text:e.textContent,box:bbox(e)}));
 const overlaps=[],near=[],wires=[];
 for(let i=0;i<texts.length;i++){
  const a=texts[i];for(const b of texts.slice(i+1)){
   if(hit(a.box,b.box))overlaps.push([a.text,b.text]);else if(hit(a.box,b.box,3))near.push([a.text,b.text]);
  }
  for(const wire of svg.querySelectorAll('path.wire')){
   const len=wire.getTotalLength();let distance=Infinity;
   for(let d=0;d<=len;d+=1){const p=wire.getPointAtLength(d),b=a.box;distance=Math.min(distance,Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.w),Math.max(b.y-p.y,0,p.y-b.y-b.h)));}
   if(distance<1)wires.push({text:a.text,path:wire.getAttribute('d'),distance});
  }
 }
 return {textOverlaps:overlaps,nearTextMargins3px:near,wireTextOverlaps:wires,labels:texts};
});
inventory.push({id,theme,title:svg.match(/<title[^>]*>(.*?)<\/title>/)[1],...geometry});
}
fs.writeFileSync(`docs/reviews/ch04-${before?'baseline':'frames'}.json`,JSON.stringify(inventory,null,2));
await browser.close();
