export const LEARNER_STORAGE_KEY = "sd-learn:learner-state:v1";

export interface LearnerState {
  version: 1;
  updatedAt: string;
  completedChapters: string[];
}

export interface LearnerSnapshot {
  state: LearnerState;
}

export function emptyState(): LearnerState {
  return { version: 1, updatedAt: "", completedChapters: [] };
}

export function normalizeState(raw: unknown): LearnerState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const completed = Array.isArray(o.completedChapters)
    ? o.completedChapters.filter((id): id is string => typeof id === "string")
    : [];
  return {
    version: 1,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    completedChapters: [...new Set(completed)],
  };
}

function loadLocal(): LearnerState {
  try {
    const raw = localStorage.getItem(LEARNER_STORAGE_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw)) ?? emptyState();
  } catch {
    return emptyState();
  }
}

function writeLocal(state: LearnerState) {
  try {
    localStorage.setItem(LEARNER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / 隐私模式 */
  }
}

type Listener = () => void;
const progressListeners = new Set<Listener>();

let snapshot: LearnerSnapshot = {
  state: typeof localStorage !== "undefined" ? loadLocal() : emptyState(),
};

function emit(patch: Partial<LearnerSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  progressListeners.forEach((l) => l());
}

function persist(next: LearnerState) {
  writeLocal(next);
  emit({ state: next });
}

function mutate(updater: (s: LearnerState) => LearnerState) {
  persist({
    ...updater(snapshot.state),
    version: 1,
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeProgress(listener: Listener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function getProgressSnapshot(): LearnerSnapshot {
  return snapshot;
}

export function isComplete(chapterId: string): boolean {
  return snapshot.state.completedChapters.includes(chapterId);
}

export function setChapterComplete(chapterId: string, complete: boolean) {
  mutate((s) => {
    const set = new Set(s.completedChapters);
    if (complete) set.add(chapterId);
    else set.delete(chapterId);
    return { ...s, completedChapters: [...set] };
  });
}

export function toggleChapterComplete(chapterId: string) {
  setChapterComplete(chapterId, !isComplete(chapterId));
}
