import { useLocale } from "../hooks/useLocale";
import type { LocaleId } from "../lib/locale";

export default function LangToggle() {
  const { locale, setLocale, ui } = useLocale();
  const btn = (active: boolean) =>
    `inline-flex items-center rounded-md px-2 py-1 text-xs transition ${
      active ? "bg-accent/15 font-medium text-accent" : "text-drac-comment hover:text-drac-fg"
    }`;

  const options: { id: LocaleId; label: string; title: string }[] = [
    { id: "zh", label: ui.langZh, title: "中文" },
    { id: "both", label: ui.langBoth, title: "中英对照" },
    { id: "en", label: ui.langEn, title: "English" },
  ];

  return (
    <div
      className="inline-flex items-center rounded-lg border border-border-subtle bg-bg-card p-0.5"
      role="group"
      aria-label={ui.langGroup}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={opt.title}
          aria-pressed={locale === opt.id}
          onClick={() => setLocale(opt.id)}
          className={btn(locale === opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
