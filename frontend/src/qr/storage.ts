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
 *  breaking the app.
 *
 *  Cloud sync bookkeeping lives here too, so every local write is recorded where
 *  it happens: each tracked mutation adds an entry to the `outbox` store (what to
 *  push next), hard deletes also leave a `tombstones` record (so the deletion can
 *  be pushed), and the `sync` store keeps the account/cursor state. Changes that
 *  come *from* the cloud go through the untracked `put*` / `remove*` writes so
 *  they aren't echoed back. */

import { asLocale, type Locale } from "../i18n/locales";
import { COLOR_FORMATS, type ColorFormat } from "./color";
import {
  CONTENT_TYPES,
  type ContentDrafts,
  legacyDataToContent,
  normalizeContent,
} from "./content";
import { FALLBACK_COUNTRY } from "./countries";
import { fileToDataUrl } from "./image";
import {
  DEFAULT_OPTIONS,
  DOT_STYLES,
  defaultContents,
  EC_SETTINGS,
  EYE_STYLES,
  type Folder,
  type QrDocument,
  type QrOptions,
} from "./types";

const DB_NAME = "qr-studio";
const DB_VERSION = 3;
const FOLDER_STORE = "folders";
const DOC_STORE = "documents";
const LOGO_STORE = "logo";
const OUTBOX_STORE = "outbox";
const TOMBSTONE_STORE = "tombstones";
const SYNC_STORE = "sync";

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
  /** Ids of editor panels the user has folded shut on mobile (panels default to
   *  open). Only affects the mobile layout; desktop always shows panel bodies. */
  collapsedPanelIds: string[];
  /** Desktop-only: whether the user has hidden the library column. Absent until
   *  they toggle it; defaults to shown. Ignored on the mobile (modal) layout. */
  libraryCollapsed?: boolean;
  /** The user's chosen interface language. Absent until they pick one — the app
   *  then falls back to browser detection. */
  locale?: Locale;
  /** When `colorFormat` or `locale` last changed (epoch ms). These two follow the
   *  account across devices; absent until the user changes one of them. */
  settingsUpdatedAt?: number;
}

const DEFAULT_PREFS: Prefs = {
  colorFormat: "hex",
  lastOpenedDocId: null,
  collapsedFolderIds: [],
  collapsedPanelIds: [],
};

// --- localStorage: preferences ---------------------------------------------

/** Keep only the string entries of a stored array, or [] if it isn't one. */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

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
    const locale = asLocale(parsed.locale);
    return {
      colorFormat: COLOR_FORMATS.includes(parsed.colorFormat)
        ? parsed.colorFormat
        : "hex",
      lastOpenedDocId:
        typeof parsed.lastOpenedDocId === "string"
          ? parsed.lastOpenedDocId
          : null,
      collapsedFolderIds: stringList(parsed.collapsedFolderIds),
      collapsedPanelIds: stringList(parsed.collapsedPanelIds),
      // Only surface the collapsed-library flag when it was actually stored,
      // mirroring the optional `locale` handling below.
      ...(typeof parsed.libraryCollapsed === "boolean"
        ? { libraryCollapsed: parsed.libraryCollapsed }
        : {}),
      // Only surface a stored language when it's a supported one; otherwise omit
      // the key so callers fall back to browser detection.
      ...(locale ? { locale } : {}),
      ...(typeof parsed.settingsUpdatedAt === "number"
        ? { settingsUpdatedAt: parsed.settingsUpdatedAt }
        : {}),
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

/** The user changed a setting that follows their account (colour format or
 *  language): persist it, stamp it and queue it for sync. No-op when unchanged. */
export function updateSyncedSettings(
  patch: Partial<Pick<Prefs, "colorFormat" | "locale">>,
): void {
  const prefs = getPrefs();
  const next = { ...prefs, ...patch };
  if (next.colorFormat === prefs.colorFormat && next.locale === prefs.locale)
    return;
  setPrefs({ ...next, settingsUpdatedAt: Date.now() });
  void markDirty("settings", SETTINGS_ID);
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
      // v3: cloud sync bookkeeping.
      if (!db.objectStoreNames.contains(OUTBOX_STORE))
        db.createObjectStore(OUTBOX_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(TOMBSTONE_STORE))
        db.createObjectStore(TOMBSTONE_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(SYNC_STORE))
        db.createObjectStore(SYNC_STORE);
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

/** Insert or update a folder (queued for sync). No-op on failure. */
export async function saveFolder(folder: Folder): Promise<void> {
  await putFolder(folder);
  await trackUpsert("folder", folder.id);
}

/** Delete a single folder record, not its contents (queued for sync). */
export async function deleteFolder(id: string): Promise<void> {
  await removeFolder(id);
  await trackDelete("folder", id);
}

// --- Documents -------------------------------------------------------------

/** All documents, or an empty list on any failure. Each document's options are
 *  normalized on read, so legacy records (with a `data` string instead of typed
 *  `contents`) migrate transparently and the rest of the app only sees the
 *  current shape. */
export async function listDocuments(): Promise<QrDocument[]> {
  const raw =
    (
      await withStore<QrDocument[]>(DOC_STORE, "readonly", (s) => s.getAll())
    )?.filter(Boolean) ?? [];
  return raw.map((d) => ({ ...d, options: normalizeOptions(d.options) }));
}

/** Insert or update a document (queued for sync). The logo is forced null — it
 *  lives in the logo store, keyed by the document id. No-op on failure. */
export async function saveDocument(doc: QrDocument): Promise<void> {
  await putDocument(doc);
  await trackUpsert("document", doc.id);
}

/** Delete a single document and its logo (queued for sync). The logo goes with
 *  the document in the cloud too, so only the document deletion is queued. */
export async function deleteDocument(id: string): Promise<void> {
  await removeDocument(id);
  await trackDelete("document", id);
}

/** Longest folder or document name. Mirrors MAX_NAME_LENGTH in
 *  backend/library/models.py (the API rejects longer names). */
export const MAX_NAME_LENGTH = 200;

/** Names are clipped when stored, so every path (rename, "copy" suffixes,
 *  imports) keeps them within what the cloud accepts. */
const clipName = (name: string) => name.slice(0, MAX_NAME_LENGTH);

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
  for (const folderId of doomed) await deleteFolder(folderId);
}

// --- Logos -----------------------------------------------------------------

/** Read a document's logo Blob (the at-rest form), or undefined if none / on any
 *  failure. Used by the library export, which needs the raw bytes and mime. */
export async function loadLogoBlob(docId: string): Promise<Blob | undefined> {
  return withStore<Blob | undefined>(LOGO_STORE, "readonly", (s) =>
    s.get(docId),
  );
}

/** Read a document's logo as a data URL, or null if none / on any failure. */
export async function loadLogo(docId: string): Promise<string | null> {
  const blob = await loadLogoBlob(docId);
  return blob ? fileToDataUrl(blob) : null;
}

/** The ids of every document that has a logo (without reading the blobs). */
export async function listLogoIds(): Promise<Set<string>> {
  const keys = await withStore<IDBValidKey[]>(LOGO_STORE, "readonly", (s) =>
    s.getAllKeys(),
  );
  return new Set((keys ?? []).map(String));
}

/** Store a document's logo Blob directly (queued for sync). No-op on failure.
 *  Used by import, which already holds the Blob, and by {@link saveLogo}. */
export async function saveLogoBlob(docId: string, blob: Blob): Promise<void> {
  await putLogoBlob(docId, blob);
  await markDirty("logo", docId);
}

/** Store a document's logo (a data URL) as a Blob. No-op on failure. */
export async function saveLogo(docId: string, dataUrl: string): Promise<void> {
  let blob: Blob;
  try {
    blob = await (await fetch(dataUrl)).blob();
  } catch {
    return;
  }
  await saveLogoBlob(docId, blob);
}

/** Remove a document's logo (queued for sync). No-op on failure. */
export async function clearLogo(docId: string): Promise<void> {
  await removeLogo(docId);
  await markDirty("logo", docId);
}

/** Copy a document's logo Blob onto another document. No-op if the source has
 *  no logo or on any failure. */
export async function copyLogo(fromId: string, toId: string): Promise<void> {
  const blob = await withStore<Blob | undefined>(LOGO_STORE, "readonly", (s) =>
    s.get(fromId),
  );
  if (blob) await saveLogoBlob(toId, blob);
}

// --- Whole-library reset ---------------------------------------------------

/** Wipe every folder, document, and logo. Used by library import, which then
 *  restores the archive over the empty stores; the wiped records are tombstoned
 *  and the wiped logos queued for removal, so the replacement reaches the cloud
 *  too (a restored document without a logo must lose its cloud logo). No-op on
 *  failure. */
export async function clearLibrary(): Promise<void> {
  const [folders, documents, logoIds] = await Promise.all([
    listFolders(),
    listDocuments(),
    listLogoIds(),
  ]);
  await withStore(FOLDER_STORE, "readwrite", (s) => s.clear());
  await withStore(DOC_STORE, "readwrite", (s) => s.clear());
  await withStore(LOGO_STORE, "readwrite", (s) => s.clear());
  for (const f of folders) await trackDelete("folder", f.id);
  for (const d of documents) await trackDelete("document", d.id);
  for (const id of logoIds) await markDirty("logo", id);
}

/** Erase everything this device knows about the library — records, logos and
 *  sync bookkeeping — without queueing anything for the cloud. Used on sign-out
 *  (the cloud copy stays intact) and before adopting a different account. */
export async function wipeLocalLibrary(): Promise<void> {
  for (const store of [
    FOLDER_STORE,
    DOC_STORE,
    LOGO_STORE,
    OUTBOX_STORE,
    TOMBSTONE_STORE,
    SYNC_STORE,
  ]) {
    await withStore(store, "readwrite", (s) => s.clear());
  }
  // The synced settings now belong to no account: don't push them to the next.
  const { settingsUpdatedAt: _stamp, ...prefs } = getPrefs();
  setPrefs(prefs);
}

// --- Untracked writes --------------------------------------------------------
//
// These change the local library without queueing anything for sync. The sync
// engine applies cloud changes through them (so they aren't echoed back); the
// tracked `save*` / `delete*` / `clearLogo` functions above wrap them.

export async function putFolder(folder: Folder): Promise<void> {
  const record: Folder = { ...folder, name: clipName(folder.name) };
  await withStore(FOLDER_STORE, "readwrite", (s) => s.put(record));
}

export async function removeFolder(id: string): Promise<void> {
  await withStore(FOLDER_STORE, "readwrite", (s) => s.delete(id));
}

export async function putDocument(doc: QrDocument): Promise<void> {
  const record: QrDocument = {
    ...doc,
    name: clipName(doc.name),
    options: { ...doc.options, logo: null },
  };
  await withStore(DOC_STORE, "readwrite", (s) => s.put(record));
}

/** Delete a document and its logo. */
export async function removeDocument(id: string): Promise<void> {
  await withStore(DOC_STORE, "readwrite", (s) => s.delete(id));
  await removeLogo(id);
}

export async function putLogoBlob(docId: string, blob: Blob): Promise<void> {
  await withStore(LOGO_STORE, "readwrite", (s) => s.put(blob, docId));
}

export async function removeLogo(docId: string): Promise<void> {
  await withStore(LOGO_STORE, "readwrite", (s) => s.delete(docId));
}

// --- Sync bookkeeping ------------------------------------------------------

/** What a queued change refers to. `settings` has a single fixed id. */
export type SyncKind = "folder" | "document" | "logo" | "settings";
export const SETTINGS_ID = "settings";

/** A queued local change. `rev` changes on every write, so a sync can tell
 *  whether the entry was re-dirtied while its push was in flight. */
export interface OutboxEntry {
  key: string;
  kind: SyncKind;
  id: string;
  rev: number;
}

/** A locally deleted folder or document, kept until the deletion is pushed. */
export interface Tombstone {
  key: string;
  kind: "folder" | "document";
  id: string;
  deletedAt: number;
}

/** Which account this device's library belongs to, how far it has pulled, and
 *  the content hash of each logo as last synced. */
export interface SyncState {
  userId: string | null;
  cursor: number;
  logoHashes: Record<string, string>;
}

const SYNC_STATE_KEY = "state";
const EMPTY_SYNC_STATE: SyncState = { userId: null, cursor: 0, logoHashes: {} };

/** The outbox / tombstone key of a record. */
export const syncKey = (kind: SyncKind, id: string) => `${kind}:${id}`;

let revCounter = 0;
/** A strictly increasing revision number for outbox entries. */
function nextRev(): number {
  revCounter += 1;
  return Date.now() * 1000 + (revCounter % 1000);
}

const changeListeners = new Set<() => void>();

/** Subscribe to tracked local writes (the sync engine debounces a push on
 *  them). Returns the unsubscribe function. */
export function onLocalChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Queue `kind:id` to be pushed on the next sync. */
export async function markDirty(kind: SyncKind, id: string): Promise<void> {
  const entry: OutboxEntry = {
    key: syncKey(kind, id),
    kind,
    id,
    rev: nextRev(),
  };
  await withStore(OUTBOX_STORE, "readwrite", (s) => s.put(entry));
  for (const listener of changeListeners) listener();
}

async function trackUpsert(kind: "folder" | "document", id: string) {
  await clearTombstone(kind, id);
  await markDirty(kind, id);
}

async function trackDelete(kind: "folder" | "document", id: string) {
  const tombstone: Tombstone = {
    key: syncKey(kind, id),
    kind,
    id,
    deletedAt: Date.now(),
  };
  await withStore(TOMBSTONE_STORE, "readwrite", (s) => s.put(tombstone));
  await markDirty(kind, id);
}

/** Every queued change, oldest first. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const entries =
    (await withStore<OutboxEntry[]>(OUTBOX_STORE, "readonly", (s) =>
      s.getAll(),
    )) ?? [];
  return entries.sort((a, b) => a.rev - b.rev);
}

/** Drop pushed entries — but only those not re-dirtied since they were read. */
export async function settleOutbox(pushed: OutboxEntry[]): Promise<void> {
  const current = new Map((await listOutbox()).map((e) => [e.key, e.rev]));
  const settled = pushed.filter((e) => current.get(e.key) === e.rev);
  if (settled.length === 0) return;
  // One transaction for the whole batch.
  await withStore(OUTBOX_STORE, "readwrite", (s) => {
    for (const entry of settled.slice(1)) s.delete(entry.key);
    return s.delete(settled[0].key);
  });
}

/** Every pending deletion. */
export async function listTombstones(): Promise<Tombstone[]> {
  return (
    (await withStore<Tombstone[]>(TOMBSTONE_STORE, "readonly", (s) =>
      s.getAll(),
    )) ?? []
  );
}

/** Forget a tombstone once the deletion has been pushed (or superseded). */
export async function clearTombstone(
  kind: "folder" | "document",
  id: string,
): Promise<void> {
  await withStore(TOMBSTONE_STORE, "readwrite", (s) =>
    s.delete(syncKey(kind, id)),
  );
}

/** This device's sync state (defaults for a library never synced). */
export async function getSyncState(): Promise<SyncState> {
  const stored = await withStore<SyncState | undefined>(
    SYNC_STORE,
    "readonly",
    (s) => s.get(SYNC_STATE_KEY),
  );
  return {
    ...EMPTY_SYNC_STATE,
    ...stored,
    logoHashes: { ...stored?.logoHashes },
  };
}

/** Merge `patch` into the stored sync state. */
export async function updateSyncState(
  patch: Partial<SyncState>,
): Promise<void> {
  const next = { ...(await getSyncState()), ...patch };
  await withStore(SYNC_STORE, "readwrite", (s) => s.put(next, SYNC_STATE_KEY));
}

// --- Legacy migration ------------------------------------------------------

/** Merge a raw stored options object over the defaults, migrate any legacy
 *  fields, validate the typed content drafts, and snap unknown enum values back
 *  to their defaults. The logo is always cleared. */
export function normalizeOptions(raw: unknown): QrOptions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const merged: QrOptions = { ...DEFAULT_OPTIONS, ...(r as object) };
  const base = defaultContents(FALLBACK_COUNTRY);

  // Legacy single-string `data` -> a typed draft of the matching type.
  let rawContents = (r.contents ?? {}) as Partial<ContentDrafts>;
  if (!("contents" in r) && typeof r.data === "string") {
    const content = legacyDataToContent(r.data);
    merged.contentType = content.type;
    rawContents = { [content.type]: content } as Partial<ContentDrafts>;
  }

  if (!CONTENT_TYPES.includes(merged.contentType))
    merged.contentType = DEFAULT_OPTIONS.contentType;
  merged.contents = Object.fromEntries(
    CONTENT_TYPES.map((t) => [t, normalizeContent(rawContents[t], base[t])]),
  ) as ContentDrafts;
  delete (merged as unknown as Record<string, unknown>).data;

  if (!DOT_STYLES.includes(merged.dotStyle))
    merged.dotStyle = DEFAULT_OPTIONS.dotStyle;
  if (!EYE_STYLES.includes(merged.eyeStyle))
    merged.eyeStyle = DEFAULT_OPTIONS.eyeStyle;
  if (!EC_SETTINGS.includes(merged.errorCorrection))
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
    collapsedPanelIds: [],
    colorFormat: COLOR_FORMATS.includes(parsed.colorFormat as ColorFormat)
      ? (parsed.colorFormat as ColorFormat)
      : "hex",
    lastOpenedDocId: doc.id,
  });
  removeLegacyState();
  return doc.id;
}
