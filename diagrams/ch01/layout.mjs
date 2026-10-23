// Ch01 only: rebuild the existing 5 × 4 SVG frames using Ch03-like spacing.
// No prose, captions, title/desc text, CSS, animation order, or IDs are rewritten.
// Run from any directory: node diagrams/ch01/layout.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
const file = new URL('../../chapters/ch01.html', import.meta.url);
const before = fs.readFileSync(file, 'utf8');
const outside = s => s.replace(/<svg\b[\s\S]*?<\/svg>/g, '<SVG>');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text = (x,y,s,cls='tiny',anchor='middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`;
const group = (s,cls='',id='') => `<g${cls?` class="${cls}"`:''}${id?` data-node="${id}"`:''}>${s}</g>`;
const fresh = (s,on) => on?group(s,'is-new'):s;
function box(id,x,y,w,h,title,sub,cls='box',rx=12) {
 return group(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${cls}"/>`+text(x+w/2,y+h/2-5,title,'label')+text(x+w/2,y+h/2+19,sub,'sub'),'',id);
}
function person(label,y) {
 return group(`<circle cx="44" cy="${y}" r="12" class="box"/><path d="M24 ${y+46} Q44 ${y+14} 64 ${y+46}" class="wire"/>`+text(44,y+68,label,'label'),'','client');
}
function store(id,cx,top,bottom,title,sub) {
 return group(`<path d="M${cx-75} ${top} V${bottom} A75 12 0 0 0 ${cx+75} ${bottom} V${top}" class="store"/><ellipse cx="${cx}" cy="${top}" rx="75" ry="12" class="store"/>`+text(cx,top+36,title,'label')+text(cx,top+60,sub,'sub'),'',id);
}
function cache(x,y,w,title,sub,bad=false) {
 const cls='cache'+(bad?' bad':'');
 return group(`<rect x="${x+7}" y="${y+7}" width="${w}" height="64" rx="8" class="${cls}"/><rect x="${x}" y="${y}" width="${w}" height="64" rx="8" class="${cls}"/>`+text(x+w/2,y+23,title,'label')+text(x+w/2,y+47,sub,'sub'),'','cache');
}
function arrow(points,cls='',label='',labelX=0,labelY=0) {
 const end=points.at(-1),prev=points.at(-2),dx=end[0]-prev[0],dy=end[1]-prev[1],len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
 const base=[end[0]-ux*10,end[1]-uy*10];
 const nums=x=>Number(x.toFixed(2));
 const path=points.slice(0,-1).map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join(' ')+` L${nums(base[0])} ${nums(base[1])}`;
 const tip=[end,[base[0]-uy*5,base[1]+ux*5],[base[0]+uy*5,base[1]-ux*5]].map(p=>p.map(nums).join(',')).join(' ');
 return `<path d="${path}" class="wire${cls?' '+cls:''}"/><polygon points="${tip}" class="head${cls?' '+cls:''}"/>`+(label?text(labelX,labelY,label):'');
}
const badge=(x,y,w,label)=>group(`<rect x="${x}" y="${y}" width="${w}" height="22" rx="11" class="badge"/>`+text(x+w/2,y+15,label,'badge-text'),'','badge');
function legend() {
 return [['request','',128],['reply','reply',270],['async','async',392],['failure / fallback','fail',510]].map(([s,c,x])=>arrow([[x,400],[x+26,400]],c)+text(x+34,404,s,'tiny','start')).join('');
}
function world(frame) {
 const svc=box('service',210,158,150,84,'Service','read · write');
 const truth=store('store',555,150,216,'Source of truth','rows + outbox');
 let core=person('Caller',176)+svc+truth;
 core+=arrow([[70,191],[210,191]],'','GET / PUT',140,178);
 core+=arrow([[210,213],[70,213]],'reply','JSON / ack',140,237);
 core+=arrow([[360,191],[480,191]],'','read / commit',420,178);
 core+=arrow([[480,213],[360,213]],'reply','row / ack',420,237);
 let result=fresh(core,frame===1);
 if(frame>=2){
  let c=cache(480,42,150,'Cache','droppable');
  c+=arrow([[235,158],[235,64],[480,64]],'async','fill after row',355,52);
  c+=arrow([[270,158],[270,100],[480,100]],'','lookup',355,88);
  // Return through an independent top port: no shared crossing with lookup/fill.
  c+=arrow([[555,113],[555,130],[330,130],[330,158]],'reply','hit / miss',412,153);
  result+=fresh(c,frame===2);
 }
 if(frame>=3){
  let q=box('relay',495,300,90,60,'Relay','poll outbox');
  q+=group('<path d="M701 304 H749 A26 26 0 0 1 749 356 H701 A26 26 0 0 1 701 304" class="queue"/><path d="M746 314 V346 M754 314 V346 M762 314 V346" class="queue"/>'+text(711,336,'Queue','label'),'','queue');
  q+=box('worker',865,295,80,70,'Worker','fan-out');
  q+=arrow([[525,300],[525,227]],'','poll',508,277);
  q+=arrow([[565,228],[565,300]],'reply','events',595,277);
  q+=arrow([[585,330],[675,330]],'async','publish',630,316);
  q+=arrow([[775,330],[865,330]],'async','deliver',820,316);
  result+=fresh(q,frame===3);
 }
 if(frame===4)result+=fresh(badge(660,48,280,'COORDINATION · when required')+text(660,101,'not a default hop on every request','tiny','start'),true);
 return result;
}
function product(groupNo,frame) {
 const hasStore=groupNo!==4||frame>=2;
 const hasCache=(groupNo===3&&frame>=3)||(groupNo===4&&frame>=3)||groupNo===5;
 const failed=groupNo===5&&frame>=2;
 const gated=groupNo===5&&frame>=3;
 const shed=groupNo===5&&frame===4;
 const border='<rect x="95" y="15" width="850" height="365" rx="18" class="boundary"/>'+text(110,38,'SYSTEM TRUST BOUNDARY','tiny','start');
 let core=border+person('Client',206)+box('edge',200,200,110,60,'Edge','TLS · route','box alt',30);
 // A single service node in every frame, including the gate-addition frame.
 const sub=gated?'origin gate ≤80/s':failed?'no origin cap yet':'stateless';
 const svc=box('service',445,190,150,80,'Product Service',sub,gated?'box ok':'box');
 core+=fresh(svc,groupNo===5&&frame===3);
 core+=arrow([[70,221],[201.38,221]],'','GET',143,207);
 core+=arrow([[308.62,221],[445,221]],'','/products/42',377,207);
 let normal=arrow([[445,241],[307.91,241]],'reply',groupNo===5&&frame>=3?'':'JSON',377,265);
 normal+=arrow([[202.09,241],[70,241]],'reply',groupNo===5&&frame>=3?'':'200 / 404',143,265);
 if(groupNo===5&&frame===2)normal=group(normal,'muted');
 if(shed)normal=group(normal,'muted');
 core+=normal;
 let result=fresh(core,frame===1&&groupNo!==4||groupNo===4&&frame===1);
 if(hasStore){
  let st=store('store',840,190,256,'Product Store','source of truth');
  let a=arrow([[595,221],[765,221]],failed?'fail':'',failed?(gated?'fallback · admitted only':'UNSAFE · no gate'):'origin read',680,207);
  a+=arrow([[765,241],[595,241]],'reply','row / not found',680,265);
  if(groupNo===5&&frame===1)a=group(a,'muted');
  result+=fresh(st+a,groupNo===4&&frame===2);
 }
 if(hasCache){
  let c=cache(670,90,140,failed?'Cache down':'Cache',failed?'circuit open':groupNo===5?'healthy hit':'droppable',failed);
  let look=arrow([[495,190],[495,132],[670,132]],'','lookup',580,119);
  if(failed)look=group(look,'muted');
  c+=look;
  c+=arrow([[740,161],[740,172],[565,172],[565,190]],failed?'fail':'reply',failed?'timeout / open':'hit / miss',610,160);
  if(groupNo!==5)c+=arrow([[465,190],[465,102],[670,102]],'async','fill after row',570,89);
  result+=fresh(c,(groupNo===3||groupNo===4)&&frame===3||groupNo===5&&frame===2);
 }
 if(groupNo===2){
  if(frame===2||frame===3)result+=fresh(badge(350,50,300,'FUNCTION · one JSON or 404'),frame===2);
  if(frame>=3){
   const note=box('scope-note',590,300,330,56,'Not in this round','checkout · search · recommendations','box alt')+text(520,332,'NO WIRE','clock');
   result+=fresh(note,frame===3);
  }
  if(frame===4)result+=fresh(badge(325,50,420,'ASSUME · p99 80ms · 99.9% · stale ≤30s'),true);
 }
 if(groupNo===3){
  result+=badge(760,50,165,'≤100 seek/s');
  if(frame<4)result+=fresh(badge(380,50,200,frame===1?'1,000 avg QPS':'5,000 peak QPS'),frame<=2);
  if(frame===2)result+=fresh(text(660,65,'5,000 ÷ 100 = 50×','clock'),true);
  if(frame===4)result+=fresh(badge(325,50,420,'BUDGET · ≥98.4% hit · ≤80 miss/s')+text(680,318,'5,000 × (1 − 0.984) = 80','clock'),true);
 }
 if(groupNo===4&&frame===4)result+=fresh(text(135,301,'NOT DRAWN · Queue','clock','start')+text(135,323,'no async work on this GET','tiny','start')+text(135,347,'NOT DRAWN · Region B','clock','start')+text(135,369,'single-region scope; revisit RTO/RPO','tiny','start'),true);
 if(groupNo===5&&frame===3)result+=fresh(badge(350,50,360,'ADMIT · ≤80/s to origin'),true);
 if(shed){
  let reject=arrow([[445,241],[307.91,241]],'fail','503',377,265)+arrow([[202.09,241],[70,241]],'fail','503',143,265);
  reject+=badge(340,50,570,'≤80/s admitted · ≈4,920/s shed before origin');
  reject+=text(480,330,'degrade only if a local copy already exists','clock','start')+text(480,352,'keep valid_until; expired → 503','tiny','start');
  result+=fresh(reject,true);
 }
 return result;
}
let count=0;
const after=before.replace(/<svg\b[\s\S]*?<\/svg>/g,svg=>{
 const id=svg.match(/aria-labelledby="d(\d)s(\d)t /);
 if(!id)throw Error('Unexpected SVG');
 const g=Number(id[1]),f=Number(id[2]);count++;
 const head=svg.match(/^<svg[^>]*>/)[0];
 const title=svg.match(/<title\b[^>]*>[\s\S]*?<\/title>/)[0];
 const desc=svg.match(/<desc\b[^>]*>[\s\S]*?<\/desc>/)[0];
 return `${head}\n          ${title}\n          ${desc}\n          ${legend()}\n          ${g===1?world(f):product(g,f)}\n        </svg>`;
});
if(count!==20)throw Error(`Expected 20 frames, got ${count}`);
if(outside(before)!==outside(after))throw Error('Non-SVG content changed');
fs.writeFileSync(file,after);
console.log(JSON.stringify({frames:count,nonSvgSHA256:hash(outside(after)),chapterSHA256:hash(after)},null,2));
