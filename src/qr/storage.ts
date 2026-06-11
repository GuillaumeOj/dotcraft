/** Browser persistence for the QR library.
 *
 *  Folders and documents are stored as records in IndexedDB (the `folders` and
 *  `documents` object stores). Logos — which can be multi-megabyte images — are
 *  stored as Blobs in a separate `logo` store, keyed by the owning document's
 *  id, so the document records stay small and serialisable. A logo stays a data
 *  URL *in memory* (the preview <img> and SVG/PNG export need a self-contained
 *  URL); the Blob conversion happens only here, at rest.
 *
 *  A tiny app-wide preferences record (colour-input format + the last opened
 *  document) lives in localStorage — it's small and read synchronously on boot.
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
  type Folder,
  type QrDocument,
  type QrOptions,
} from "./types";

const DB_NAME = "qr-studio";
const DB_VERSION = 2;
const FOLDER_STORE = "folders";
const DOC_STORE = "documents";
const LOGO_STORE = "logo";

/** localStorage key for the app-wide preferences record. Exported for tests. */
export const PREFS_KEY = "qr-studio:prefs";
const PREFS_VERSION = 1;

/** Legacy single-document keys, read once by {@link migrateLegacy}. */
const LEGACY_STATE_KEY = "qr-studio:state";
const LEGACY_LOGO_KEY = "current";

export interface Prefs {
  colorFormat: ColorFormat;
  /** Id of the document the user was last editing, or null. */
  lastOpenedDocId: string | null;
  /** Ids of folders the user has collapsed (folders default to expanded). */
  collapsedFolderIds: string[];
}

const DEFAULT_PREFS: Prefs = {
  colorFormat: "hex",
  lastOpenedDocId: null,
  collapsedFolderIds: [],
};

// --- localStorage: preferences ---------------------------------------------

/** Read the app-wide preferences, falling back to defaults on missing/corrupt
 *  data or unavailable storage. */
export function getPrefs(): Prefs {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== PREFS_VERSION)
      return { ...DEFAULT_PREFS };
    return {
      colorFormat: COLOR_FORMATS.includes(parsed.colorFormat)
        ? parsed.colorFormat
        : "hex",
      lastOpenedDocId:
        typeof parsed.lastOpenedDocId === "string"
          ? parsed.lastOpenedDocId
          : null,
      collapsedFolderIds: Array.isArray(parsed.collapsedFolderIds)
        ? parsed.collapsedFolderIds.filter(
            (id: unknown) => typeof id === "string",
          )
        : [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Persist the app-wide preferences. No-op on failure. */
export function setPrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ version: PREFS_VERSION, ...prefs }),
    );
  } catch {
    // Quota or unavailable storage — drop the write.
  }
}

// --- IndexedDB plumbing ----------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // The logo store predates v2 (it held a single "current" key); keep it.
      if (!db.objectStoreNames.contains(LOGO_STORE))
        db.createObjectStore(LOGO_STORE);
      if (!db.objectStoreNames.contains(FOLDER_STORE))
        db.createObjectStore(FOLDER_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DOC_STORE))
        db.createObjectStore(DOC_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Run one request against `storeName` inside its own transaction, resolving to
 *  the request result once the transaction commits. Reliably closes the DB and
 *  returns undefined on any failure (unavailable store, blocked open, abort). */
async function withStore<T>(
  storeName: string,
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
      const tx = db.transaction(storeName, mode);
      const req = run(tx.objectStore(storeName));
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

// --- Folders ---------------------------------------------------------------

/** All folders, or an empty list on any failure. */
export async function listFolders(): Promise<Folder[]> {
  return (
    (
      await withStore<Folder[]>(FOLDER_STORE, "readonly", (s) => s.getAll())
    )?.filter(Boolean) ?? []
  );
}

/** Insert or update a folder. No-op on failure. */
export async function saveFolder(folder: Folder): Promise<void> {
  await withStore(FOLDER_STORE, "readwrite", (s) => s.put(folder));
}

// --- Documents -------------------------------------------------------------

/** All documents, or an empty list on any failure. */
export async function listDocuments(): Promise<QrDocument[]> {
  return (
    (
      await withStore<QrDocument[]>(DOC_STORE, "readonly", (s) => s.getAll())
    )?.filter(Boolean) ?? []
  );
}

/** Insert or update a document. The logo is forced null — it lives in the logo
 *  store, keyed by the document id. No-op on failure. */
export async function saveDocument(doc: QrDocument): Promise<void> {
  const record: QrDocument = {
    ...doc,
    options: { ...doc.options, logo: null },
  };
  await withStore(DOC_STORE, "readwrite", (s) => s.put(record));
}

/** Delete a single document and its logo. No-op on failure. */
export async function deleteDocument(id: string): Promise<void> {
  await withStore(DOC_STORE, "readwrite", (s) => s.delete(id));
  await clearLogo(id);
}

/** Maximum folder nesting, counting the top-level project as level 1. Beyond
 *  this the tree becomes unwieldy in the sidebar. */
export const MAX_FOLDER_DEPTH = 5;

/** The 1-based depth of a folder: a top-level project is 1, its child 2, etc. */
export function folderDepth(id: string, folders: Folder[]): number {
  let depth = 1;
  let current = folders.find((f) => f.id === id);
  while (current?.parentId) {
    depth++;
    const parentId = current.parentId;
    current = folders.find((f) => f.id === parentId);
  }
  return depth;
}

/** The id of `id` plus every folder nested beneath it, to any depth. */
export function folderSubtreeIds(id: string, folders: Folder[]): Set<string> {
  const subtree = new Set<string>([id]);
  // Repeatedly sweep for children of already-included folders until stable.
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && subtree.has(f.parentId) && !subtree.has(f.id)) {
        subtree.add(f.id);
        added = true;
      }
    }
  }
  return subtree;
}

/** Delete a folder, all of its descendant folders, and every document (and
 *  logo) they contain. `folders`/`documents` are the current in-memory lists,
 *  used to compute the subtree without extra reads. */
export async function deleteFolderTree(
  id: string,
  folders: Folder[],
  documents: QrDocument[],
): Promise<void> {
  const doomed = folderSubtreeIds(id, folders);
  for (const doc of documents) {
    if (doomed.has(doc.folderId)) await deleteDocument(doc.id);
  }
  for (const folderId of doomed) {
    await withStore(FOLDER_STORE, "readwrite", (s) => s.delete(folderId));
  }
}

// --- Logos -----------------------------------------------------------------

/** Read a document's logo as a data URL, or null if none / on any failure. */
export async function loadLogo(docId: string): Promise<string | null> {
  const blob = await withStore<Blob | undefined>(LOGO_STORE, "readonly", (s) =>
    s.get(docId),
  );
  return blob ? blobToDataUrl(blob) : null;
}

/** Store a document's logo (a data URL) as a Blob. No-op on failure. */
export async function saveLogo(docId: string, dataUrl: string): Promise<void> {
  let blob: Blob;
  try {
    blob = await (await fetch(dataUrl)).blob();
  } catch {
    return;
  }
  await withStore(LOGO_STORE, "readwrite", (s) => s.put(blob, docId));
}

/** Remove a document's logo. No-op on failure. */
export async function clearLogo(docId: string): Promise<void> {
  await withStore(LOGO_STORE, "readwrite", (s) => s.delete(docId));
}

/** Copy a document's logo Blob onto another document. No-op if the source has
 *  no logo or on any failure. */
export async function copyLogo(fromId: string, toId: string): Promise<void> {
  const blob = await withStore<Blob | undefined>(LOGO_STORE, "readonly", (s) =>
    s.get(fromId),
  );
  if (blob) await withStore(LOGO_STORE, "readwrite", (s) => s.put(blob, toId));
}

// --- Legacy migration ------------------------------------------------------

/** Merge a raw stored options object over the defaults and snap unknown enum
 *  values back to their defaults. The logo is always cleared. */
export function normalizeOptions(raw: unknown): QrOptions {
  const merged: QrOptions = { ...DEFAULT_OPTIONS, ...(raw as object) };
  if (!DOT_STYLES.includes(merged.dotStyle))
    merged.dotStyle = DEFAULT_OPTIONS.dotStyle;
  if (!EYE_STYLES.includes(merged.eyeStyle))
    merged.eyeStyle = DEFAULT_OPTIONS.eyeStyle;
  if (!ERROR_LEVELS.includes(merged.errorCorrection))
    merged.errorCorrection = DEFAULT_OPTIONS.errorCorrection;
  merged.logo = null;
  return merged;
}

/** One-time upgrade from the old single-document model. If a legacy
 *  `qr-studio:state` record exists and the library is still empty, turn it into
 *  a "My Project" folder holding one "My QR code" document (carrying over its
 *  logo and colour-format preference), then remove the legacy keys. Returns the
 *  created document's id, or null if there was nothing to migrate.
 *
 *  `newId` is injected so callers (and tests) control id generation. */
export async function migrateLegacy(
  newId: () => string,
  now: number,
): Promise<string | null> {
  if ((await listFolders()).length > 0) return null;

  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  const removeLegacyState = () => {
    try {
      localStorage.removeItem(LEGACY_STATE_KEY);
    } catch {
      // ignore
    }
  };

  let parsed: { version?: number; options?: unknown; colorFormat?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeLegacyState();
    return null;
  }
  if (parsed?.version !== 1 || !parsed.options) {
    removeLegacyState();
    return null;
  }

  const project: Folder = {
    id: newId(),
    name: "My Project",
    parentId: null,
    createdAt: now,
    updatedAt: now,
  };
  const doc: QrDocument = {
    id: newId(),
    name: "My QR code",
    folderId: project.id,
    options: normalizeOptions(parsed.options),
    createdAt: now,
    updatedAt: now,
  };
  await saveFolder(project);
  await saveDocument(doc);

  // Re-key the legacy logo blob (stored under "current") onto the new document.
  const blob = await withStore<Blob | undefined>(LOGO_STORE, "readonly", (s) =>
    s.get(LEGACY_LOGO_KEY),
  );
  if (blob) {
    await withStore(LOGO_STORE, "readwrite", (s) => s.put(blob, doc.id));
    await withStore(LOGO_STORE, "readwrite", (s) => s.delete(LEGACY_LOGO_KEY));
  }

  setPrefs({
    collapsedFolderIds: [],
    colorFormat: COLOR_FORMATS.includes(parsed.colorFormat as ColorFormat)
      ? (parsed.colorFormat as ColorFormat)
      : "hex",
    lastOpenedDocId: doc.id,
  });
  removeLegacyState();
  return doc.id;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
