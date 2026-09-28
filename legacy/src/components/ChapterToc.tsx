import type { Section } from "../types";
import { useLocale } from "../hooks/useLocale";
import { uiLocale } from "../lib/locale";

export default function ChapterToc({ sections }: { sections: Section[] }) {
  const { locale, ui } = useLocale();
  const lang = uiLocale(locale);
  const items = sections.filter((s) => s.heading.trim());
  if (items.length < 3) return null;

  return (
    <nav
      aria-label={ui.toc}
      className="hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-drac-comment">{ui.toc}</div>
      <ol className="mt-3 space-y-1.5 border-r border-border-subtle pr-3 text-sm">
        {items.map((s) => {
          const heading =
            lang === "en" && s.headingEn?.trim() ? s.headingEn : s.heading;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block leading-snug text-drac-comment hover:text-accent"
              >
                {heading.replace(/^#+\s*/, "")}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
