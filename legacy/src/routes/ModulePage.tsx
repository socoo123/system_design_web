import { Link, useParams } from "react-router-dom";
import {
  chapterContentExists,
  getModule,
  localizedChapterTitle,
  localizedModuleSubtitle,
  localizedModuleTitle,
} from "../data/curriculum";
import type { ChapterSummary } from "../types";
import KindBadge from "../components/KindBadge";
import ProgressBar from "../components/ProgressBar";
import { useLearnerProgress } from "../hooks/useLearnerProgress";
import { useLocale } from "../hooks/useLocale";

export default function ModulePage() {
  const { moduleId } = useParams();
  const module = moduleId ? getModule(moduleId) : undefined;
  const { moduleDone, isComplete, toggleComplete } = useLearnerProgress();
  const { locale, ui } = useLocale();

  if (!module) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-card p-8 text-center text-drac-comment">
        {ui.moduleMissing}{" "}
        <Link to="/" className="text-accent">
          {ui.backHome}
        </Link>
      </div>
    );
  }

  const { done, total } = moduleDone(module.id);

  return (
    <div className="space-y-6">
      <nav className="text-sm text-drac-comment">
        <Link to="/" className="hover:text-drac-fg">
          {ui.map}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-drac-fg">{localizedModuleTitle(module, locale)}</span>
      </nav>

      <header className="border-b border-border-subtle pb-5">
        <h1 className="text-2xl font-bold text-drac-fg">{localizedModuleTitle(module, locale)}</h1>
        <p className="mt-1 text-drac-comment">{localizedModuleSubtitle(module, locale)}</p>
        {total > 0 && (
          <div className="mt-4 max-w-md">
            <ProgressBar value={done} max={total} label={ui.moduleProgress} />
          </div>
        )}
      </header>

      <div className="space-y-2">
        {module.chapters.map((ch) => {
          const ready = chapterContentExists(ch.id);
          const learned = isComplete(ch.id);
          return (
            <div
              key={ch.id}
              className={`flex items-center gap-3 rounded-lg border bg-bg-card p-3 transition ${
                ready ? "hover:border-accent/50 hover:bg-bg-elev" : "opacity-70"
              } ${learned ? "border-drac-green/30" : "border-border-subtle"}`}
            >
              <button
                type="button"
                title={learned ? ui.unmarkDone : ui.markDone}
                aria-pressed={learned}
                disabled={!ready}
                onClick={() => toggleComplete(ch.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm transition ${
                  learned
                    ? "border-drac-green/50 bg-drac-green/15 text-drac-green"
                    : "border-border-subtle bg-bg-elev text-drac-comment hover:border-drac-green/40 hover:text-drac-green"
                } disabled:cursor-not-allowed disabled:hover:border-border-subtle disabled:hover:text-drac-comment`}
              >
                {learned ? "✓" : ""}
              </button>
              {ready ? (
                <Link
                  to={`/m/${module.id}/${ch.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-4 py-1"
                >
                  <ChapterRowBody ch={ch} ready learned={learned} />
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-4 py-1">
                  <ChapterRowBody ch={ch} ready={false} learned={false} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChapterRowBody({
  ch,
  ready,
  learned,
}: {
  ch: ChapterSummary;
  ready: boolean;
  learned: boolean;
}) {
  const { locale, ui } = useLocale();
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elev font-mono text-sm font-semibold text-drac-comment group-hover:text-accent">
        {ch.num}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-drac-fg">{localizedChapterTitle(ch, locale)}</div>
        {!ready && <div className="text-xs text-drac-comment">{ui.contentPending}</div>}
        {ready && learned && <div className="text-xs text-drac-green">{ui.learned}</div>}
      </div>
      <KindBadge kind={ch.kind} />
      {ready && (
        <span className="text-border-strong transition group-hover:translate-x-0.5 group-hover:text-accent">
          →
        </span>
      )}
    </>
  );
}
