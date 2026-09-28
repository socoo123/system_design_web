import fs from "node:fs";
import path from "node:path";

const D2_SPLIT = /```d2\n[\s\S]*?```/;

export function extractD2Blocks(md) {
  return [...md.matchAll(/```d2\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** Keep English prose; replace every D2 fence with the Chinese source, in order. */
export function forceD2FromSource(zhBody, enBody) {
  const zhBlocks = extractD2Blocks(zhBody);
  const enParts = enBody.split(D2_SPLIT);
  if (enParts.length !== zhBlocks.length + 1) {
    throw new Error(
      `D2 count mismatch: Chinese has ${zhBlocks.length}, English has ${enParts.length - 1}`,
    );
  }
  let out = enParts[0];
  for (let i = 0; i < zhBlocks.length; i++) {
    out += "```d2\n" + zhBlocks[i] + "```" + enParts[i + 1];
  }
  return out;
}

export function assembleTutorialMdEn(ch) {
  const title = ch.titleEn ?? ch.title;
  const chunks = [`# Ch${ch.num} · ${title}`];
  for (const s of ch.sections) {
    const heading = s.headingEn ?? s.heading;
    const body = s.bodyEn ?? s.body;
    chunks.push(heading ? `## ${heading}\n\n${body}` : body);
  }
  return chunks.join("\n\n");
}

/**
 * Patch English fields onto an existing chapter JSON.
 * Never rewrites Chinese title / body / reviewMd / related.
 *
 * @param {{
 *   id: string,
 *   titleEn: string,
 *   reviewMdEn: string,
 *   sections: { id: string, headingEn: string, bodyEn: string }[],
 * }} payload
 */
export function writeChapterEn(payload) {
  const dest = path.join("src/content/chapters", `${payload.id}.json`);
  const ch = JSON.parse(fs.readFileSync(dest, "utf8"));
  const incoming = new Map(payload.sections.map((s) => [s.id, s]));

  for (const s of ch.sections) {
    const en = incoming.get(s.id);
    if (!en) {
      throw new Error(`${payload.id}: missing English for section "${s.id}"`);
    }
    s.headingEn = s.heading.trim() ? en.headingEn ?? "" : "";
    s.bodyEn = forceD2FromSource(s.body, en.bodyEn);
  }

  const extra = [...incoming.keys()].filter((id) => !ch.sections.some((s) => s.id === id));
  if (extra.length) {
    throw new Error(`${payload.id}: unknown section ids: ${extra.join(", ")}`);
  }

  ch.titleEn = payload.titleEn;
  ch.reviewMdEn = payload.reviewMdEn;

  fs.writeFileSync(dest, JSON.stringify(ch, null, 2) + "\n");
  console.log("wrote EN", dest, ch.sections.length, "sections");
}
