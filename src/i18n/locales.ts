/** The set of interface languages Dotcraft ships, the `Locale` type derived
 *  from it, and the human-readable label each one shows in the language picker. */

export const LOCALES = ["en", "fr", "es", "de", "it", "pt"] as const;

export type Locale = (typeof LOCALES)[number];

/** Each locale's own endonym, shown in the language `<select>`. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

/** Narrow an arbitrary string to a supported `Locale`, or undefined. */
export function asLocale(value: unknown): Locale | undefined {
  return typeof value === "string" &&
    (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : undefined;
}
