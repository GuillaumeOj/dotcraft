/** Pure SVG geometry for the QR dots and finder-pattern eyes. These primitives
 *  are shared by {@link buildSvg} (in `render.ts`) and the style-swatch pickers,
 *  so the swatches always draw exactly what the rendered code will. */

import { type Corners, roundedRectPath } from "./paths";
import type { DotStyle, EyeStyle } from "./types";

/** SVG units per module. The whole SVG scales freely, so this is arbitrary. */
export const MS = 10;

/** A finder pattern (eye) spans EYE_MODULES×EYE_MODULES modules. */
export const EYE_MODULES = 7;

/** SVG markup for a single data module of the given style at (x, y). */
export function dotShape(style: DotStyle, x: number, y: number): string {
  switch (style) {
    case "square":
      return `<rect x="${x}" y="${y}" width="${MS}" height="${MS}"/>`;
    case "gapped": {
      const g = MS * 0.12;
      return `<rect x="${x + g}" y="${y + g}" width="${MS - 2 * g}" height="${MS - 2 * g}"/>`;
    }
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${MS}" height="${MS}" rx="${MS * 0.35}"/>`;
    case "circle":
      return `<circle cx="${x + MS / 2}" cy="${y + MS / 2}" r="${MS / 2}"/>`;
    case "dots":
      return `<circle cx="${x + MS / 2}" cy="${y + MS / 2}" r="${MS * 0.42}"/>`;
  }
}

const EYE_RATIO: Record<EyeStyle, number> = {
  square: 0,
  rounded: 0.3,
  circle: 0.5,
  droplet: 0.35,
};

/** Corner radii for an eye element of side `side`, pointing toward `pointed`. */
function eyeCorners(
  style: EyeStyle,
  side: number,
  pointed: keyof Corners | null,
): Corners {
  const r = EYE_RATIO[style] * side;
  const c: Corners = { tl: r, tr: r, br: r, bl: r };
  if (style === "droplet" && pointed) c[pointed] = 0; // sharp point -> teardrop
  return c;
}

/** The corner of an eye that faces the QR center — the droplet's point. */
export function pointedCorner(
  r0: number,
  c0: number,
  size: number,
): keyof Corners {
  const vertical = r0 < size / 2 ? "b" : "t";
  const horizontal = c0 < size / 2 ? "r" : "l";
  return `${vertical}${horizontal}` as keyof Corners;
}

/** SVG markup for one finder-pattern eye whose top-left module is at grid
 *  (r0, c0), drawn at quiet-zone `margin`, in the given style. */
export function renderEye(
  r0: number,
  c0: number,
  pointed: keyof Corners,
  style: EyeStyle,
  margin: number,
): string {
  const ox = (c0 + margin) * MS;
  const oy = (r0 + margin) * MS;
  const outer = EYE_MODULES * MS;
  const inner = (EYE_MODULES - 2) * MS; // a one-module-wide ring
  const pupil = (EYE_MODULES - 4) * MS;
  const tip = style === "droplet" ? pointed : null;

  // Outer ring = outer rounded rect with an inner rounded-rect hole (evenodd).
  const ring =
    roundedRectPath(ox, oy, outer, outer, eyeCorners(style, outer, tip)) +
    " " +
    roundedRectPath(
      ox + MS,
      oy + MS,
      inner,
      inner,
      eyeCorners(style, inner, tip),
    );
  const dot = roundedRectPath(
    ox + 2 * MS,
    oy + 2 * MS,
    pupil,
    pupil,
    eyeCorners(style, pupil, tip),
  );

  return `<path d="${ring}" fill-rule="evenodd"/><path d="${dot}"/>`;
}
