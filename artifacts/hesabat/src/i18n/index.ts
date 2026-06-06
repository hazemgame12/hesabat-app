import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Lang } from "@workspace/locale";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGS: Lang[] = ["ar", "en"];
export const DEFAULT_LANG: Lang = "ar";
const STORAGE_KEY = "hesabat.lang";

function readStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "ar" || stored === "en" ? stored : DEFAULT_LANG;
}

export function dirForLang(lang: string): "rtl" | "ltr" {
  return lang === "en" ? "ltr" : "rtl";
}

// Keep <html lang/dir> in sync with the active language so direction, fonts,
// and Tailwind logical properties (ms/me/ps/pe/start/end) flip automatically.
function applyDocumentLang(lang: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirForLang(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: readStoredLang(),
  fallbackLng: DEFAULT_LANG,
  supportedLngs: SUPPORTED_LANGS,
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLang(i18n.language);

i18n.on("languageChanged", (lang) => {
  applyDocumentLang(lang);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }
});

export function changeLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
}

export default i18n;
