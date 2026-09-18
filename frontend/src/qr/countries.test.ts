import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRIES,
  countryByCode,
  detectCountryCode,
  FALLBACK_COUNTRY,
} from "./countries";

describe("COUNTRIES dataset", () => {
  it("has a code, name, dial code and flag for every entry", () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.dialCode).toMatch(/^\+\d+$/);
      expect([...c.flag].length).toBe(2); // two regional-indicator symbols
    }
  });

  it("has unique ISO codes and is sorted by name", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    const names = COUNTRIES.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
  });
});

describe("countryByCode", () => {
  it("finds a country case-insensitively", () => {
    expect(countryByCode("fr")?.name).toBe("France");
    expect(countryByCode("US")?.dialCode).toBe("+1");
  });

  it("returns undefined for an unknown code", () => {
    expect(countryByCode("ZZ")).toBeUndefined();
  });
});

describe("detectCountryCode", () => {
  const setLang = (language: string, languages: string[] = []) =>
    vi.spyOn(navigator, "languages", "get").mockReturnValue(languages) &&
    vi.spyOn(navigator, "language", "get").mockReturnValue(language);

  afterEach(() => vi.restoreAllMocks());

  it("reads the region subtag from the primary language", () => {
    setLang("en-GB", ["en-GB"]);
    expect(detectCountryCode()).toBe("GB");
  });

  it("falls back to a later language when the first has no known region", () => {
    setLang("eo", ["eo", "fr-FR"]);
    expect(detectCountryCode()).toBe("FR");
  });

  it("falls back to the default when no region is resolvable", () => {
    setLang("", []);
    expect(detectCountryCode()).toBe(FALLBACK_COUNTRY);
  });

  it("ignores a region that is not in the dataset", () => {
    setLang("en-ZZ", ["en-ZZ"]);
    expect(detectCountryCode()).toBe(FALLBACK_COUNTRY);
  });
});
