export default function ProgressBar({
  value,
  max,
  size = "md",
  label,
}: {
  value: number;
  max: number;
  size?: "sm" | "md";
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const barH = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-drac-comment">{label}</span>
          <span className="font-mono text-drac-fg">
            {value}/{max} · {pct}%
          </span>
        </div>
      )}
      <div
        className={`${barH} overflow-hidden rounded-full bg-bg-elev`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="h-full rounded-full bg-drac-green transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
