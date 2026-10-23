// Run with PLAYWRIGHT_MODULE pointing to an installed @playwright/test module.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
import fs from 'node:fs';
const out=new URL('./screenshots/ch01', import.meta.url).pathname;
const b=await chromium.launch({executablePath:process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[];
for(const theme of ['parchment','dracula']){
 const p=await b.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
 await p.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','zh')},theme);
 await p.goto((process.env.SITE_BASE || 'http://localhost:8765')+'/chapters/ch01.html');await p.screenshot({path:`${out}/page-390-${theme}-opening.png`});
 const d=p.locator('.deck').nth(4);await d.locator('.dot').nth(3).click();await d.scrollIntoViewIfNeeded();
 const diagram=await d.locator('.slide.is-on').evaluate(el=>{el.scrollLeft=el.scrollWidth;return {client:el.clientWidth,scroll:el.scrollWidth,left:el.scrollLeft}});
 if(diagram.left<=0)throw Error('diagram scroll');await p.screenshot({path:`${out}/page-390-${theme}-diagram-scrolled.png`});
 await p.locator('pre').scrollIntoViewIfNeeded();const code=await p.locator('pre').evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft});if(code<=0)throw Error('code scroll');
 const tab=await p.locator('.table-scroll').first().evaluate(el=>{el.scrollLeft=el.scrollWidth;return {client:el.clientWidth,scroll:el.scrollWidth,left:el.scrollLeft}});
 const toc=p.locator('.toc');await toc.locator('summary').click();await toc.locator('a').filter({hasText:'第四步'}).click();
 checks.push({theme,diagram,code,table:tab,tocHash:new URL(p.url()).hash});await p.close();
}
fs.writeFileSync(out+'/extra-results.json',JSON.stringify(checks,null,2));console.log(checks);await b.close();
