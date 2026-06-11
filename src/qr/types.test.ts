import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  DOT_STYLES,
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
  });

  it("DEFAULT_OPTIONS draws from valid members", () => {
    expect(DOT_STYLES).toContain(DEFAULT_OPTIONS.dotStyle);
    expect(EYE_STYLES).toContain(DEFAULT_OPTIONS.eyeStyle);
    expect(ERROR_LEVELS).toContain(DEFAULT_OPTIONS.errorCorrection);
    expect(DEFAULT_OPTIONS.logo).toBeNull();
  });
});
