import fs from 'node:fs';
import crypto from 'node:crypto';
const { chromium } = await import('/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs');
const dir='docs/reviews/screenshots/ch41-author/narrow';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={sha256:crypto.createHash('sha256').update(fs.readFileSync('chapters/ch41.html')).digest('hex'),checks:[]};
try {
  for(const width of [320,390]) for(const theme of ['parchment','dracula']) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.addInitScript(theme=>{localStorage.setItem('sd-theme',theme);localStorage.setItem('sd-locale','both');},theme);
    await page.goto('http://127.0.0.1:8765/chapters/ch41.html');
    await page.waitForSelector('.deck-next');await page.evaluate(()=>document.fonts.ready);
    for(const number of [5,8]) {
      const deck=page.locator('.deck').nth(number-1);
      await deck.locator('.dot').last().click();
      const slide=deck.locator('.slide.is-on');
      const before=await slide.evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft}));
      if(width===390) await deck.screenshot({path:`${dir}/d${number}-${width}-${theme}-left.png`});
      const after=await slide.evaluate(e=>{e.scrollLeft=e.scrollWidth;return {width:e.clientWidth,scrollWidth:e.scrollWidth,scrollLeft:e.scrollLeft,bodyWidth:document.documentElement.scrollWidth,innerWidth};});
      if(!(after.scrollWidth>after.width && after.scrollLeft>0 && after.bodyWidth===width && after.innerWidth===width)) throw new Error('Unreachable narrow diagram');
      if(width===390) await deck.screenshot({path:`${dir}/d${number}-${width}-${theme}-right.png`});
      result.checks.push({width,theme,deck:number,before,after});
    }
    await page.close();
  }
  result.passed=true;
} finally {
  await browser.close();
  fs.writeFileSync('docs/reviews/ch41-narrow-results.json',JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify({passed:result.passed,checks:result.checks.length}));
