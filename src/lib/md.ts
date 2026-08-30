/** Pull fenced D2 blocks out so the English column in 对照 mode does not repeat diagrams. */
export function stripD2(md: string): string {
  return md.replace(/```d2\n[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractD2Blocks(md: string): string[] {
  return [...md.matchAll(/```d2\n([\s\S]*?)```/g)].map((m) => m[1]);
}

export function d2BlocksMatch(zh: string, en: string): boolean {
  const a = extractD2Blocks(zh);
  const b = extractD2Blocks(en);
  if (a.length !== b.length) return false;
  return a.every((block, i) => block === b[i]);
}
