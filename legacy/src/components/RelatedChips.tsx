import { Link } from "react-router-dom";
import { chapterHref, findChapterLocation, localizedChapterTitle } from "../data/curriculum";
import { useLocale } from "../hooks/useLocale";

export default function RelatedChips({ ids }: { ids: string[] }) {
  const { locale, ui } = useLocale();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return null;

  const locs = unique
    .map((id) => findChapterLocation(id))
    .filter((loc): loc is NonNullable<typeof loc> => Boolean(loc));
  const allFoundation = locs.length > 0 && locs.every((loc) => loc.chapter.kind === "foundation");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-drac-comment">{allFoundation ? ui.relatedM6 : ui.related}</span>
      {unique.map((id) => {
        const loc = findChapterLocation(id);
        const href = chapterHref(id);
        if (!loc || !href) return null;
        return (
          <Link
            key={id}
            to={href}
            className="rounded-full border border-border-subtle bg-bg-elev px-2.5 py-0.5 text-xs text-drac-fg hover:border-accent/50 hover:text-accent"
          >
            Ch{loc.chapter.num} · {localizedChapterTitle(loc.chapter, locale)}
          </Link>
        );
      })}
    </div>
  );
}
