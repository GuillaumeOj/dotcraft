import { hslToRgb, rgbToHex } from "./color";
import { DOT_STYLES, EYE_STYLES, type QrOptions } from "./types";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** h: 0–360, s/l: 0–100 -> #rrggbb */
const hslToHex = (h: number, s: number, l: number): string =>
  rgbToHex(hslToRgb({ h, s, l }));

/** Random style/colors/margin. Keeps a dark foreground on a near-white
 *  background so the result stays high-contrast and scannable. Content text,
 *  error correction, and logo settings are intentionally left untouched. */
export function randomStyle(): Pick<
  QrOptions,
  "dotStyle" | "eyeStyle" | "fillColor" | "bgColor" | "margin"
> {
  const hue = Math.floor(Math.random() * 360);
  return {
    dotStyle: pick(DOT_STYLES),
    eyeStyle: pick(EYE_STYLES),
    fillColor: hslToHex(hue, 60 + Math.random() * 30, 22 + Math.random() * 16),
    bgColor: hslToHex(
      (hue + 180) % 360,
      30 + Math.random() * 40,
      95 + Math.random() * 5,
    ),
    margin: 2 + Math.floor(Math.random() * 5), // 2..6
  };
}
