export type ThemeId = "parchment" | "dracula";

export const THEME_STORAGE_KEY = "sd-theme";
export const DEFAULT_THEME: ThemeId = "parchment";

export function isThemeId(value: unknown): value is ThemeId {
  return value === "parchment" || value === "dracula";
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    // localStorage 不可用时静默回退默认主题
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function persistTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 同上
  }
  applyTheme(theme);
}
