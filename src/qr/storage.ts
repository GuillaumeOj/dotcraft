/** Browser persistence for the editor's current work.
 *
 *  Small settings (everything except the logo image) live in localStorage as a
 *  single JSON record. The logo, which can be a multi-megabyte image, is stored
 *  separately as a Blob in IndexedDB — far more headroom than localStorage's
 *  ~5MB and no base64 inflation. The logo stays a data URL *in memory* (the
 *  preview <img> and SVG/PNG export need a self-contained URL); the Blob
 *  conversion happens only here, at rest.
 *
 *  Every entry point feature-detects its store and swallows errors, so disabled
 *  storage, private mode, or quota overflow degrade to a no-op rather than
 *  breaking the app. */

import { COLOR_FORMATS, type ColorFormat } from "./color";
import {
  DEFAULT_OPTIONS,
  DOT_STYLES,
  ERROR_LEVELS,
  EYE_STYLES,
  type QrOptions,
} from "./types";

const STATE_KEY = "qr-studio:state";
const STATE_VERSION = 1;

const DB_NAME = "qr-studio";
const DB_VERSION = 1;
const LOGO_STORE = "logo";
const LOGO_KEY = "current";

export interface PersistedState {
  options: QrOptions;
  colorFormat: ColorFormat;
}

// --- localStorage: settings ------------------------------------------------

/** Load and validate the saved settings, or null for a fresh visitor (no/old/
 *  corrupt data). The logo is always null here — it hydrates from IndexedDB. */
export function loadState(): PersistedState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return null;

    // Merge over defaults so missing keys fill in, then snap enum fields back to
    // a default if the stored value isn't a known member.
    const merged: QrOptions = { ...DEFAULT_OPTIONS, ...parsed.options };
    if (!DOT_STYLES.includes(merged.dotStyle))
      merged.dotStyle = DEFAULT_OPTIONS.dotStyle;
    if (!EYE_STYLES.includes(merged.eyeStyle))
      merged.eyeStyle = DEFAULT_OPTIONS.eyeStyle;
    if (!ERROR_LEVELS.includes(merged.errorCorrection))
      merged.errorCorrection = DEFAULT_OPTIONS.errorCorrection;
    merged.logo = null; // never trusted/stored here

    const colorFormat: ColorFormat = COLOR_FORMATS.includes(parsed.colorFormat)
      ? parsed.colorFormat
      : "hex";

    return { options: merged, colorFormat };
  } catch {
    return null;
  }
}

/** Persist settings. The logo is forced to null — it lives in IndexedDB. */
export function saveState(options: QrOptions, colorFormat: ColorFormat): void {
  try {
    const payload = {
      version: STATE_VERSION,
      options: { ...options, logo: null },
      colorFormat,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or unavailable storage — drop the write.
  }
}

/** Clear all persisted work (settings + logo). */
export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
  void clearLogo();
}

// --- IndexedDB: logo Blob --------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOGO_STORE)) {
        db.createObjectStore(LOGO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run one request against the logo store inside its own transaction, resolving
 *  to the request result once the transaction commits. Reliably closes the DB
 *  and returns undefined on any failure (unavailable store, blocked open, abort). */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return undefined;
  }
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(LOGO_STORE, mode);
      const req = run(tx.objectStore(LOGO_STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

/** Read the stored logo as a data URL, or null if none / on any failure. */
export async function loadLogo(): Promise<string | null> {
  const blob = await withStore<Blob | undefined>("readonly", (s) =>
    s.get(LOGO_KEY),
  );
  return blob ? blobToDataUrl(blob) : null;
}

/** Store the given logo (a data URL) as a Blob. No-op on failure. */
export async function saveLogo(dataUrl: string): Promise<void> {
  let blob: Blob;
  try {
    blob = await (await fetch(dataUrl)).blob();
  } catch {
    return;
  }
  await withStore("readwrite", (s) => s.put(blob, LOGO_KEY));
}

/** Remove the stored logo. No-op on failure. */
export async function clearLogo(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(LOGO_KEY));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
