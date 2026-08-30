/** D2 时序图每条消息约 90px 行距。参与者不动；消息行贴到更近，标签相对箭头的偏移保持不变。 */
const SEQ_GAP_FIRST = 36;
const SEQ_GAP = 44;

const PATH_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const PATH_Y_SLOTS: Record<string, number[]> = {
  M: [1],
  L: [1],
  C: [1, 3, 5],
  S: [1, 3],
  Q: [1, 3],
  T: [1],
  A: [6],
  V: [0],
  H: [],
};

function fmt(n: number): string {
  return n.toFixed(6);
}

function detectHinge(svg: string): number | null {
  const rects = [...svg.matchAll(/<rect\b([^>]*)>/g)]
    .map((m) => {
      const y = Number((m[1].match(/\by="([-\d.]+)"/) || [])[1]);
      const w = Number((m[1].match(/\bwidth="([-\d.]+)"/) || [])[1]);
      const h = Number((m[1].match(/\bheight="([-\d.]+)"/) || [])[1]);
      return { y, w, h };
    })
    .filter((r) => Number.isFinite(r.y) && r.h > 20 && r.h < 120 && r.w > 40 && r.w < 220);
  if (rects.length < 2) return null;
  const minY = Math.min(...rects.map((r) => r.y));
  const topRow = rects.filter((r) => Math.abs(r.y - minY) < 8);
  return Math.max(...topRow.map((r) => r.y + r.h));
}

function tokenizePath(d: string): string[] {
  return d
    .replace(/([MLHVCSQTAZ])/gi, " $1 ")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}

function detectMessageRanks(svg: string, hinge: number): number[] {
  const ranks = new Set<number>();
  for (const m of svg.matchAll(/\bd="([^"]+)"/g)) {
    const parts = tokenizePath(m[1]);
    for (let i = 0; i < parts.length - 5; i++) {
      if (!/^M$/i.test(parts[i]) || !/^L$/i.test(parts[i + 3])) continue;
      const x1 = Number(parts[i + 1]);
      const y1 = Number(parts[i + 2]);
      const x2 = Number(parts[i + 4]);
      const y2 = Number(parts[i + 5]);
      if (
        Number.isFinite(x1) &&
        Number.isFinite(y1) &&
        Number.isFinite(x2) &&
        Number.isFinite(y2) &&
        Math.abs(y1 - y2) < 0.5 &&
        Math.abs(x1 - x2) > 20 &&
        y1 > hinge + 10
      ) {
        ranks.add(Math.round(y1));
      }
    }
  }
  return [...ranks].sort((a, b) => a - b);
}

function makeMapY(hinge: number, ranks: number[]): (y: number) => number {
  const controls = [{ from: hinge, to: hinge }];
  for (let i = 0; i < ranks.length; i++) {
    controls.push({ from: ranks[i], to: hinge + SEQ_GAP_FIRST + i * SEQ_GAP });
  }
  return (y: number) => {
    if (y <= hinge) return y;
    let nearest = controls[0];
    for (const c of controls) {
      if (Math.abs(c.from - y) < Math.abs(nearest.from - y)) nearest = c;
    }
    return nearest.to + (y - nearest.from);
  };
}

function mapPathD(d: string, mapY: (y: number) => number): string {
  const tokens = tokenizePath(d);
  const out: string[] = [];
  let cmd = "";
  let argi = 0;
  for (const tok of tokens) {
    if (/^[MLHVCSQTAZ]$/i.test(tok)) {
      cmd = tok.toUpperCase();
      argi = 0;
      out.push(tok);
      continue;
    }
    const n = Number(tok);
    if (!Number.isFinite(n)) {
      out.push(tok);
      continue;
    }
    const ar = PATH_ARITY[cmd] ?? 2;
    const slots = PATH_Y_SLOTS[cmd] ?? [];
    const slot = ar === 0 ? 0 : argi % ar;
    out.push(slots.includes(slot) ? fmt(mapY(n)) : tok);
    argi++;
  }
  return out.join(" ");
}

export function flattenSequenceSvg(svg: string): string {
  const hinge = detectHinge(svg);
  if (hinge == null) return svg;
  const ranks = detectMessageRanks(svg, hinge);
  if (ranks.length < 2) return svg;
  const mapY = makeMapY(hinge, ranks);

  let out = svg.replace(/\bd="([^"]*)"/g, (_m, d: string) => `d="${mapPathD(d, mapY)}"`);

  out = out.replace(/<rect\b([^>]*)>/g, (full, attrs: string) => {
    const yM = attrs.match(/\by="([-\d.]+)"/);
    const hM = attrs.match(/\bheight="([-\d.]+)"/);
    if (!yM || !hM) return full;
    const y0 = Number(yM[1]);
    const h0 = Number(hM[1]);
    const y1 = mapY(y0);
    const h1 = mapY(y0 + h0) - y1;
    const next = attrs
      .replace(/\by="[-\d.]+"/, `y="${fmt(y1)}"`)
      .replace(/\bheight="[-\d.]+"/, `height="${fmt(h1)}"`);
    return `<rect${next}>`;
  });

  out = out.replace(/<text\b([^>]*)>/g, (full, attrs: string) => {
    const yM = attrs.match(/\by="([-\d.]+)"/);
    if (!yM) return full;
    const next = attrs.replace(/\by="[-\d.]+"/, `y="${fmt(mapY(Number(yM[1])))}"`);
    return `<text${next}>`;
  });

  out = out.replace(/\bviewBox="([^"]+)"/g, (_m, vb: string) => {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return _m;
    const [vx, vy, vw, vh] = p;
    return `viewBox="${fmt(vx)} ${fmt(mapY(vy))} ${fmt(vw)} ${fmt(mapY(vy + vh) - mapY(vy))}"`;
  });

  out = out.replace(/<svg\b([^>]*)>/g, (full, attrs: string) => {
    const vb = attrs.match(/\bviewBox="([^"]+)"/);
    if (!vb) return full;
    const p = vb[1].trim().split(/[\s,]+/).map(Number);
    if (p.length !== 4) return full;
    const next = attrs.replace(/\bheight="[-\d.]+"/, `height="${fmt(p[3])}"`);
    return `<svg${next}>`;
  });

  return out;
}
