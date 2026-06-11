import { describe, expect, it } from "vitest";
import { CONTENT_TYPES } from "./content";
import {
  DEFAULT_OPTIONS,
  DOT_STYLES,
  EC_DESCRIPTIONS,
  EC_LABELS,
  EC_SETTINGS,
  ERROR_LEVELS,
  EYE_STYLES,
  isTransparent,
} from "./types";

describe("isTransparent", () => {
  it("treats empty and 'none' (any case) as transparent", () => {
    expect(isTransparent("")).toBe(true);
    expect(isTransparent("none")).toBe(true);
    expect(isTransparent("NONE")).toBe(true);
    expect(isTransparent("None")).toBe(true);
  });

  it("treats real colours as opaque", () => {
    expect(isTransparent("#ffffff")).toBe(false);
    expect(isTransparent("tomato")).toBe(false);
  });
});

describe("style tables", () => {
  it("expose the expected members", () => {
    expect(DOT_STYLES).toContain("square");
    expect(DOT_STYLES).toContain("dots");
    expect(EYE_STYLES).toContain("droplet");
    expect(ERROR_LEVELS).toEqual(["L", "M", "Q", "H"]);
    expect(EC_SETTINGS).toEqual(["auto", "L", "M", "Q", "H"]);
  });

  it("DEFAULT_OPTIONS draws from valid members", () => {
    expect(DOT_STYLES).toContain(DEFAULT_OPTIONS.dotStyle);
    expect(EYE_STYLES).toContain(DEFAULT_OPTIONS.eyeStyle);
    expect(EC_SETTINGS).toContain(DEFAULT_OPTIONS.errorCorrection);
    expect(CONTENT_TYPES).toContain(DEFAULT_OPTIONS.contentType);
    expect(DEFAULT_OPTIONS.logo).toBeNull();
  });

  it("has a friendly label and description for every EC setting", () => {
    for (const s of EC_SETTINGS) {
      expect(EC_LABELS[s].length).toBeGreaterThan(0);
      expect(EC_DESCRIPTIONS[s].length).toBeGreaterThan(0);
    }
  });
});
