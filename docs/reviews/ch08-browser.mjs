import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const stage=process.argv[2]||'after';
const out=`docs/reviews/screenshots/ch08/${stage}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={stage,layouts:[],frames:[],errors:[]};
for(const theme of ['parchment','dracula']) {
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await p.addInitScript(t=>{localStorage.setItem('sd-theme',t);localStorage.setItem('sd-locale','both')},theme);
 await p.goto('http://127.0.0.1:8765/chapters/ch08.html');await p.evaluate(()=>document.fonts.ready);
 for(const [d,deck] of (await p.locator('.deck').all()).entries()) {
  for(const [f,dot] of (await deck.locator('.dot').all()).entries()) {
   await dot.click();await deck.locator('.slide.is-on svg').screenshot({path:`${out}/${theme}-d${d+1}s${f+1}.png`});
   result.frames.push({theme,id:await deck.locator('.slide.is-on svg title').getAttribute('id')});
  }
 }
 await p.close();
}
if(stage==='after') for(const width of [320,390,768,1440])for(const theme of ['parchment','dracula'])for(const locale of ['zh','en','both']) {
 const p=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
 p.on('pageerror',e=>result.errors.push(e.message));
 await p.addInitScript(({theme,locale})=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale',locale)},{theme,locale});
 await p.goto('http://127.0.0.1:8765/chapters/ch08.html');await p.evaluate(()=>document.fonts.ready);
 const layout=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,locale:document.documentElement.dataset.locale,code:[...document.querySelectorAll('pre')].map(x=>({kind:x.dataset.kind,language:x.dataset.language})),toc:[...document.querySelectorAll('.toc-links a')].every(a=>!!document.getElementById(a.hash.slice(1)))}));
 if(width===390 && locale==='both') {
  layout.frameVisits=0; layout.diagramScroll=[];
  for(const [i,d] of (await p.locator('.deck').all()).entries()) {
   for(const dot of await d.locator('.dot').all()){await dot.click();layout.frameVisits++;}
   await d.screenshot({path:`${out}/mobile-${theme}-d${i+1}.png`});
   const scroll=await d.locator('.slide.is-on').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth}));
   await d.locator('.slide.is-on').evaluate(e=>{e.scrollLeft=e.scrollWidth});
   scroll.right=await d.locator('.slide.is-on').evaluate(e=>e.scrollLeft);
   if(scroll.scrollWidth>scroll.width&&scroll.right===0)throw Error('diagram not scrollable');
   await d.screenshot({path:`${out}/mobile-${theme}-d${i+1}-right.png`});
   layout.diagramScroll.push(scroll);
  }
 }
 result.layouts.push(layout);if(layout.width!==width||layout.scrollWidth!==width)throw Error(JSON.stringify(layout));
 if(locale==='both') {await p.screenshot({path:`${out}/page-${width}-${theme}.png`});await p.locator('pre').first().scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/code-${width}-${theme}.png`});}
 await p.close();
}
if(stage==='after') {
 const c=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});const p=await c.newPage();
 await p.goto('http://127.0.0.1:8765/chapters/ch08.html');await p.locator('[data-locale-set="en"]').click();await p.locator('[data-theme-set="dracula"]').click();
 let copied=0;for(const block of await p.locator('.code-block').all()) {await block.locator('.code-copy').click();if(await p.evaluate(()=>navigator.clipboard.readText())!==await block.locator('code').textContent())throw Error('clipboard');copied++;}
 const d=p.locator('.deck').first();await d.locator('.dot').first().click();await d.focus();await p.keyboard.press('ArrowRight');if(!(await d.locator('.deck-count').innerText()).startsWith('2 /'))throw Error('keyboard');
 await d.locator('.deck-speed').click();await d.locator('.deck-loop').click();await d.locator('.deck-toggle').click();await p.waitForFunction(()=>!document.querySelector('.deck-count').textContent.startsWith('2 /'),null,{timeout:6000});await d.locator('.deck-toggle').click();
 const flash=p.locator('.flip').first();await flash.click();if(!(await flash.getAttribute('class')).includes('is-flipped'))throw Error('flashcard');
 await p.locator('.read-toggle').click();await p.reload();if(await p.locator('.read-toggle').getAttribute('aria-pressed')!=='true')throw Error('read persistence');
 if(!await p.evaluate(()=>document.documentElement.dataset.theme==='dracula'&&document.documentElement.dataset.locale==='en'))throw Error('settings persistence');
 result.interactions={copied,keyboard:true,playback:true,speed:true,loop:true,flashcard:true,progress:true,settings:true};await c.close();
}
await browser.close();fs.writeFileSync(`docs/reviews/ch08-browser-${stage}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({stage,layouts:result.layouts.length,frames:result.frames.length,errors:result.errors}));
