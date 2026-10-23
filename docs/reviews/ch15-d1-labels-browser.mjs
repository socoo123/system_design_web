import fs from 'node:fs';
import crypto from 'node:crypto';
import {chromium} from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const html=fs.readFileSync('chapters/ch15.html','utf8');
const before=JSON.parse(fs.readFileSync('docs/reviews/ch15-d1-labels-before.json'));
const after=[...html.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].slice(0,5).map(m=>m[0]);
const out='docs/reviews/screenshots/ch15/d1-labels';fs.mkdirSync(out,{recursive:true});
const result={sha256:crypto.createHash('sha256').update(html).digest('hex'),geometry:[],layouts:[],errors:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
function check(v,m){if(!v)throw Error(m);}
try {
 const page=await browser.newPage({viewport:{width:960,height:420},reducedMotion:'reduce'});
 for(const [phase,frames] of [['before',before.svgs],['after',after]])for(const theme of ['parchment','dracula'])for(let i=0;i<5;i++) {
  await page.setContent(`<!doctype html><html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>html,body{margin:0;width:960px;height:420px;overflow:hidden}.board{width:960px!important;min-width:960px!important;height:420px!important}.is-new{animation:none!important}</style></head><body>${frames[i]}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  const labels=await page.evaluate(()=>[...document.querySelectorAll('svg text')].filter(e=>['init / commit','session / version'].includes(e.textContent)).map(e=>{
   const b=e.getBBox();return {text:e.textContent,x:Number(e.getAttribute('x')),bbox:{x:b.x,y:b.y,width:b.width,height:b.height},leftBoundaryGap:b.x-120,rightMetadataGap:250-b.x-b.width};
  }));
  if(phase==='after')for(const label of labels)check(label.x===180&&label.leftBoundaryGap>=12&&label.rightMetadataGap>=22,'D1 label crosses boundary/node');
  result.geometry.push({phase,theme,frame:`d1s${i+1}`,labels});
  await page.screenshot({path:`${out}/${phase}-d1s${i+1}-${theme}.png`});
 }
 await page.close();
 for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula']) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
  await page.goto('http://127.0.0.1:8765/chapters/ch15.html');await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
  const state=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  check(state.innerWidth===width&&state.scrollWidth===width,'layout overflow');result.layouts.push({width,theme,...state});
  if(width===390) {
   const deck=page.locator('.deck').first();
   for(let i=0;i<5;i++) {
    await deck.locator('.dot').nth(i).click();const slide=deck.locator('.slide.is-on');
    for(const position of ['left','middle','right']) {
     await slide.evaluate((e,p)=>e.scrollLeft=p==='left'?0:p==='right'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2,position);
     await deck.screenshot({path:`${out}/390-d1s${i+1}-${theme}-${position}.png`});
    }
   }
  }
  await context.close();
 }
 check(!result.errors.length,'browser errors');result.passed=true;
}catch(e){result.passed=false;result.failure=String(e);process.exitCode=1;}
finally{await browser.close();fs.writeFileSync('docs/reviews/ch15-d1-labels-browser-results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,hash:result.sha256,geometry:result.geometry.length,layouts:result.layouts.length,failure:result.failure}));}
