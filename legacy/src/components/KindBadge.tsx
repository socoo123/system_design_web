import type { ChapterKind } from "../types";
import { useLocale } from "../hooks/useLocale";

const KIND_CLS: Record<ChapterKind, string> = {
  foundation: "border-drac-cyan/30 bg-drac-cyan/10 text-drac-cyan",
  method: "border-drac-purple/30 bg-drac-purple/10 text-drac-purple",
  brick: "border-drac-orange/30 bg-drac-orange/10 text-drac-orange",
  case: "border-drac-pink/30 bg-drac-pink/10 text-drac-pink",
  ai: "border-accent/30 bg-accent/10 text-accent",
};

export default function KindBadge({ kind }: { kind: ChapterKind }) {
  const { ui } = useLocale();
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${KIND_CLS[kind]}`}>
      {ui.kind[kind]}
    </span>
  );
}
