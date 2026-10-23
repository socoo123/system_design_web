import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);const phase=process.argv[2]||'before';
const dir=`docs/reviews/screenshots/ch07/${phase}`;const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:960,height:420}});
for(const theme of ['parchment','dracula'])for(let d=1;d<=5;d++){
const imgs=fs.readdirSync(dir).filter(f=>f.startsWith(`d${d}s`)&&f.endsWith(`${theme}.png`));
await page.setContent(`<body style="margin:0">${imgs.map(f=>`<img style="display:block;width:960px" src="http://127.0.0.1:8765/${dir}/${f}">`).join('')}</body>`);await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.screenshot({path:`${dir}/deck${d}-${theme}.png`,fullPage:true});}
await browser.close();
