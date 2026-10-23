import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const phase=process.argv[2]||'after';
if(!['before','after'].includes(phase))throw Error('phase must be before or after');
fs.mkdirSync(`docs/reviews/screenshots/ch09/${phase}`,{recursive:true});
const html=fs.readFileSync(phase==='before'?(process.env.CH09_BEFORE || '/tmp/sd-ch04-ch09-authorized-20261022/ch09.html'):'chapters/ch09.html','utf8');
const css=fs.readFileSync('assets/css/style.css','utf8');
const svgs=[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const browser=await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
const records=[];
for(const theme of ['parchment','dracula']) for(const svg of svgs){
 const id=svg.match(/<title id="([^"]+)"/)[1];
 await page.setContent(`<html data-theme="${theme}"><style>${css}body{margin:0}.board{width:960px;min-width:960px;border-radius:0}.board .is-new{animation:none!important;transform:none!important}</style>${svg}</html>`);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`docs/reviews/screenshots/ch09/${phase}/${id}-${theme}.png`});
 const problems=await page.evaluate(()=>{
  const svg=document.querySelector('svg'),ts=[...svg.querySelectorAll('text')];const issues=[];
  const box=e=>e.getBBox(),hit=(a,b,p=2)=>a.x<b.x+b.width+p&&a.x+a.width>b.x-p&&a.y<b.y+b.height+p&&a.y+a.height>b.y-p;
  for(let i=0;i<ts.length;i++){
   const t=ts[i],a=box(t);if(a.x<0||a.x+a.width>960||a.y<0||a.y+a.height>420)issues.push(['bounds',t.textContent]);
   for(let j=i+1;j<ts.length;j++)if(hit(a,box(ts[j])))issues.push(['text',t.textContent,ts[j].textContent]);
   for(const w of svg.querySelectorAll('path.wire')){
    let intersects=false;for(let p=0;p<w.getTotalLength();p+=1){const q=w.getPointAtLength(p);if(q.x>a.x-2&&q.x<a.x+a.width+2&&q.y>a.y-2&&q.y<a.y+a.height+2){intersects=true;break;}}
    if(intersects)issues.push(['wire',t.textContent,w.getAttribute('d')]);
   }
  }return issues;
 });records.push({id,theme,problems});
}
fs.writeFileSync(`docs/reviews/ch09-${phase}-frames.json`,JSON.stringify(records,null,2));
console.log(JSON.stringify({frames:svgs.length,renders:records.length,issues:records.filter(x=>x.problems.length)}));await browser.close();
