/** Typed QR content: the structured shapes the editor's content tabs collect,
 *  and the pure encoders that turn each into the string a QR scanner expects
 *  (a URL, `mailto:`, `tel:`, `WIFI:…`, or a vCard).
 *
 *  The encoded string is only ever fed to the QR matrix generator — never
 *  interpolated into SVG markup — so the escaping here is about the *content*
 *  grammars (wifi/vCard), distinct from the XML escaping in `render.ts`. */

import { countryByCode, FALLBACK_COUNTRY } from "./countries";

export type ContentType = "text" | "url" | "email" | "phone" | "wifi" | "vcard";

export const CONTENT_TYPES: ContentType[] = [
  "text",
  "url",
  "email",
  "phone",
  "wifi",
  "vcard",
];

export type WifiEncryption = "WPA" | "WEP" | "nopass";

export interface PhoneNumber {
  /** Selected country (ISO alpha-2), kept so the picker can disambiguate codes
   *  shared by several countries (e.g. +1 for US and CA). */
  country: string;
  /** International dialling code, including the leading "+". */
  dialCode: string;
  /** Local number as typed (digits, spaces, dashes). */
  number: string;
}

export interface PostalAddress {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 code, or "" when unset. */
  countryCode: string;
}

export interface TextContent {
  type: "text";
  text: string;
}
export interface UrlContent {
  type: "url";
  url: string;
}
export interface EmailContent {
  type: "email";
  to: string;
  subject: string;
  body: string;
}
export interface PhoneContent {
  type: "phone";
  phone: PhoneNumber;
}
export interface WifiContent {
  type: "wifi";
  ssid: string;
  password: string;
  encryption: WifiEncryption;
  hidden: boolean;
}
export interface VCardContent {
  type: "vcard";
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  phone: PhoneNumber;
  email: string;
  url: string;
  address: PostalAddress;
  note: string;
}

export type QrContent =
  | TextContent
  | UrlContent
  | EmailContent
  | PhoneContent
  | WifiContent
  | VCardContent;

/** A draft for each content type, so switching tabs preserves what was typed. */
export type ContentDrafts = {
  [K in ContentType]: Extract<QrContent, { type: K }>;
};

/** Compile-time exhaustiveness guard for switches over the union. */
function assertNever(x: never): never {
  throw new Error(`Unhandled content: ${JSON.stringify(x)}`);
}

/** The dial code for an ISO country, defaulting to the fallback country's. */
function dialFor(countryCode: string): string {
  return (
    countryByCode(countryCode)?.dialCode ??
    countryByCode(FALLBACK_COUNTRY)?.dialCode ??
    "+1"
  );
}

/** All six blank drafts, with phone/address country seeded from `country`. */
export function emptyDrafts(country: string): ContentDrafts {
  const code = countryByCode(country)?.code ?? FALLBACK_COUNTRY;
  const phone = (): PhoneNumber => ({
    country: code,
    dialCode: dialFor(code),
    number: "",
  });
  return {
    text: { type: "text", text: "" },
    url: { type: "url", url: "" },
    email: { type: "email", to: "", subject: "", body: "" },
    phone: { type: "phone", phone: phone() },
    wifi: {
      type: "wifi",
      ssid: "",
      password: "",
      encryption: "WPA",
      hidden: false,
    },
    vcard: {
      type: "vcard",
      firstName: "",
      lastName: "",
      org: "",
      title: "",
      phone: phone(),
      email: "",
      url: "",
      address: {
        street: "",
        city: "",
        region: "",
        postalCode: "",
        countryCode: code,
      },
      note: "",
    },
  };
}

// --- Encoding ---------------------------------------------------------------

/** Escape a value for the WIFI grammar: backslash-escape its delimiters. */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/** Escape a value for a vCard text/component: backslash-escape delimiters and
 *  encode newlines as the literal `\n` escape. */
function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/([;,])/g, "\\$1");
}

/** A `tel:` URI, or "" when the number has no digits. */
function encodePhone(p: PhoneNumber): string {
  const digits = p.number.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:${p.dialCode}${digits}`;
}

function encodeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Prefix a scheme when none is present so the code opens as a link.
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function encodeEmail(c: EmailContent): string {
  if (!c.to && !c.subject && !c.body) return "";
  const params: string[] = [];
  if (c.subject) params.push(`subject=${encodeURIComponent(c.subject)}`);
  if (c.body) params.push(`body=${encodeURIComponent(c.body)}`);
  return `mailto:${c.to}${params.length ? `?${params.join("&")}` : ""}`;
}

function encodeWifi(c: WifiContent): string {
  if (!c.ssid) return "";
  const parts = [`T:${c.encryption}`, `S:${escapeWifi(c.ssid)}`];
  if (c.encryption !== "nopass" && c.password)
    parts.push(`P:${escapeWifi(c.password)}`);
  if (c.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

function encodeVcard(c: VCardContent): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  const v = escapeVcard;
  if (c.lastName || c.firstName)
    lines.push(`N:${v(c.lastName)};${v(c.firstName)}`);
  const full = [c.firstName, c.lastName].filter(Boolean).join(" ");
  if (full) lines.push(`FN:${v(full)}`);
  if (c.org) lines.push(`ORG:${v(c.org)}`);
  if (c.title) lines.push(`TITLE:${v(c.title)}`);
  const tel = c.phone.number.replace(/\D/g, "");
  if (tel) lines.push(`TEL;TYPE=CELL:${c.phone.dialCode}${tel}`);
  if (c.email) lines.push(`EMAIL:${v(c.email)}`);
  if (c.url) lines.push(`URL:${v(c.url)}`);
  const a = c.address;
  const countryName = countryByCode(a.countryCode)?.name ?? "";
  // A pre-selected country alone isn't an address — require a real field first.
  if (a.street || a.city || a.region || a.postalCode) {
    lines.push(
      `ADR;TYPE=HOME:;;${v(a.street)};${v(a.city)};${v(a.region)};${v(
        a.postalCode,
      )};${v(countryName)}`,
    );
  }
  if (c.note) lines.push(`NOTE:${v(c.note)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

/** Turn structured content into the string a QR scanner should read. Returns ""
 *  for empty content, which the renderer surfaces as "enter some text". */
export function encodeContent(content: QrContent): string {
  switch (content.type) {
    case "text":
      return content.text;
    case "url":
      return encodeUrl(content.url);
    case "email":
      return encodeEmail(content);
    case "phone":
      return encodePhone(content.phone);
    case "wifi":
      return encodeWifi(content);
    case "vcard":
      return encodeVcard(content);
    default:
      return assertNever(content);
  }
}

// --- Migration / normalisation ---------------------------------------------

/** Looks like a URL: has an http(s) scheme, or a dotted host with no spaces. */
function looksLikeUrl(data: string): boolean {
  const t = data.trim();
  return /^https?:\/\//i.test(t) || (/\.[a-z]{2,}/i.test(t) && !/\s/.test(t));
}

/** Convert a legacy free-text `data` string into a typed content object. */
export function legacyDataToContent(data: string): QrContent {
  return looksLikeUrl(data)
    ? { type: "url", url: data }
    : { type: "text", text: data };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function normPhone(raw: unknown, fallback: PhoneNumber): PhoneNumber {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    country: typeof r.country === "string" ? r.country : fallback.country,
    dialCode: typeof r.dialCode === "string" ? r.dialCode : fallback.dialCode,
    number: str(r.number),
  };
}

/** Validate one raw draft against the canonical empty draft for its type,
 *  coercing missing/invalid fields to the empty-draft values. */
export function normalizeContent(raw: unknown, fallback: QrContent): QrContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = r.type as ContentType;
  const drafts = emptyDrafts(FALLBACK_COUNTRY);
  switch (type) {
    case "text":
      return { type, text: str(r.text) };
    case "url":
      return { type, url: str(r.url) };
    case "email":
      return {
        type,
        to: str(r.to),
        subject: str(r.subject),
        body: str(r.body),
      };
    case "phone":
      return { type, phone: normPhone(r.phone, drafts.phone.phone) };
    case "wifi":
      return {
        type,
        ssid: str(r.ssid),
        password: str(r.password),
        encryption: (["WPA", "WEP", "nopass"] as WifiEncryption[]).includes(
          r.encryption as WifiEncryption,
        )
          ? (r.encryption as WifiEncryption)
          : "WPA",
        hidden: r.hidden === true,
      };
    case "vcard": {
      const a = (r.address ?? {}) as Record<string, unknown>;
      return {
        type,
        firstName: str(r.firstName),
        lastName: str(r.lastName),
        org: str(r.org),
        title: str(r.title),
        phone: normPhone(r.phone, drafts.vcard.phone),
        email: str(r.email),
        url: str(r.url),
        address: {
          street: str(a.street),
          city: str(a.city),
          region: str(a.region),
          postalCode: str(a.postalCode),
          countryCode: str(a.countryCode),
        },
        note: str(r.note),
      };
    }
    default:
      return fallback;
  }
}
