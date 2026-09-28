export type LocaleId = "zh" | "en" | "both";

export const LOCALE_STORAGE_KEY = "sd-locale";
export const DEFAULT_LOCALE: LocaleId = "zh";

export function isLocaleId(value: unknown): value is LocaleId {
  return value === "zh" || value === "en" || value === "both";
}

export function readStoredLocale(): LocaleId {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocaleId(raw)) return raw;
  } catch {
    // localStorage 不可用时静默回退
  }
  return DEFAULT_LOCALE;
}

export function applyLocale(locale: LocaleId): void {
  document.documentElement.setAttribute("data-locale", locale);
  document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
}

export function persistLocale(locale: LocaleId): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 同上
  }
  applyLocale(locale);
}

/** Chrome copy follows English only in EN mode; 对照 keeps Chinese chrome. */
export function uiLocale(locale: LocaleId): "zh" | "en" {
  return locale === "en" ? "en" : "zh";
}
