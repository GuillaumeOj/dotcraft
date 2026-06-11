import { describe, expect, it } from "vitest";
import {
  COLOR_FORMAT_LABELS,
  COLOR_FORMATS,
  cssColorToHex,
  cssColorToRgb,
  hslToRgb,
  isNamedColor,
  isValidCssColor,
  rgbToHex,
  rgbToHsl,
} from "./color";

describe("cssColorToHex", () => {
  it("passes through opaque hex", () => {
    expect(cssColorToHex("#ff0000")).toBe("#ff0000");
  });

  it("expands shorthand hex", () => {
    expect(cssColorToHex("#abc")).toBe("#aabbcc");
  });

  it("parses rgb() syntax", () => {
    expect(cssColorToHex("rgb(0, 128, 255)")).toBe("#0080ff");
  });

  it("parses named colours", () => {
    expect(cssColorToHex("tomato")).toBe("#ff6347");
  });

  it("drops alpha from translucent colours", () => {
    // The shim normalises this to rgba(...), which the function converts to hex.
    expect(cssColorToHex("rgba(255, 0, 0, 0.5)")).toBe("#ff0000");
  });

  it("trims surrounding whitespace", () => {
    expect(cssColorToHex("  #00ff00  ")).toBe("#00ff00");
  });

  it("returns null for the empty string", () => {
    expect(cssColorToHex("")).toBeNull();
    expect(cssColorToHex("   ")).toBeNull();
  });

  it("returns null for unrecognised input", () => {
    expect(cssColorToHex("not-a-color")).toBeNull();
    expect(cssColorToHex("#xyz")).toBeNull();
  });
});

describe("isValidCssColor", () => {
  it("is true for recognised colours and false otherwise", () => {
    expect(isValidCssColor("#000")).toBe(true);
    expect(isValidCssColor("rebeccapurple")).toBe(true);
    expect(isValidCssColor("bogus")).toBe(false);
  });
});

describe("cssColorToRgb", () => {
  it("splits a colour into 8-bit channels", () => {
    expect(cssColorToRgb("#0080ff")).toEqual({ r: 0, g: 128, b: 255 });
  });

  it("returns null for unrecognised input", () => {
    expect(cssColorToRgb("nope")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats channels as zero-padded hex", () => {
    expect(rgbToHex({ r: 0, g: 8, b: 255 })).toBe("#0008ff");
  });

  it("clamps out-of-range channels", () => {
    expect(rgbToHex({ r: -5, g: 300, b: 128 })).toBe("#00ff80");
  });
});

describe("rgbToHsl / hslToRgb", () => {
  it("converts primary red", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("reports zero saturation for greys", () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({
      h: 0,
      s: 0,
      l: 50,
    });
  });

  it("handles green and blue hue branches", () => {
    expect(rgbToHsl({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsl({ r: 0, g: 0, b: 255 }).h).toBe(240);
  });

  it("wraps negative hue into 0–360 (red just below the wrap)", () => {
    // r is max, g < b -> the (g-b)/d term is negative, exercising the h+=360 path.
    const hsl = rgbToHsl({ r: 255, g: 0, b: 64 });
    expect(hsl.h).toBeGreaterThan(300);
    expect(hsl.h).toBeLessThan(360);
  });

  it("round-trips colours through HSL and back", () => {
    for (const rgb of [
      { r: 18, g: 52, b: 86 },
      { r: 200, g: 100, b: 50 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]) {
      const back = hslToRgb(rgbToHsl(rgb));
      // Rounding through HSL can drift by a hair; allow ±2 per channel.
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2);
    }
  });

  it("hslToRgb covers each 60° hue sector", () => {
    const hues = [30, 90, 150, 210, 270, 330];
    for (const h of hues) {
      const rgb = hslToRgb({ h, s: 100, l: 50 });
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(255);
    }
  });

  it("normalises out-of-range and negative hues", () => {
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual(
      hslToRgb({ h: 0, s: 100, l: 50 }),
    );
    expect(hslToRgb({ h: -120, s: 100, l: 50 })).toEqual(
      hslToRgb({ h: 240, s: 100, l: 50 }),
    );
  });
});

describe("isNamedColor", () => {
  it("accepts alphabetic keywords the browser recognises", () => {
    expect(isNamedColor("navy")).toBe(true);
    expect(isNamedColor("  Tomato ")).toBe(true);
  });

  it("rejects hex, functional, and unknown keywords", () => {
    expect(isNamedColor("#fff")).toBe(false);
    expect(isNamedColor("rgb(0,0,0)")).toBe(false);
    expect(isNamedColor("notacolor")).toBe(false);
    expect(isNamedColor("")).toBe(false);
  });
});

describe("format tables", () => {
  it("has a label for every format", () => {
    for (const f of COLOR_FORMATS) {
      expect(COLOR_FORMAT_LABELS[f]).toBeTruthy();
    }
  });
});
