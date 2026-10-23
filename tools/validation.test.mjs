// Small in-memory regression cases: never rewrite live chapter files.
import assert from 'node:assert/strict';
import {read,parse,validateChapter,validateDocument,validateSvg} from './validation.mjs';
let passed=0;
function test(name,fn){fn();passed++;console.log(`PASS ${name}`);}
const original=read('chapters/ch02.html');
const check=s=>validateChapter(s,'ch02');
const fail=(s,pattern)=>assert(check(s).errors.some(e=>pattern.test(e)),`expected ${pattern}`);
const firstSlide=parse(original).find(n=>n.classes.includes('slide'));
const one='<svg viewBox="0 0 100 200" role="img" aria-labelledby="t d"><title id="t">State</title><desc id="d">One state</desc></svg>';
const short=`<title>Ch99 · Example</title><article class="chapter"><p class="lang-zh">短文</p><p class="lang-en">Short.</p><figure class="deck"><div class="slide">${one}<figcaption>One state.</figcaption></div></figure><button class="read-toggle">Done</button><div class="flip">Card</div></article>`;
test('short chapter, one frame, portrait SVG, no legend/is-new/citation quota accepted',()=>assert.deepEqual(validateChapter(short,'ch99').errors,[]));
test('language counts may differ',()=>assert.deepEqual(validateChapter(short.replace('</article>','<span class="lang-en">Extra label</span></article>'),'ch99').errors,[]));
test('incorrect title chapter number rejected',()=>fail(original.replace('<title>Ch02','<title>Ch25'),/title must begin/));
test('duplicate IDs rejected',()=>fail(original.replace('</article>','<i id="regression"></i><i id="regression"></i></article>'),/duplicate id/));
test('cross-language nesting rejected',()=>fail(original.replace('</article>','<div class="lang-zh"><span class="lang-en">bad</span></div></article>'),/cross-language/));
test('missing local resource rejected',()=>fail(original.replace('</article>','<img src="../assets/missing.svg" alt="Missing"></article>'),/missing local resource/));
test('unsafe URL rejected',()=>fail(original.replace('</article>','<a href="javascript:alert(1)">bad</a></article>'),/unsafe/));
test('protocol-relative runtime script rejected',()=>fail(original+'<script src="//cdn.example/x.js"></script>',/external runtime resource/));
test('frame deletion rejected against baseline',()=>fail(original.slice(0,firstSlide.start)+original.slice(firstSlide.end),/animation reduction/));
test('slide wrapper rejected to match real player',()=>fail(original.slice(0,firstSlide.start)+'<div>'+original.slice(firstSlide.start,firstSlide.end)+'</div>'+original.slice(firstSlide.end),/direct children/));
test('missing slide caption rejected',()=>fail(original.replace(/<figcaption>[\s\S]*?<\/figcaption>/,''),/needs a caption/));
test('animation frame reorder reported',()=>{
 const slides=parse(original).filter(n=>n.classes.includes('slide')),a=slides[0],b=slides[1];
 const changed=original.slice(0,a.start)+original.slice(b.start,b.end)+original.slice(a.end,b.start)+original.slice(a.start,a.end)+original.slice(b.end);
 assert(check(changed).warnings.some(w=>/grouping\/order/.test(w)));
});
test('unmarked new code rejected',()=>fail(original.replace('</article>','<pre><code>return value;</code></pre></article>'),/data-language/));
test('marked pseudocode accepted',()=>assert.deepEqual(check(original.replace('</article>','<pre data-language="Pseudocode" data-kind="pseudocode"><code>return value;</code></pre></article>')).errors,[]));
test('SVG external content rejected',()=>assert(validateSvg('<svg viewBox="0 0 2 2"><image href="https://example.com/a.png"/></svg>','bad.svg').length));
test('disabled existing chapter entry rejected',()=>assert(validateDocument('<span class="chip soon">Ch02 pending</span>','index.html').errors.length));
test('static diagram needs both theme resources',()=>fail(original.replace('</article>','<figure class="static-diagram"><figcaption>Example</figcaption></figure></article>'),/one direct link per theme/));
console.log(`${passed} focused regression cases passed`);
