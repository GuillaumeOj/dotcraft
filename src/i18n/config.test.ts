import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPrefs } from "../qr/storage";
import { initialLocale } from "./config";

beforeEach(() => {
  localStorage.clear();
});

describe("initialLocale", () => {
  it("prefers the saved language", () => {
    setPrefs({
      colorFormat: "hex",
      lastOpenedDocId: null,
      collapsedFolderIds: [],
      collapsedPanelIds: [],
      locale: "de",
    });
    expect(initialLocale()).toBe("de");
  });

  it("falls back to browser detection when none is saved", () => {
    vi.stubGlobal("navigator", { languages: ["it-IT"] });
    expect(initialLocale()).toBe("it");
  });
});
