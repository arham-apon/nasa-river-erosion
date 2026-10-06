import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import bn from "./bn.json";

const KEY = "rw-lang";

function initialLanguage() {
  // ?lang=en lets a shared link open in a chosen language; otherwise the visitor's last choice, then Bangla.
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl === "en" || fromUrl === "bn") return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "bn") return saved;
  } catch {
    /* storage blocked: fall through to the default */
  }
  return "bn";
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    /* not persisted; the switch still works for this visit */
  }
});

export default i18n;
