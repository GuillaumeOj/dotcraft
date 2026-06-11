import type { EcSetting, ErrorCorrection } from "./types";

/** Resolve the user-facing {@link EcSetting} to the concrete error-correction
 *  level the QR generator needs. This is the only bridge from "auto" to a real
 *  level — "auto" must never reach the matrix generator.
 *
 *  - A logo always forces "H": the badge covers modules, so the code needs the
 *    full recovery headroom to stay scannable.
 *  - "auto" keeps recovery as high as the payload allows: short content gets
 *    "Q", medium "M", long "L" (so a large payload still fits a sensible size).
 *  - An explicit level passes through unchanged. */
export function resolveEc(
  setting: EcSetting,
  encodedLength: number,
  hasLogo: boolean,
): ErrorCorrection {
  if (hasLogo) return "H";
  if (setting !== "auto") return setting;
  if (encodedLength <= 60) return "Q";
  if (encodedLength <= 150) return "M";
  return "L";
}
