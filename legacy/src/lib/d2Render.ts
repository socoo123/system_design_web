import { D2 } from "@terrastruct/d2";
import type { ThemeId } from "./theme";
import { flattenSequenceSvg } from "./flattenSequenceSvg";

/** 浅色 Neutral default；深色 Dark mauve。叶子颜色不靠主题（太淡），见 paintUnclassedLeaves。 */
export const D2_THEME_ID: Record<ThemeId, number> = {
  parchment: 0,
  dracula: 200,
};

/** 双主题都能看清：中等明度填充 + 深描边 + 深字。对照图用 class，流程叶子没标 class 时按此循环。 */
const LEAF_PALETTE = [
  { fill: "#FFE082", stroke: "#F9A825" },
  { fill: "#80DEEA", stroke: "#00838F" },
  { fill: "#A5D6A7", stroke: "#2E7D32" },
  { fill: "#FFCC80", stroke: "#EF6C00" },
  { fill: "#CE93D8", stroke: "#7B1FA2" },
  { fill: "#90CAF9", stroke: "#1565C0" },
] as const;

const D2_CLASSES = `classes: {
  go: {
    style.fill: "#FFE082"
    style.stroke: "#F9A825"
    style.font-color: "#1f1f1f"
  }
  step: {
    style.fill: "#80DEEA"
    style.stroke: "#00838F"
    style.font-color: "#1f1f1f"
  }
  ok: {
    style.fill: "#A5D6A7"
    style.stroke: "#2E7D32"
    style.font-color: "#1f1f1f"
  }
  bad: {
    style.fill: "#EF9A9A"
    style.stroke: "#C62828"
    style.font-color: "#1f1f1f"
  }
  warn: {
    style.fill: "#FFCC80"
    style.stroke: "#EF6C00"
    style.font-color: "#1f1f1f"
  }
  store: {
    style.fill: "#CE93D8"
    style.stroke: "#7B1FA2"
    style.font-color: "#1f1f1f"
  }
  box: {
    style.fill: "#90CAF9"
    style.stroke: "#1565C0"
    style.font-color: "#1f1f1f"
  }
  group: {
    style.fill: "#BBDEFB"
    style.stroke: "#1565C0"
    style.font-color: "#1f1f1f"
  }
  groupOk: {
    style.fill: "#E8F5E9"
    style.stroke: "#2E7D32"
    style.font-color: "#1f1f1f"
  }
  groupBad: {
    style.fill: "#FFEBEE"
    style.stroke: "#C62828"
    style.font-color: "#1f1f1f"
  }
}
`;

function withClasses(source: string): string {
  if (/\bclasses\s*:/.test(source)) return source;
  return `${D2_CLASSES}${source}`;
}

/** 没标 class 的叶子仍是主题 B5/B6（浅色近白、深色近灰）。按黄→青→绿→橙→紫→蓝上色。 */
function paintUnclassedLeaves(svg: string): string {
  let i = 0;
  return svg.replace(
    /<g class="shape"\s*>\s*<rect\b([^>]*?)\/>\s*<\/g>\s*<text\b([^>]*?)>/g,
    (full, rectAttrs: string, textAttrs: string) => {
      if (!/\bfill-B[56]\b/.test(rectAttrs)) return full;
      const p = LEAF_PALETTE[i++ % LEAF_PALETTE.length];
      const rect = rectAttrs
        .replace(/\sclass="[^"]*"/, "")
        .replace(/\sfill="[^"]*"/, ` fill="${p.fill}"`)
        .replace(/\sstroke="[^"]*"/, ` stroke="${p.stroke}"`);
      const text = textAttrs
        .replace(/\sfill="[^"]*"/, ' fill="#1f1f1f"')
        .replace(/\sclass="([^"]*)"/, (_m, cls: string) => {
          const next = cls.replace(/\bfill-N1\b/g, "").replace(/\s+/g, " ").trim();
          return next ? ` class="${next}"` : "";
        });
      return `<g class="shape" ><rect${rect}/></g><text${text}>`;
    },
  );
}

/**
 * D2.js 用单个 WASM worker，内部只有一个 currentResolve。
 * 多张图同时 compile 会把回调盖掉，页面就永远停在「正在绘制架构图…」。
 */
let d2Singleton: D2 | null = null;
let queue: Promise<void> = Promise.resolve();

const svgCache = new Map<string, string>();
const COMPILE_MS = 20_000;
const STORE_PREFIX = "sd-d2-v8:";

function fnv1a(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function persistKey(source: string, theme: ThemeId): string {
  return `${STORE_PREFIX}${theme}:${fnv1a(source)}`;
}

function readPersisted(source: string, theme: ThemeId): string | null {
  try {
    return localStorage.getItem(persistKey(source, theme));
  } catch {
    return null;
  }
}

function writePersisted(source: string, theme: ThemeId, svg: string): void {
  try {
    localStorage.setItem(persistKey(source, theme), svg);
  } catch {
    // quota / 隐私模式：只留内存缓存
  }
}

function getD2(): D2 {
  if (!d2Singleton) d2Singleton = new D2();
  return d2Singleton;
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label}超时（${ms / 1000}s）`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(t);
        reject(err);
      },
    );
  });
}

function cacheKey(source: string, theme: ThemeId): string {
  return `${theme}\n${source}`;
}

/** 时序图、小流程图用 dagre。ELK 在 WASM 里又慢又容易把 worker 卡死。 */
function pickLayout(source: string): "dagre" | "elk" {
  if (/shape:\s*sequence_diagram/.test(source)) return "dagre";
  return "dagre";
}

export function renderD2Svg(source: string, theme: ThemeId): Promise<string> {
  const key = cacheKey(source, theme);
  const hit = svgCache.get(key);
  if (hit) return Promise.resolve(hit);

  const stored = readPersisted(source, theme);
  if (stored) {
    svgCache.set(key, stored);
    return Promise.resolve(stored);
  }

  return enqueue(async () => {
    const cached = svgCache.get(key) ?? readPersisted(source, theme);
    if (cached) {
      svgCache.set(key, cached);
      return cached;
    }

    const d2 = getD2();
    const layout = pickLayout(source);
    const compiled = await withTimeout(
      d2.compile(withClasses(source), { layout }),
      COMPILE_MS,
      "D2 编译",
    );
    const raw = await withTimeout(
      d2.render(compiled.diagram, {
        ...compiled.renderOptions,
        themeID: D2_THEME_ID[theme],
        pad: 8,
        scale: 1,
        sketch: false,
        noXMLTag: true,
        salt: key.slice(0, 48),
      }),
      COMPILE_MS,
      "D2 渲染",
    );
    let svg = paintUnclassedLeaves(raw);
    if (/shape:\s*sequence_diagram/.test(source)) {
      svg = flattenSequenceSvg(svg);
    }
    svgCache.set(key, svg);
    writePersisted(source, theme, svg);
    return svg;
  });
}
