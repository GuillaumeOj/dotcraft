export interface Corners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/**
 * SVG path data for a rectangle with independently rounded corners. A radius of
 * 0 yields a sharp corner — which is how the droplet eye gets its point.
 */
export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | Corners,
): string {
  const c: Corners = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  const max = Math.min(w, h) / 2;
  const tl = Math.min(c.tl, max);
  const tr = Math.min(c.tr, max);
  const br = Math.min(c.br, max);
  const bl = Math.min(c.bl, max);

  const arc = (rad: number, ex: number, ey: number) =>
    rad > 0 ? `A${rad} ${rad} 0 0 1 ${ex} ${ey}` : `L${ex} ${ey}`;

  return [
    `M${x + tl} ${y}`,
    `H${x + w - tr}`,
    arc(tr, x + w, y + tr),
    `V${y + h - br}`,
    arc(br, x + w - br, y + h),
    `H${x + bl}`,
    arc(bl, x, y + h - bl),
    `V${y + tl}`,
    arc(tl, x + tl, y),
    "Z",
  ].join(" ");
}
