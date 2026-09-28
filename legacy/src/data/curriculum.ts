import indexData from "../content/index.json";
import type { Chapter, ChapterSummary, CurriculumIndex, Module } from "../types";
import { uiLocale, type LocaleId } from "../lib/locale";

const index = indexData as CurriculumIndex;

export const modules: Module[] = index.modules;

const chapterLoaders = import.meta.glob("../content/chapters/*.json") as Record<
  string,
  () => Promise<{ default: Chapter }>
>;

const chapterCache = new Map<string, Chapter>();

export function getModule(moduleId: string): Module | undefined {
  return modules.find((m) => m.id === moduleId);
}

export function getChapterSummary(moduleId: string, chapterId: string): ChapterSummary | undefined {
  return getModule(moduleId)?.chapters.find((c) => c.id === chapterId);
}

export function findChapterLocation(chapterId: string): { module: Module; chapter: ChapterSummary } | undefined {
  for (const mod of modules) {
    const chapter = mod.chapters.find((c) => c.id === chapterId);
    if (chapter) return { module: mod, chapter };
  }
  return undefined;
}

export function chapterHref(chapterId: string): string | undefined {
  const loc = findChapterLocation(chapterId);
  if (!loc) return undefined;
  return `/m/${loc.module.id}/${loc.chapter.id}`;
}

export function chapterContentExists(chapterId: string): boolean {
  return Boolean(chapterLoaders[`../content/chapters/${chapterId}.json`]);
}

export function localizedChapterTitle(ch: Pick<ChapterSummary, "title" | "titleEn">, locale: LocaleId): string {
  const lang = uiLocale(locale);
  if (lang === "en" && ch.titleEn) return ch.titleEn;
  return ch.title;
}

export function localizedModuleTitle(mod: Pick<Module, "title" | "titleEn">, locale: LocaleId): string {
  const lang = uiLocale(locale);
  if (lang === "en" && mod.titleEn) return mod.titleEn;
  return mod.title;
}

export function localizedModuleSubtitle(mod: Pick<Module, "subtitle" | "subtitleEn">, locale: LocaleId): string {
  const lang = uiLocale(locale);
  if (lang === "en" && mod.subtitleEn) return mod.subtitleEn;
  return mod.subtitle;
}

export async function loadChapter(chapterId: string): Promise<Chapter | undefined> {
  const cached = chapterCache.get(chapterId);
  if (cached) return cached;

  const key = `../content/chapters/${chapterId}.json`;
  const loader = chapterLoaders[key];
  if (!loader) return undefined;

  const mod = await loader();
  const chapter = mod.default;
  chapterCache.set(chapterId, chapter);
  return chapter;
}
