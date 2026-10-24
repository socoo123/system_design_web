import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const out='docs/reviews/screenshots/ch23/d1-final';fs.mkdirSync(out,{recursive:true});
const before=fs.readFileSync('docs/reviews/ch23-d1-pre-layout.html','utf8'),after=fs.readFileSync('chapters/ch23.html','utf8');
const svgs=s=>[...s.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(m=>m[0]);
const beforeSvgs=svgs(before),afterSvgs=svgs(after);
if(JSON.stringify(beforeSvgs.slice(5))!==JSON.stringify(afterSvgs.slice(5)))throw new Error('Unrelated diagram changed');
const result={sha256:crypto.createHash('sha256').update(after).digest('hex'),unchangedOutsideD1:true,geometry:[],layouts:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
 for(const phase of ['before','after'])for(const theme of ['parchment','dracula'])for(let i=0;i<5;i++){
  const svg=(phase==='before'?beforeSvgs:afterSvgs)[i];
  await page.setContent(`<html data-theme="${theme}"><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style>${svg}</html>`);
  await page.evaluate(()=>document.fonts.ready);
  const labels=await page.locator('svg text').evaluateAll(es=>es.filter(e=>['match','result','ACK checkpoint only after apply'].includes(e.textContent)).map(e=>{const b=e.getBBox();return{text:e.textContent,x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height,boundaryGap:['match','result'].includes(e.textContent)?120-b.x-b.width:null,outboxGap:e.textContent.startsWith('ACK')?648-b.x-b.width:null}}));
  if(phase==='after'&&labels.some(l=>l.boundaryGap!==null&&l.boundaryGap<10||l.outboxGap!==null&&l.outboxGap<10))throw new Error('Insufficient label clearance');
  result.geometry.push({phase,theme,frame:`d1s${i+1}`,labels});
  await page.screenshot({path:`${out}/${phase}-d1s${i+1}-${theme}.png`});
 }
 for(const width of [1440,390])for(const theme of ['parchment','dracula']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();
  await p.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','both')},theme);
  await p.goto('http://127.0.0.1:8765/chapters/ch23.html');await p.waitForSelector('.deck-next');const deck=p.locator('.deck').first();
  const state={width,theme,...await p.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth})),frames:[]};
  if(state.innerWidth!==width||state.scrollWidth!==width)throw new Error('Page overflow');
  for(let i=0;i<5;i++){
   await deck.locator('.dot').nth(i).click();const positions=[];
   for(const pos of width===390?['left','middle','right']:['left']){
    const scroll=await deck.locator('.slide.is-on').evaluate((e,pos)=>{e.scrollLeft=pos==='left'?0:pos==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;return{scrollLeft:e.scrollLeft,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth}},pos);
    await deck.screenshot({path:`${out}/${width}-${theme}-d1s${i+1}-${pos}.png`});positions.push({pos,...scroll});
   }
   state.frames.push({id:`d1s${i+1}`,positions});
  }
  result.layouts.push(state);await context.close();
 }
 result.passed=true;
}finally{await browser.close();fs.writeFileSync('docs/reviews/ch23-d1-layout-results.json',JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:result.passed,layouts:result.layouts.length,hash:result.sha256,geometry:result.geometry.filter(g=>g.phase==='after'&&g.frame==='d1s5')}));
