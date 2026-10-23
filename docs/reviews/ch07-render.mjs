import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const phase=process.argv[2]||'after';
const out=`docs/reviews/screenshots/ch07/${phase}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:480},reducedMotion:'reduce'});
const html=fs.readFileSync('chapters/ch07.html','utf8');
const svgs=[...html.matchAll(/<svg\b[^>]*class="board"[^>]*>[\s\S]*?<\/svg>/g)].map(m=>m[0]);
for(const theme of ['parchment','dracula']) {
for(const svg of svgs){
const id=svg.match(/aria-labelledby="(\S+?)t\s/)[1];
await page.goto('http://127.0.0.1:8765/chapters/ch07.html');
await page.setContent(`<html data-theme="${theme}"><head><link rel="stylesheet" href="http://127.0.0.1:8765/assets/css/style.css"><style>body{margin:0}.board{width:960px;min-width:960px}.is-new{animation:none!important}</style></head><body>${svg}</body></html>`);
await page.evaluate(()=>document.fonts.ready);
await page.locator('svg').screenshot({path:`${out}/${id}-${theme}.png`});
}
}
await browser.close();console.log(`Rendered ${svgs.length} frames ×2 in ${out}`);
