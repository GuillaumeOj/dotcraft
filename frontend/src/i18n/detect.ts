/** Pick the best supported interface language from the browser's preferences.
 *
 *  Each preferred tag (e.g. "fr-CA") is reduced to its primary subtag ("fr")
 *  and matched against {@link LOCALES}; the first hit wins. Falls back to
 *  English when nothing matches. The language list is injectable so it can be
 *  exercised without touching the real `navigator`. */

import { asLocale, type Locale } from "./locales";

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0)
    return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function detectLocale(
  languages: readonly string[] = browserLanguages(),
): Locale {
  for (const tag of languages) {
    const base = asLocale(tag.slice(0, 2).toLowerCase());
    if (base) return base;
  }
  return "en";
}
