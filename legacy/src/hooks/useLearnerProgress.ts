import { useCallback, useMemo, useSyncExternalStore } from "react";
import { modules } from "../data/curriculum";
import {
  getProgressSnapshot,
  subscribeProgress,
  toggleChapterComplete,
  setChapterComplete,
  isComplete as isChapterComplete,
} from "../lib/learnerState";

export function useLearnerProgress() {
  const snap = useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressSnapshot);

  const completedSet = useMemo(
    () => new Set(snap.state.completedChapters),
    [snap.state.completedChapters],
  );

  const totalChapters = useMemo(
    () => modules.reduce((n, m) => n + m.chapters.length, 0),
    [],
  );

  const completedCount = snap.state.completedChapters.length;

  const moduleDone = useCallback(
    (moduleId: string) => {
      const mod = modules.find((m) => m.id === moduleId);
      if (!mod) return { done: 0, total: 0 };
      const done = mod.chapters.filter((c) => completedSet.has(c.id)).length;
      return { done, total: mod.chapters.length };
    },
    [completedSet],
  );

  return {
    completedSet,
    completedCount,
    totalChapters,
    isComplete: isChapterComplete,
    toggleComplete: toggleChapterComplete,
    setComplete: setChapterComplete,
    moduleDone,
  };
}
