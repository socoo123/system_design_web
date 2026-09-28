export type ChapterKind = "foundation" | "method" | "brick" | "case" | "ai";

export interface Section {
  id: string;
  heading: string;
  secNum: string | null;
  body: string;
  related: string[];
  headingEn?: string;
  bodyEn?: string;
}

export interface ChapterSummary {
  id: string;
  num: string;
  title: string;
  titleEn?: string;
  kind: ChapterKind;
}

export interface Chapter extends ChapterSummary {
  tutorialMd: string;
  reviewMd: string;
  reviewMdEn?: string;
  interleaved: boolean;
  sections: Section[];
  relatedChapters: string[];
}

export interface Module {
  id: string;
  title: string;
  titleEn?: string;
  subtitle: string;
  subtitleEn?: string;
  dir: string;
  available: boolean;
  chapters: ChapterSummary[];
}

export interface CurriculumIndex {
  modules: Module[];
}

export function chapterHasEnglish(ch: Pick<Chapter, "titleEn" | "sections" | "reviewMdEn">): boolean {
  if (!ch.titleEn?.trim()) return false;
  if (!ch.reviewMdEn?.trim()) return false;
  return ch.sections.every((s) => {
    const headingOk = !s.heading.trim() || Boolean(s.headingEn?.trim());
    const bodyOk = Boolean(s.bodyEn?.trim());
    return headingOk && bodyOk;
  });
}
