import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs';
const html=fs.readFileSync('chapters/ch27.html','utf8');
const result={sha256:crypto.createHash('sha256').update(html).digest('hex'),scrolls:[],clearances:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{for(const theme of ['parchment','dracula']){
 const page=await browser.newPage({viewport:{width:390,height:1000},reducedMotion:'reduce'});
 await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both')},theme);
 await page.goto('http://127.0.0.1:8765/chapters/ch27.html');await page.evaluate(()=>document.fonts.ready);
 for(const d of [4,5]){
  const deck=page.locator('.deck').nth(d-1);
  for(let i=0;i<5;i++){
   await deck.locator('.dot').nth(i).click();
   for(const position of ['left','middle','right']){
    const actual=await deck.locator('.slide.is-on').evaluate((e,position)=>{
     const max=e.scrollWidth-e.clientWidth;e.scrollLeft=position==='left'?0:position==='right'?max:max/2;
     return{innerWidth,documentWidth:document.documentElement.scrollWidth,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft,max};
    },position);
    if(actual.innerWidth!==390||actual.documentWidth!==390||actual.max<=0)throw Error('Incorrect mobile overflow scope');
    if(position==='right'&&Math.abs(actual.scrollLeft-actual.max)>1)throw Error('Cannot reach right edge');
    result.scrolls.push({theme,deck:d,frame:i+1,position,...actual});
   }
  }
 }
 const geometry=await page.evaluate(()=>{
  const b=e=>{const q=e.getBBox();return{x:q.x,y:q.y,w:q.width,h:q.height}};
  const svg=document.querySelector('[aria-labelledby="d4s5t d4s5d"]');
  const texts=[...svg.querySelectorAll('text')].filter(x=>x.textContent.startsWith('Match rechecks')||x.textContent.startsWith('capture age'));
  const cell=[...svg.querySelectorAll('rect')].find(x=>x.getAttribute('x')==='580'&&x.getAttribute('y')==='296');
  const node=b(cell);const labels=texts.map(x=>({text:x.textContent,...b(x)}));
  return {cell:node,labels,minHorizontalGap:Math.min(...labels.map(t=>node.x-t.x-t.w))};
 });
 if(geometry.minHorizontalGap<100)throw Error('D4 footer remains too close to cell');
 result.clearances.push({theme,...geometry});await page.close();
}}finally{await browser.close()}
result.passed=true;fs.writeFileSync('docs/reviews/ch27-scroll-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,positions:result.scrolls.length,clearances:result.clearances}));
