import fs from "node:fs";
import path from "node:path";

export function assembleTutorialMd(ch) {
  const chunks = [`# Ch${ch.num} · ${ch.title}`];
  for (const s of ch.sections) {
    chunks.push(s.heading ? `## ${s.heading}\n\n${s.body}` : s.body);
  }
  return chunks.join("\n\n");
}

function readExisting(dest) {
  try {
    return JSON.parse(fs.readFileSync(dest, "utf8"));
  } catch {
    return null;
  }
}

function mergeEnglish(sections, prev) {
  if (!prev?.sections) return sections;
  const byId = new Map(prev.sections.map((s) => [s.id, s]));
  return sections.map((s) => {
    const old = byId.get(s.id);
    if (!old) return s;
    return {
      ...s,
      headingEn: s.headingEn ?? old.headingEn,
      bodyEn: s.bodyEn ?? old.bodyEn,
    };
  });
}

export function writeChapter(ch) {
  const dest = path.join("src/content/chapters", `${ch.id}.json`);
  const prev = readExisting(dest);
  const sections = mergeEnglish(ch.sections, prev);
  const out = {
    id: ch.id,
    num: ch.num,
    title: ch.title,
    kind: ch.kind,
    interleaved: true,
    relatedChapters: ch.relatedChapters ?? [],
    sections,
    reviewMd: ch.reviewMd,
    tutorialMd: assembleTutorialMd({ ...ch, sections }),
  };
  const titleEn = ch.titleEn ?? prev?.titleEn;
  const reviewMdEn = ch.reviewMdEn ?? prev?.reviewMdEn;
  if (titleEn) out.titleEn = titleEn;
  if (reviewMdEn) out.reviewMdEn = reviewMdEn;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  console.log("wrote", dest);
}
