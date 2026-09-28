import { Routes, Route, Link, NavLink } from "react-router-dom";
import Home from "./routes/Home";
import ModulePage from "./routes/ModulePage";
import ChapterPage from "./routes/ChapterPage";
import { useTheme } from "./hooks/useTheme";
import { useLocale } from "./hooks/useLocale";
import { useLearnerProgress } from "./hooks/useLearnerProgress";
import ProgressBar from "./components/ProgressBar";
import LangToggle from "./components/LangToggle";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { ui } = useLocale();
  const btn = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
      active ? "bg-accent/15 font-medium text-accent" : "text-drac-comment hover:text-drac-fg"
    }`;
  return (
    <div
      className="inline-flex items-center rounded-lg border border-border-subtle bg-bg-card p-0.5"
      role="group"
      aria-label={ui.themeGroup}
    >
      <button
        type="button"
        title="护眼米色"
        aria-pressed={theme === "parchment"}
        onClick={() => setTheme("parchment")}
        className={btn(theme === "parchment")}
      >
        ☀️<span className="hidden sm:inline">{ui.themeParchment}</span>
      </button>
      <button
        type="button"
        title="德古拉深色"
        aria-pressed={theme === "dracula"}
        onClick={() => setTheme("dracula")}
        className={btn(theme === "dracula")}
      >
        🌙<span className="hidden sm:inline">{ui.themeDracula}</span>
      </button>
    </div>
  );
}

export default function App() {
  const { ui } = useLocale();
  return (
    <div className="min-h-screen bg-bg-base text-drac-fg">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-3 px-6 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-drac-fg">
            <span className="text-accent">{ui.siteShort}</span>
            <span>{ui.siteName}</span>
          </Link>
          <HeaderProgress />
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 ${isActive ? "bg-bg-elev text-drac-fg" : "text-drac-comment hover:text-drac-fg"}`
              }
            >
              {ui.map}
            </NavLink>
            <LangToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-6 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/m/:moduleId" element={<ModulePage />} />
          <Route path="/m/:moduleId/:chapterId" element={<ChapterPage />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-[90rem] px-6 py-10 text-center text-xs text-drac-comment">
        {ui.footer}
      </footer>
    </div>
  );
}

function HeaderProgress() {
  const { completedCount, totalChapters } = useLearnerProgress();
  const { ui } = useLocale();
  if (totalChapters <= 0) return null;
  return (
    <Link
      to="/"
      className="hidden min-w-0 max-w-[14rem] flex-1 sm:block"
      title={ui.progressTitle(completedCount, totalChapters)}
    >
      <div className="mb-1 font-mono text-[11px] text-drac-comment">
        {ui.progress(completedCount, totalChapters)}
      </div>
      <ProgressBar value={completedCount} max={totalChapters} size="sm" />
    </Link>
  );
}
