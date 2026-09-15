import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  LOCALE_STORAGE_KEY,
  applyDocumentLocale,
  applyStoredDocumentLocale,
  normalizeLocale,
  type AppLocale,
} from "./localeState";

export { SUPPORTED_LOCALES, applyDocumentLocale, type AppLocale } from "./localeState";

const initialLocale = applyStoredDocumentLocale();

const localeLoaders = {
  fa: () => import("./locales/fa/common.json"),
  en: () => import("./locales/en/common.json")
} satisfies Record<AppLocale, () => Promise<{ default: Record<string, unknown> }>>;

async function loadLocale(locale: AppLocale) {
  if (i18n.hasResourceBundle(locale, "common")) return;
  const messages = await localeLoaders[locale]();
  i18n.addResourceBundle(locale, "common", messages.default, true, true);
}

const initialMessages = await localeLoaders[initialLocale]();

await i18n.use(initReactI18next).init({
  resources: {
    [initialLocale]: { common: initialMessages.default }
  },
  lng: initialLocale,
  fallbackLng: "fa",
  defaultNS: "common",
  partialBundledLanguages: true,
  interpolation: { escapeValue: false }
});

i18n.on("languageChanged", (locale) => {
  const normalized = normalizeLocale(locale);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
  applyDocumentLocale(normalized);
});

const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (locale?: string) => {
  const normalized = normalizeLocale(locale);
  await loadLocale(normalized);
  return originalChangeLanguage(normalized);
};

export default i18n;
