import QRCode from "qrcode";
import { encodeContent } from "./content";
import { resolveEc } from "./ec";
import { roundedRectPath } from "./paths";
import { dotShape, EYE_MODULES, MS, pointedCorner, renderEye } from "./shapes";
import { isTransparent, type QrOptions } from "./types";

/** Escape a value before interpolating it into XML/SVG attribute markup.
 *  Colors and the logo href come from free-text user input, so this prevents
 *  any attribute-breakout / markup injection regardless of who consumes the SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderLogo(
  opts: QrOptions,
  px: number,
): { defs: string; body: string } {
  if (!opts.logo) return { defs: "", body: "" };
  const badge = opts.logoRatio * px;
  const x = (px - badge) / 2;
  const y = (px - badge) / 2;
  const radius = opts.logoRadius * badge;
  const pad = opts.logoPadding * badge;
  const shape = roundedRectPath(x, y, badge, badge, radius);

  const bg = isTransparent(opts.logoBg)
    ? ""
    : `<path d="${shape}" fill="${escapeXml(opts.logoBg)}"/>`;
  const defs = `<clipPath id="logo-clip"><path d="${shape}"/></clipPath>`;
  // preserveAspectRatio "meet" keeps the logo's aspect ratio (no stretching).
  const image =
    `<image href="${escapeXml(opts.logo)}" x="${x + pad}" y="${y + pad}" ` +
    `width="${badge - 2 * pad}" height="${badge - 2 * pad}" ` +
    `preserveAspectRatio="xMidYMid meet" clip-path="url(#logo-clip)"/>`;

  return { defs, body: bg + image };
}

export interface RenderResult {
  svg: string;
  px: number;
}

/** Thrown by {@link buildSvg} when there is nothing to encode. Exported so the
 *  UI can recognise it and show a translated message. */
export const EMPTY_CONTENT_ERROR = "Enter some text or a URL to encode.";

/** Build the styled QR code as a self-contained SVG string. Throws if the data
 *  is empty or too large for the chosen error-correction level. */
export function buildSvg(opts: QrOptions): RenderResult {
  const data = encodeContent(opts.contents[opts.contentType]);
  if (!data) throw new Error(EMPTY_CONTENT_ERROR);

  const ec = resolveEc(opts.errorCorrection, data.length, !!opts.logo);
  const m = getMatrix(data, ec);
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
    `<rect width="${px}" height="${px}" fill="${escapeXml(opts.bgColor)}"/>` +
    `<g fill="${escapeXml(opts.fillColor)}">${modules}${eyeMarkup}</g>` +
    logo.body +
    `</svg>`;

  return { svg, px };
}
