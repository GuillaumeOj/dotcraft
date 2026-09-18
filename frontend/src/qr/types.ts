import { type ContentDrafts, type ContentType, emptyDrafts } from "./content";

export type DotStyle = "square" | "gapped" | "rounded" | "circle" | "dots";
export type EyeStyle = "square" | "rounded" | "circle" | "droplet";
export type ErrorCorrection = "L" | "M" | "Q" | "H";
/** The user-facing error-correction setting, including the "auto" mode that the
 *  renderer resolves to a concrete {@link ErrorCorrection} from content length. */
export type EcSetting = ErrorCorrection | "auto";

export interface QrOptions {
  /** The active content tab. */
  contentType: ContentType;
  /** A draft per content type, so switching tabs preserves what was typed. */
  contents: ContentDrafts;
  dotStyle: DotStyle;
  eyeStyle: EyeStyle;
  fillColor: string;
  bgColor: string;
  /** Quiet-zone width, in modules. */
  margin: number;
  errorCorrection: EcSetting;

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

/** Selectable error-correction settings, "auto" first (the default). The
 *  user-facing labels and descriptions live in the i18n catalogs
 *  (`controls.ecLabels.*` / `controls.ecDescriptions.*`). */
export const EC_SETTINGS: EcSetting[] = ["auto", "L", "M", "Q", "H"];

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

/** The blank per-type drafts with the URL tab pre-filled, used by the default
 *  options and as the starting point for a fresh document. `country` seeds the
 *  phone/address selectors (the UI passes the detected country). */
export function defaultContents(country: string): ContentDrafts {
  return {
    ...emptyDrafts(country),
    url: { type: "url", url: "https://example.com" },
  };
}

/** The default options seeded for a given country (phone/address selectors). */
export function defaultOptions(country: string): QrOptions {
  return { ...DEFAULT_OPTIONS, contents: defaultContents(country) };
}

export const DEFAULT_OPTIONS: QrOptions = {
  contentType: "url",
  contents: defaultContents("US"),
  dotStyle: "circle",
  eyeStyle: "droplet",
  fillColor: "#000000",
  bgColor: "#ffffff",
  margin: 4,
  errorCorrection: "auto",
  logo: null,
  logoRatio: 0.25,
  logoBg: "#ffffff",
  logoPadding: 0.12,
  logoRadius: 0.2,
};
