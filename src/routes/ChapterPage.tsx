import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getChapterSummary,
  getModule,
  loadChapter,
  localizedModuleTitle,
} from "../data/curriculum";
import { chapterHasEnglish, type Chapter, type Section } from "../types";
import MarkdownView from "../components/MarkdownView";
import KindBadge from "../components/KindBadge";
import Flashcards from "../components/Flashcards";
import ChapterCompleteToggle from "../components/ChapterCompleteToggle";
import RelatedChips from "../components/RelatedChips";
import ChapterToc from "../components/ChapterToc";
import { useLocale } from "../hooks/useLocale";
import { stripD2 } from "../lib/md";

export default function ChapterPage() {
  const { moduleId, chapterId } = useParams();
  const module = moduleId ? getModule(moduleId) : undefined;
  const summary = moduleId && chapterId ? getChapterSummary(moduleId, chapterId) : undefined;
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"missing" | "fail" | null>(null);
  const { locale, ui } = useLocale();

  useEffect(() => {
    let cancelled = false;
    setChapter(null);
    setLoadError(null);

    if (!summary || !chapterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    loadChapter(chapterId)
      .then((ch) => {
        if (cancelled) return;
        if (!ch) {
          setLoadError("missing");
          return;
        }
        setChapter(ch);
      })
      .catch(() => {
        if (!cancelled) setLoadError("fail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapterId, summary]);

  if (!module || !summary) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-card p-8 text-center text-drac-comment">
        {ui.chapterMissing}{" "}
        <Link to="/" className="text-accent">
          {ui.backHome}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-card p-8 text-center text-drac-comment">
        {ui.loadingChapter}
      </div>
    );
  }

  if (loadError || !chapter) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-card p-8 text-center text-drac-comment">
        {loadError === "missing" ? ui.chapterNotGenerated : ui.chapterLoadFail}{" "}
        <Link to={`/m/${module.id}`} className="text-accent">
          {ui.backModule}
        </Link>
      </div>
    );
  }

  const introRelated = chapter.relatedChapters ?? [];
  const showToc = chapter.sections.filter((s) => s.heading.trim()).length >= 3;
  const hasEn = chapterHasEnglish(chapter);
  const wantEn = locale === "en" || locale === "both";
  const showBanner = wantEn && !hasEn;
  const mode = !hasEn ? "zh" : locale;
  const title =
    mode === "en" ? (chapter.titleEn ?? chapter.title) : chapter.title;
  const titleEnLine = mode === "both" && chapter.titleEn ? chapter.titleEn : null;
  const reviewMd =
    mode === "en" && chapter.reviewMdEn ? chapter.reviewMdEn : chapter.reviewMd;

  return (
    <div
      className={
        showToc ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10" : undefined
      }
    >
      {showToc && <ChapterToc sections={chapter.sections} />}
      <div className="min-w-0 space-y-8">
        <nav className="text-sm text-drac-comment">
          <Link to="/" className="hover:text-drac-fg">
            {ui.map}
          </Link>
          <span className="mx-2">/</span>
          <Link to={`/m/${module.id}`} className="hover:text-drac-fg">
            {localizedModuleTitle(module, locale)}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-drac-fg">Ch{chapter.num}</span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-5">
          <div>
            <div className="font-mono text-sm text-accent">{ui.lesson(chapter.num)}</div>
            <h1 className="mt-1 text-2xl font-bold text-drac-fg">{title}</h1>
            {titleEnLine && (
              <p className="mt-1 text-base font-medium text-drac-comment">{titleEnLine}</p>
            )}
            {introRelated.length > 0 && <RelatedChips ids={introRelated} />}
          </div>
          <KindBadge kind={chapter.kind} />
        </header>

        {showBanner && (
          <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-drac-fg">
            {ui.enPendingBanner}
          </div>
        )}

        {chapter.interleaved ? (
          <div className="space-y-8">
            {chapter.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <SectionBody section={s} mode={mode} />
                <RelatedChips ids={s.related ?? []} />
              </section>
            ))}
          </div>
        ) : (
          <MarkdownView>{chapter.tutorialMd}</MarkdownView>
        )}

        {reviewMd.trim() && (
          <details className="group rounded-lg border border-border-subtle bg-bg-card p-5">
            <summary className="cursor-pointer list-none text-lg font-semibold text-drac-fg">
              {ui.flashcards}{" "}
              <span className="ml-2 text-xs font-normal text-drac-comment group-open:hidden">
                {ui.flashcardsHint}
              </span>
            </summary>
            <div className="mt-4">
              {mode === "both" && chapter.reviewMdEn ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-drac-comment">
                      {ui.bilingualZh}
                    </div>
                    <Flashcards reviewMd={chapter.reviewMd} />
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-drac-comment">
                      {ui.bilingualEn}
                    </div>
                    <Flashcards reviewMd={chapter.reviewMdEn} />
                  </div>
                </div>
              ) : (
                <Flashcards reviewMd={reviewMd} />
              )}
            </div>
          </details>
        )}

        <ChapterCompleteToggle chapterId={chapter.id} />
      </div>
    </div>
  );
}

function SectionBody({ section, mode }: { section: Section; mode: "zh" | "en" | "both" }) {
  const { ui } = useLocale();
  const zhMd = (section.heading ? `## ${section.heading}\n\n` : "") + section.body;
  const enHeading = section.headingEn || section.heading;
  const enBody = section.bodyEn || section.body;
  const enMd = (enHeading ? `## ${enHeading}\n\n` : "") + enBody;

  if (mode === "en") {
    return <MarkdownView>{enMd}</MarkdownView>;
  }

  if (mode === "both" && section.bodyEn) {
    return (
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-drac-comment">
            {ui.bilingualZh}
          </div>
          <MarkdownView>{zhMd}</MarkdownView>
        </div>
        <div className="min-w-0 lg:border-l lg:border-border-subtle lg:pl-6">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-drac-comment">
            {ui.bilingualEn}
          </div>
          <MarkdownView>{stripD2(enMd)}</MarkdownView>
        </div>
      </div>
    );
  }

  return <MarkdownView>{zhMd}</MarkdownView>;
}
