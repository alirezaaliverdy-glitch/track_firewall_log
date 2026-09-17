import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./locales/en/common.json";
import faCommon from "./locales/fa/common.json";

export const SUPPORTED_LOCALES = ["fa", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = "firewall-log-analyzer.locale";

function normalizeLocale(value: unknown): AppLocale {
  return value === "en" ? "en" : "fa";
}

export function applyDocumentLocale(locale: AppLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
}

const initialLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
applyDocumentLocale(initialLocale);

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    fa: { common: faCommon }
  },
  lng: initialLocale,
  fallbackLng: "fa",
  defaultNS: "common",
  interpolation: { escapeValue: false }
});

i18n.on("languageChanged", (locale) => {
  const normalized = normalizeLocale(locale);
  window.localStorage.setItem(STORAGE_KEY, normalized);
  applyDocumentLocale(normalized);
});

export default i18n;
