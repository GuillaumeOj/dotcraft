import { describe, expect, it, vi } from "vitest";
import { detectLocale } from "./detect";

describe("detectLocale", () => {
  it("matches the first supported language in the list", () => {
    expect(detectLocale(["fr-FR", "en"])).toBe("fr");
  });

  it("reduces a regional tag to its supported base language", () => {
    expect(detectLocale(["pt-BR"])).toBe("pt");
  });

  it("skips unsupported languages and keeps scanning", () => {
    expect(detectLocale(["zh", "de", "en"])).toBe("de");
  });

  it("falls back to English when nothing is supported", () => {
    expect(detectLocale(["zh", "ja"])).toBe("en");
  });

  it("falls back to English for an empty preference list", () => {
    expect(detectLocale([])).toBe("en");
  });

  it("reads navigator.languages when no list is given", () => {
    vi.stubGlobal("navigator", { languages: ["es-ES", "en"] });
    expect(detectLocale()).toBe("es");
  });

  it("uses navigator.language when the languages list is empty", () => {
    vi.stubGlobal("navigator", { languages: [], language: "it-IT" });
    expect(detectLocale()).toBe("it");
  });

  it("falls back to English when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectLocale()).toBe("en");
  });
});
