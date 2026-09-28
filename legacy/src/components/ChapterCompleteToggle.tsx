import { useLearnerProgress } from "../hooks/useLearnerProgress";
import { useLocale } from "../hooks/useLocale";

export default function ChapterCompleteToggle({ chapterId }: { chapterId: string }) {
  const { isComplete, toggleComplete } = useLearnerProgress();
  const { ui } = useLocale();
  const done = isComplete(chapterId);

  return (
    <div
      className={`rounded-xl border p-5 transition ${
        done ? "border-drac-green/40 bg-drac-green/10" : "border-border-subtle bg-bg-card"
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={() => toggleComplete(chapterId)}
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer rounded border-border-strong accent-drac-green"
        />
        <span>
          <span className="block text-base font-semibold text-drac-fg">
            {done ? ui.completeTitleDone : ui.completeTitle}
          </span>
          <span className="mt-1 block text-sm text-drac-comment">
            {done ? ui.completeHintDone : ui.completeHint}
          </span>
          <span className="mt-1 block text-xs text-drac-comment">{ui.completeLocal}</span>
        </span>
      </label>
    </div>
  );
}
