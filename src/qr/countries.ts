/** The country list for the phone / vCard country selectors, sourced from the
 *  maintained `countries-list` package and adapted to the minimal shape the UI
 *  needs. Wrapping the dependency here keeps the rest of the app decoupled from
 *  its data model. */

import { getCountryDataList, getEmojiFlag } from "countries-list";

export interface Country {
  /** ISO 3166-1 alpha-2 code, e.g. "FR". */
  code: string;
  name: string;
  /** International dialling code, including the leading "+". */
  dialCode: string;
  /** Flag emoji. */
  flag: string;
}

export const COUNTRIES: Country[] = getCountryDataList()
  .map((c) => ({
    code: c.iso2,
    name: c.name,
    dialCode: `+${c.phone[0]}`,
    flag: getEmojiFlag(c.iso2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** The country for an ISO alpha-2 code (case-insensitive), or undefined. */
export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** A safe fallback used when the locale can't be resolved to a known country. */
export const FALLBACK_COUNTRY = "US";

/** Best-effort current country from the browser locale's region subtag (e.g.
 *  "en-US" -> "US"), falling back to {@link FALLBACK_COUNTRY} when the region
 *  is absent or not in {@link COUNTRIES}. */
export function detectCountryCode(): string {
  const langs =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const lang of langs) {
    if (!lang) continue;
    let region: string | undefined;
    try {
      region = new Intl.Locale(lang).region ?? undefined;
    } catch {
      region = lang.split("-")[1];
    }
    if (region && countryByCode(region)) return region.toUpperCase();
  }
  return FALLBACK_COUNTRY;
}
