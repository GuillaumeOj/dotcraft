import QRCode from "qrcode";
import { Corners, roundedRectPath } from "./paths";
import { DotStyle, EyeStyle, isTransparent, QrOptions } from "./types";

/** SVG units per module. The whole SVG scales freely, so this is arbitrary. */
const MS = 10;

/** A finder pattern (eye) spans EYE_MODULES×EYE_MODULES modules. */
const EYE_MODULES = 7;

interface Matrix {
  size: number;
  get(row: number, col: number): boolean;
}

function getMatrix(text: string, ec: string): Matrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ec as never });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return { size, get: (r, c) => Boolean(data[r * size + c]) };
}

/** The three finder patterns occupy the corner blocks in three corners. */
function isEye(size: number, row: number, col: number): boolean {
  const near = (i: number) => i < EYE_MODULES;
  const far = (i: number) => i >= size - EYE_MODULES;
  return (
    (near(row) && near(col)) ||
    (near(row) && far(col)) ||
    (far(row) && near(col))
  );
}

function dotShape(style: DotStyle, x: number, y: number): string {
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
function pointedCorner(r0: number, c0: number, size: number): keyof Corners {
  const vertical = r0 < size / 2 ? "b" : "t";
  const horizontal = c0 < size / 2 ? "r" : "l";
  return `${vertical}${horizontal}` as keyof Corners;
}

function renderEye(
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
    roundedRectPath(ox + MS, oy + MS, inner, inner, eyeCorners(style, inner, tip));
  const dot = roundedRectPath(
    ox + 2 * MS,
    oy + 2 * MS,
    pupil,
    pupil,
    eyeCorners(style, pupil, tip),
  );

  return `<path d="${ring}" fill-rule="evenodd"/><path d="${dot}"/>`;
}

function renderLogo(opts: QrOptions, px: number): { defs: string; body: string } {
  if (!opts.logo) return { defs: "", body: "" };
  const badge = opts.logoRatio * px;
  const x = (px - badge) / 2;
  const y = (px - badge) / 2;
  const radius = opts.logoRadius * badge;
  const pad = opts.logoPadding * badge;
  const shape = roundedRectPath(x, y, badge, badge, radius);

  const bg = isTransparent(opts.logoBg)
    ? ""
    : `<path d="${shape}" fill="${opts.logoBg}"/>`;
  const defs = `<clipPath id="logo-clip"><path d="${shape}"/></clipPath>`;
  // preserveAspectRatio "meet" keeps the logo's aspect ratio (no stretching).
  const image =
    `<image href="${opts.logo}" x="${x + pad}" y="${y + pad}" ` +
    `width="${badge - 2 * pad}" height="${badge - 2 * pad}" ` +
    `preserveAspectRatio="xMidYMid meet" clip-path="url(#logo-clip)"/>`;

  return { defs, body: bg + image };
}

export interface RenderResult {
  svg: string;
  px: number;
}

/** Build the styled QR code as a self-contained SVG string. Throws if the data
 *  is empty or too large for the chosen error-correction level. */
export function buildSvg(opts: QrOptions): RenderResult {
  if (!opts.data) throw new Error("Enter some text or a URL to encode.");

  const ec = opts.logo ? "H" : opts.errorCorrection;
  const m = getMatrix(opts.data, ec);
  const n = m.size;
  const margin = Math.max(0, Math.round(opts.margin));
  const px = (n + 2 * margin) * MS;

  let modules = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (isEye(n, r, c) || !m.get(r, c)) continue;
      modules += dotShape(opts.dotStyle, (c + margin) * MS, (r + margin) * MS);
    }
  }

  const eyeOrigins: [number, number][] = [
    [0, 0],
    [0, n - EYE_MODULES],
    [n - EYE_MODULES, 0],
  ];
  const eyeMarkup = eyeOrigins
    .map(([r0, c0]) =>
      renderEye(r0, c0, pointedCorner(r0, c0, n), opts.eyeStyle, margin),
    )
    .join("");

  const logo = renderLogo(opts, px);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" ` +
    `viewBox="0 0 ${px} ${px}" shape-rendering="geometricPrecision">` +
    (logo.defs ? `<defs>${logo.defs}</defs>` : "") +
    `<rect width="${px}" height="${px}" fill="${opts.bgColor}"/>` +
    `<g fill="${opts.fillColor}">${modules}${eyeMarkup}</g>` +
    logo.body +
    `</svg>`;

  return { svg, px };
}
