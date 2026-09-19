export const SUPPORTED_LOCALES = ["fa", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_STORAGE_KEY = "firewall-log-analyzer.locale";

export function normalizeLocale(value: unknown): AppLocale {
  return value === "en" ? "en" : "fa";
}

export function getStoredLocale(): AppLocale {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return "fa";
  }
}

export function applyDocumentLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}

export function applyStoredDocumentLocale() {
  const locale = getStoredLocale();
  applyDocumentLocale(locale);
  return locale;
}
