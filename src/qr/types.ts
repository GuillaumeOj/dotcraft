export type DotStyle = "square" | "gapped" | "rounded" | "circle" | "dots";
export type EyeStyle = "square" | "rounded" | "circle" | "droplet";
export type ErrorCorrection = "L" | "M" | "Q" | "H";

export interface QrOptions {
  data: string;
  dotStyle: DotStyle;
  eyeStyle: EyeStyle;
  fillColor: string;
  bgColor: string;
  /** Quiet-zone width, in modules. */
  margin: number;
  errorCorrection: ErrorCorrection;

  /** Center logo as a data URL, or null for none. */
  logo: string | null;
  /** Logo badge size as a fraction of the QR width (0.05–0.5). */
  logoRatio: number;
  /** Background behind the logo: a color, or "none" for transparent. */
  logoBg: string;
  /** Margin between logo and badge edge, as a fraction of the badge (0–0.45). */
  logoPadding: number;
  /** Rounded-corner radius of the logo background, as a fraction (0–0.5). */
  logoRadius: number;
}

/** Whether a logo-background value means "no background" (transparent). */
export function isTransparent(color: string): boolean {
  return !color || color.toLowerCase() === "none";
}

export const DOT_STYLES: DotStyle[] = [
  "square",
  "gapped",
  "rounded",
  "circle",
  "dots",
];
export const EYE_STYLES: EyeStyle[] = [
  "square",
  "rounded",
  "circle",
  "droplet",
];
export const ERROR_LEVELS: ErrorCorrection[] = ["L", "M", "Q", "H"];

/** A folder in the library. A folder with `parentId === null` is a top-level
 *  "project"; any other folder is nested beneath its parent. Nesting is
 *  unlimited. */
export interface Folder {
  id: string;
  name: string;
  /** Parent folder id, or null for a top-level project. */
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A saved QR code. Its `options.logo` is always null at rest — the logo image
 *  lives separately in the IndexedDB logo store, keyed by the document id. */
export interface QrDocument {
  id: string;
  name: string;
  /** The folder this document lives in. */
  folderId: string;
  options: QrOptions;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_OPTIONS: QrOptions = {
  data: "https://example.com",
  dotStyle: "circle",
  eyeStyle: "droplet",
  fillColor: "#000000",
  bgColor: "#ffffff",
  margin: 4,
  errorCorrection: "M",
  logo: null,
  logoRatio: 0.25,
  logoBg: "#ffffff",
  logoPadding: 0.12,
  logoRadius: 0.2,
};
