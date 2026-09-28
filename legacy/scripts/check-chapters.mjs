import fs from "node:fs";
import { D2 } from "@terrastruct/d2";

function assemble(ch) {
  const chunks = [`# Ch${ch.num} · ${ch.title}`];
  for (const s of ch.sections) {
    chunks.push(s.heading ? `## ${s.heading}\n\n${s.body}` : s.body);
  }
  return chunks.join("\n\n");
}

const ids = process.argv.slice(2);
const d2 = new D2();
let fail = 0;

for (const id of ids) {
  const ch = JSON.parse(fs.readFileSync(`src/content/chapters/${id}.json`, "utf8"));
  const d2Blocks = [...ch.tutorialMd.matchAll(/```d2\n([\s\S]*?)```/g)].map((m) => m[1]);
  console.log("\n==", id, ch.title, ch.kind);
  console.log("H1", ch.tutorialMd.split("\n")[0]);
  console.log("sections", ch.sections.length);
  console.log("d2", d2Blocks.length);
  if (ch.tutorialMd !== assemble(ch)) {
    console.log("WARN tutorialMd != assembled");
    fail++;
  }
  if (ch.titleEn) {
    for (const s of ch.sections) {
      const zhN = [...s.body.matchAll(/```d2\n([\s\S]*?)```/g)].length;
      const enN = [...(s.bodyEn || "").matchAll(/```d2\n([\s\S]*?)```/g)].length;
      if (!s.bodyEn) {
        console.log("  FAIL missing bodyEn", s.id);
        fail++;
        continue;
      }
      if (zhN !== enN) {
        console.log("  FAIL D2 count", s.id, "zh", zhN, "en", enN);
        fail++;
      } else {
        const zhB = [...s.body.matchAll(/```d2\n([\s\S]*?)```/g)].map((m) => m[1]);
        const enB = [...s.bodyEn.matchAll(/```d2\n([\s\S]*?)```/g)].map((m) => m[1]);
        for (let i = 0; i < zhB.length; i++) {
          if (zhB[i] !== enB[i]) {
            console.log("  FAIL D2 text changed", s.id, i);
            fail++;
          }
        }
      }
    }
    if (!ch.reviewMdEn) {
      console.log("  FAIL missing reviewMdEn");
      fail++;
    }
    console.log("EN", ch.titleEn);
  }
  for (let i = 0; i < d2Blocks.length; i++) {
    try {
      const compiled = await d2.compile(d2Blocks[i], { layout: "dagre" });
      const svg = await d2.render(compiled.diagram, {
        themeID: 0,
        pad: 8,
        scale: 1,
        noXMLTag: true,
      });
      const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || "?";
      const parts = vb.split(/\s+/).map(Number);
      const w = parts[2];
      const h = parts[3];
      const flag = w > 1800 || h > 1400 ? " WIDE/TALL" : "";
      console.log("  ok", i, "viewBox", vb, flag);
    } catch (e) {
      fail++;
      console.log("  FAIL", i, e?.message || e);
    }
  }
}

console.log("\nFAIL", fail);
process.exit(fail ? 1 : 0);
