import ModuleCard from "../components/ModuleCard";
import ProgressBar from "../components/ProgressBar";
import { modules } from "../data/curriculum";
import { useLearnerProgress } from "../hooks/useLearnerProgress";
import { useLocale } from "../hooks/useLocale";

export default function Home() {
  const available = modules.filter((m) => m.available).length;
  const { completedCount, totalChapters } = useLearnerProgress();
  const { ui } = useLocale();

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-border-subtle bg-gradient-to-b from-bg-card to-bg-base p-8 sm:p-12">
        <div className="absolute right-6 top-6 select-none font-mono text-6xl opacity-10">{ui.siteShort}</div>
        <p className="text-sm font-medium text-accent">{ui.homeKicker}</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight text-drac-fg sm:text-4xl">
          {ui.homeTitle}
          <span className="text-accent">{ui.homeTitleAccent}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-drac-comment">{ui.homeLead}</p>
        <div className="mt-6 flex flex-wrap gap-6 text-sm">
          <Stat label={ui.statModules} value={`${available} / ${modules.length}`} />
          <Stat label={ui.statLearned} value={`${completedCount} / ${totalChapters}`} />
          <Stat label={ui.statDiagrams} value={ui.statDiagramsValue} />
        </div>
        <div className="mt-6 max-w-xl">
          <ProgressBar value={completedCount} max={totalChapters} label={ui.totalProgress} />
          <p className="mt-2 text-xs text-drac-comment">{ui.progressHint}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-drac-fg">{ui.firstPathTitle}</h2>
        <p className="mb-4 text-sm text-drac-comment">{ui.firstPathLead}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m, i) => (
            <ModuleCard key={m.id} module={m} index={i} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-drac-fg">{ui.howTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Step n="1" title={ui.step1Title} desc={ui.step1Desc} />
          <Step n="2" title={ui.step2Title} desc={ui.step2Desc} />
          <Step n="3" title={ui.step3Title} desc={ui.step3Desc} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-bold text-drac-fg">{value}</div>
      <div className="text-xs text-drac-comment">{label}</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
        {n}
      </div>
      <h3 className="mt-3 font-semibold text-drac-fg">{title}</h3>
      <p className="mt-1 text-sm text-drac-comment">{desc}</p>
    </div>
  );
}
