// Structural acceptance for PLAN.md §§2.3, 4–6 and 8. Counts are observations,
// never substitutes for technical review or rendered-page inspection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hash = s => crypto.createHash('sha256').update(s).digest('hex');
export const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export function parse(html) {
  const nodes = [], stack = [];
  const tokens = /<!--[\s\S]*?-->|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (const m of html.matchAll(tokens)) {
    if (m[0].startsWith('<!--')) continue;
    const tag = m[0].match(/^<\/?([\w:-]+)/)[1].toLowerCase();
    if (m[0].startsWith('</')) {
      const i = stack.findLastIndex(n => n.tag === tag);
      if (i >= 0) { stack[i].end = m.index + m[0].length; stack[i].innerEnd = m.index; stack.length = i; }
      continue;
    }
    const opening = m[0].match(/^<(?:[^>"']|"[^"]*"|'[^']*')*>/)[0];
    const attrs = {};
    for (const a of opening.matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const n = { tag, attrs, classes: (attrs.class || '').split(/\s+/), parent: stack.at(-1), start: m.index, innerStart: m.index + opening.length, end: m.index + m[0].length, innerEnd: m.index + m[0].length };
    nodes.push(n);
    if (!voids.has(tag) && !opening.endsWith('/>') && !['script','style'].includes(tag)) stack.push(n);
  }
  return nodes;
}
export const inside = (node, ancestor) => { for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true; return false; };
export const content = (html, node) => html.slice(node.innerStart, node.innerEnd);
export const textOf = (html, node) => content(html, node).replace(/<[^>]*>/g, '').trim();
export function inventory(html) {
  const nodes = parse(html), decks = nodes.filter(n => n.tag === 'figure' && n.classes.includes('deck'));
  return decks.map(d => nodes.filter(n => n.classes.includes('slide') && n.parent === d).map(s => {
    const svg = nodes.find(n => n.tag === 'svg' && inside(n,s));
    return svg?.attrs['aria-labelledby']?.split(/\s+/)[0] || svg?.attrs.id || null;
  }));
}
export function localTarget(rel, raw) {
  const decoded = raw.replace(/&amp;/g, '&');
  if (/^(?:https?:|mailto:|tel:)/i.test(decoded)) return null;
  if (/^(?:[a-z][\w+.-]*:|\/\/|\/)/i.test(decoded)) throw Error(`unsafe/non-relative URL ${raw}`);
  const [file, fragment] = decoded.split('#');
  let target;
  try { target = file.split('?')[0] ? path.resolve(root, path.dirname(rel), decodeURIComponent(file.split('?')[0])) : path.join(root, rel); }
  catch { throw Error(`invalid URL ${raw}`); }
  if (target !== root && !target.startsWith(root + path.sep)) throw Error(`URL escapes site ${raw}`);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw Error(`missing local resource ${raw}`);
  if (!fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep)) throw Error(`resource escapes site through symlink ${raw}`);
  return { target, fragment: fragment ? decodeURIComponent(fragment) : '' };
}
export function validateDocument(html, rel) {
  const errors = [], warnings = [], nodes = parse(html), ids = new Set();
  const fail = s => errors.push(`${rel}: ${s}`);
  for (const n of nodes) {
    const a = n.attrs;
    if (a.id) { if (ids.has(a.id)) fail(`duplicate id ${a.id}`); ids.add(a.id); }
    const langs = n.classes.filter(x => ['lang-zh','lang-en'].includes(x));
    if (langs.length > 1) fail('one node has both language classes');
    for (let p=n.parent; p; p=p.parent) if (langs.some(l => p.classes.includes(l === 'lang-zh' ? 'lang-en' : 'lang-zh'))) { fail('cross-language nesting'); break; }
    if (n.classes.includes('chip') && (n.classes.includes('soon') || a['aria-disabled'] === 'true' || /待重构|待上线|待复审|\bpending\b|\bplanned\b/i.test(textOf(html,n)))) {
      for (const m of textOf(html,n).matchAll(/Ch(\d{2})\b/gi)) if (fs.existsSync(path.join(root, 'chapters', `ch${m[1]}.html`))) fail(`disables existing chapter ch${m[1]}`);
    }
    for (const attr of ['src','href','data-light-src','data-dark-src','data-src-parchment','data-src-dracula']) {
      if (!(attr in a)) continue;
      const url = a[attr];
      const resource = attr !== 'href' || ['link','use','image'].includes(n.tag);
      if (resource && /^(?:https?:|\/\/)/i.test(url)) { fail(`external runtime resource ${url}`); continue; }
      try {
        const result = localTarget(rel,url);
        if (result?.fragment && /\.html$/i.test(result.target)) {
          const targets = result.target === path.join(root,rel) ? nodes : parse(fs.readFileSync(result.target,'utf8'));
          if (!targets.some(n => n.attrs.id === result.fragment)) fail(`missing anchor ${url}`);
        }
        if (result && attr === 'src' && n.tag === 'img' && /\.svg$/i.test(result.target)) errors.push(...validateSvg(fs.readFileSync(result.target,'utf8'),path.relative(root,result.target)));
      } catch (e) { fail(e.message); }
    }
    if (n.tag === 'img' && !a.alt?.trim()) fail('image needs nonempty alt text');
    if (n.tag === 'svg') {
      const box = (a.viewbox || '').trim().split(/[\s,]+/).map(Number);
      if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) fail('SVG requires positive viewBox');
      const children = nodes.filter(x => inside(x,n));
      if (!children.some(x => x.tag === 'title' && textOf(html,x)) || !children.some(x => x.tag === 'desc' && textOf(html,x))) fail('inline SVG needs title and desc');
      if (a.role !== 'img' || (!a['aria-label']?.trim() && !a['aria-labelledby']?.trim())) fail('inline SVG needs role=img and accessible name');
      if (a['aria-labelledby']) for (const id of a['aria-labelledby'].split(/\s+/)) if (!children.some(x => x.attrs.id === id)) fail(`SVG aria-labelledby missing ${id}`);
    }
  }
  if (/d2[^\s"']*\.wasm|(?:https?:)?\/\/[^\s"']+d2[^\s"']*\.js/i.test(html)) fail('browser D2 runtime is not allowed');
  return { errors, warnings, nodes };
}
export function validateSvg(svg, rel) {
  const errors = [], fail = s => errors.push(`${rel}: ${s}`);
  if (/<(?:script|foreignObject)\b|\son\w+\s*=|<!ENTITY/i.test(svg)) fail('unsafe active SVG content');
  for (const m of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']*)["']/gi)) if (!m[1].startsWith('#') && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(m[1])) fail(`non-embedded SVG resource ${m[1]}`);
  for (const m of svg.matchAll(/url\(\s*["']?([^)'"\s]+)/gi)) if (!m[1].startsWith('#') && !/^data:(?:font\/|application\/)/i.test(m[1])) fail('SVG CSS references external resource');
  if (!/<svg\b[^>]*viewBox=["'][^"']+["']/i.test(svg)) fail('static SVG missing viewBox');
  return errors;
}
export function validateChapter(html, id) {
  const rel=`chapters/${id}.html`, result=validateDocument(html,rel), {nodes,errors,warnings}=result;
  const fail=s=>errors.push(`${rel}: ${s}`);
  const baseline=JSON.parse(read('tools/validation-baseline.json'));
  const original=JSON.parse(read('docs/reviews/ui-baseline.json'));
  const exceptions=JSON.parse(read('tools/animation-changes.json'));
  const decks=nodes.filter(n=>n.tag==='figure' && n.classes.includes('deck'));
  const frames=inventory(html);
  const title=nodes.find(n=>n.tag==='title' && !n.parent?.tag?.includes('svg'));
  if (!title || !new RegExp(`^Ch${id.slice(2)}\\b`).test(textOf(html,title))) fail(`title must begin Ch${id.slice(2)}`);
  if (!nodes.some(n=>n.tag==='article' && n.classes.includes('chapter'))) fail('missing article.chapter');
  if (!nodes.some(n=>n.classes.includes('lang-zh')) || !nodes.some(n=>n.classes.includes('lang-en'))) fail('missing bilingual content');
  if (!nodes.some(n=>n.classes.includes('read-toggle')) || !nodes.some(n=>n.classes.includes('flip'))) fail('missing read toggle/flashcards');
  decks.forEach((d,i)=> {
    const slides=nodes.filter(n=>n.classes.includes('slide') && n.parent === d);
    if (!slides.length) fail(`deck ${i+1} has no slides`);
    for (const [j,s] of slides.entries()) {
      if (nodes.filter(n=>n.tag==='svg' && inside(n,s)).length !== 1) fail(`deck ${i+1} slide ${j+1} needs exactly one SVG`);
      if (!nodes.some(n=>n.tag==='figcaption' && inside(n,s) && textOf(html,n))) fail(`deck ${i+1} slide ${j+1} needs a caption`);
    }
    if (nodes.some(n=>n.classes.includes('slide') && inside(n,d) && n.parent !== d)) fail(`deck ${i+1} slides must be direct children for the player`);
    if (!nodes.some(n=>n.tag==='figcaption' && inside(n,d))) fail(`deck ${i+1} missing caption`);
  });
  const now=new Set(frames.flat()), before=baseline.chapters[id]?.frames.flat() || [];
  if (baseline.chapters[id] && JSON.stringify(frames.map(group => group.filter(x => before.includes(x)))) !== JSON.stringify(baseline.chapters[id].frames)) warnings.push(`${id}: animation grouping/order changed; inspect every changed deck`);
  const missing=before.filter(x=>!now.has(x));
  const old=original[`${id}.html`];
  const reduced=old && (frames.length < old.decks || frames.flat().length < old.slides);
  if (missing.length || reduced) {
    const record=exceptions[id];
    if (!record?.reason || !record?.reviewedBy || !record?.evidence || missing.some(x=>!record.removedFrameIds?.includes(x))) fail(`animation reduction: missing ${missing.join(', ') || 'deck/frame count'}; document reviewed exception in tools/animation-changes.json`);
    else { try { localTarget('index.html',record.evidence); } catch(e) { fail(e.message); } warnings.push(`${id}: reviewed animation change: ${record.reason}`); }
  }
  for (const figure of nodes.filter(n=>n.tag==='figure' && n.classes.includes('static-diagram'))) {
    for (const theme of ['parchment','dracula']) {
      const links=nodes.filter(n=>n.tag==='a' && n.parent===figure && n.attrs['data-diagram-theme']===theme);
      if (links.length !== 1) fail(`static diagram needs one direct link per theme (${theme})`);
      else {
        const img=nodes.find(n=>n.tag==='img' && inside(n,links[0]));
        if (!img || img.attrs.src !== links[0].attrs.href) fail(`static diagram ${theme} image/link must reference the same local SVG`);
        if (!/\.svg$/.test(img?.attrs.src || '')) fail(`static diagram ${theme} needs SVG source`);
      }
    }
    if (!nodes.some(n=>n.tag==='figcaption' && n.parent===figure && textOf(html,n))) fail('static diagram needs a caption');
  }
  const pres=nodes.filter(n=>n.tag==='pre');
  for (const [i,p] of pres.entries()) {
    const code=nodes.find(n=>n.tag==='code' && inside(n,p));
    const language=p.attrs['data-language'] || code?.attrs['data-language'] || (code?.attrs.class || '').match(/(?:^|\s)language-([\w+-]+)/)?.[1];
    const kind=p.attrs['data-kind'] || code?.attrs['data-kind'];
    if (!code || !language || !['pseudocode','teaching','runnable','command','data'].includes(kind)) {
      const signature=hash(html.slice(p.start,p.end));
      if (baseline.chapters[id]?.legacyCode.includes(signature)) warnings.push(`${id}: legacy code ${i+1} lacks language/kind; upgrade during chapter revision`);
      else fail(`code ${i+1} requires <code>, data-language and data-kind=pseudocode|teaching|runnable|command|data`);
    }
  }
  result.stats={decks:decks.length,frames:frames.flat().length,perDeck:frames.map(x=>x.length),staticImages:nodes.filter(n=>n.tag==='img').length,code:pres.length,han:(html.replace(/<svg\b[\s\S]*?<\/svg>/g,'').match(/\p{Script=Han}/gu)||[]).length,zh:nodes.filter(n=>n.classes.includes('lang-zh')).length,en:nodes.filter(n=>n.classes.includes('lang-en')).length};
  return result;
}
