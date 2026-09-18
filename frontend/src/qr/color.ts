/** Color parsing helpers, backed by the browser's own CSS color parser.
 *
 *  QR colours are written straight into SVG `fill` attributes, which accept any
 *  CSS colour (hex, `rgb()`, `hsl()`, named, ...). The only place that needs a
 *  plain `#rrggbb` is the native `<input type="color">` swatch, so we convert
 *  there. */

let probe: CanvasRenderingContext2D | null | undefined;

function ctx(): CanvasRenderingContext2D | null {
  if (probe === undefined) {
    probe = document.createElement("canvas").getContext("2d");
  }
  return probe;
}

/** Convert any CSS colour string to a 6-digit `#rrggbb` hex (alpha dropped, as
 *  the native swatch can't show it). Returns null if the browser doesn't
 *  recognise the string as a colour. */
export function cssColorToHex(input: string): string | null {
  const c = ctx();
  const value = input.trim();
  if (!c || value === "") return null;

  // A 2D context silently ignores a `fillStyle` assignment it can't parse, so
  // probing with two different fallbacks reveals whether `value` was understood:
  // if it was, both probes land on the same normalised colour.
  c.fillStyle = "#000000";
  c.fillStyle = value;
  const onBlack = c.fillStyle;
  c.fillStyle = "#ffffff";
  c.fillStyle = value;
  const onWhite = c.fillStyle;
  if (onBlack !== onWhite) return null;

  // `onBlack` is the normalised colour: "#rrggbb" for opaque, "rgba(r, g, b, a)"
  // when it carries alpha.
  if (onBlack.startsWith("#")) return onBlack;
  const parts = onBlack.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  return `#${parts
    .slice(0, 3)
    .map((n) => Math.round(Number(n)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Whether the browser recognises `input` as a CSS colour. */
export function isValidCssColor(input: string): boolean {
  return cssColorToHex(input) !== null;
}

/** How colours are entered in the editor. The stored value is always a CSS
 *  colour string regardless; the format only governs which inputs are shown. */
export type ColorFormat = "hex" | "rgb" | "hsl" | "named";

export const COLOR_FORMATS: ColorFormat[] = ["hex", "rgb", "hsl", "named"];

export const COLOR_FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: "Hex",
  rgb: "RGB",
  hsl: "HSL",
  named: "Named",
};

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp8 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Parse any CSS colour to 8-bit RGB channels, or null if unrecognised. */
export function cssColorToRgb(input: string): Rgb | null {
  const hex = cssColorToHex(input);
  if (!hex) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp8(n).toString(16).padStart(2, "0")).join("")}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  return {
    r: clamp8((r + m) * 255),
    g: clamp8((g + m) * 255),
    b: clamp8((b + m) * 255),
  };
}

/** Whether `input` is a CSS *named* colour (alphabetic keyword like `tomato`),
 *  as opposed to hex/rgb()/hsl() syntax. */
export function isNamedColor(input: string): boolean {
  const value = input.trim();
  return /^[a-z]+$/i.test(value) && isValidCssColor(value);
}
