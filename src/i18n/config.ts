/** The shared i18next instance.
 *
 *  All six catalogs are bundled inline (the payload is tiny), so initialization
 *  is synchronous (`initAsync: false`) and `t` is usable the moment this module
 *  is imported — no loading state, and tests get strings immediately.
 *
 *  The starting language is the user's saved choice if there is one, otherwise
 *  the browser's preferred language, otherwise English (see {@link detectLocale}
 *  and the persisted {@link getPrefs} locale). */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getPrefs } from "../qr/storage";
import { detectLocale } from "./detect";
import { LOCALES, type Locale } from "./locales";
import de from "./resources/de.json";
import en from "./resources/en.json";
import es from "./resources/es.json";
import fr from "./resources/fr.json";
import it from "./resources/it.json";
import pt from "./resources/pt.json";

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  de: { translation: de },
  it: { translation: it },
  pt: { translation: pt },
};

/** The language to start in: the saved choice if there is one, otherwise the
 *  browser's preferred language, otherwise English. */
export function initialLocale(): Locale {
  return getPrefs().locale ?? detectLocale();
}

i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale(),
  fallbackLng: "en",
  supportedLngs: LOCALES,
  interpolation: { escapeValue: false },
  initAsync: false,
});

export default i18n;
