import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyLocale,
  persistLocale,
  readStoredLocale,
  uiLocale,
  type LocaleId,
} from "../lib/locale";
import { UI, type UiCopy } from "../i18n/ui";

interface LocaleContextValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  ui: UiCopy;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-locale");
      if (attr === "zh" || attr === "en" || attr === "both") return attr;
    }
    return readStoredLocale();
  });

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: LocaleId) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, ui: UI[uiLocale(locale)] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
