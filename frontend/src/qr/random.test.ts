import { describe, expect, it, vi } from "vitest";
import { randomStyle } from "./random";
import { DOT_STYLES, EYE_STYLES } from "./types";

describe("randomStyle", () => {
  it("returns only the style/colour/margin keys", () => {
    expect(Object.keys(randomStyle()).sort()).toEqual([
      "bgColor",
      "dotStyle",
      "eyeStyle",
      "fillColor",
      "margin",
    ]);
  });

  it("produces valid #rrggbb colours and an in-range margin", () => {
    for (let i = 0; i < 12; i++) {
      const s = randomStyle();
      expect(s.fillColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.bgColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.margin).toBeGreaterThanOrEqual(2);
      expect(s.margin).toBeLessThanOrEqual(6);
      expect(DOT_STYLES).toContain(s.dotStyle);
      expect(EYE_STYLES).toContain(s.eyeStyle);
    }
  });

  it("picks the first member and lowest margin when random() is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const s = randomStyle();
    expect(s.dotStyle).toBe(DOT_STYLES[0]);
    expect(s.eyeStyle).toBe(EYE_STYLES[0]);
    expect(s.margin).toBe(2);
  });

  it("picks the last member and highest margin near random() = 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const s = randomStyle();
    expect(s.dotStyle).toBe(DOT_STYLES[DOT_STYLES.length - 1]);
    expect(s.eyeStyle).toBe(EYE_STYLES[EYE_STYLES.length - 1]);
    expect(s.margin).toBe(6);
  });
});
