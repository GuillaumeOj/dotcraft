/** Cloud sync of the local library (framework-agnostic).
 *
 *  - {@link adoptAccount} binds this device's library to the signed-in account.
 *    The first time, it pulls the cloud copy, merges it with the local one
 *    (last write wins), and queues every local record so the existing library
 *    is uploaded. An untouched starter project is dropped instead when the
 *    account already has QR codes, so it doesn't pile up on every new device.
 *  - {@link syncOnce} pushes the queued changes (records, tombstones, settings,
 *    logos) and pulls everything changed in the cloud since the last cursor.
 *
 *  Conflicts resolve per record on `updatedAt`: the newer write wins, deletions
 *  included. Remote changes are written with `{ track: false }` so they aren't
 *  echoed back, and reported to the caller so the UI can refresh. */

import { ApiError } from "../api/client";
import {
  type DocumentChange,
  deleteLogo,
  downloadLogo,
  type FolderChange,
  postSync,
  type RemoteDocument,
  type RemoteFolder,
  type RemoteSettings,
  type SyncPayload,
  type SyncResponse,
  uploadLogo,
} from "../api/library";
import {
  clearTombstone,
  getPrefs,
  getSyncState,
  listDocuments,
  listFolders,
  listLogoIds,
  listOutbox,
  listTombstones,
  loadLogoBlob,
  markDirty,
  normalizeOptions,
  type OutboxEntry,
  putDocument,
  putFolder,
  putLogoBlob,
  removeDocument,
  removeFolder,
  removeLogo,
  SETTINGS_ID,
  type SyncState,
  setPrefs,
  settleOutbox,
  syncKey,
  type Tombstone,
  updateSyncState,
  wipeLocalLibrary,
} from "../qr/storage";
import type { Folder, QrDocument } from "../qr/types";

/** What changed locally because of the cloud, so the UI can catch up. */
export interface RemoteChanges {
  /** Folders or documents were added, changed or removed. */
  library: boolean;
  /** Documents whose options or logo changed. */
  documentIds: string[];
  /** Settings adopted from the cloud, if any. */
  settings: RemoteSettings | null;
}

const NO_CHANGES: RemoteChanges = {
  library: false,
  documentIds: [],
  settings: null,
};

/** A push with nothing in it (used to pull only). */
const EMPTY_PUSH: Omit<SyncPayload, "cursor"> = {
  folders: [],
  documents: [],
  settings: null,
};

function merge(a: RemoteChanges, b: RemoteChanges): RemoteChanges {
  return {
    library: a.library || b.library,
    documentIds: [...new Set([...a.documentIds, ...b.documentIds])],
    settings: b.settings ?? a.settings,
  };
}

type RecordKind = "folder" | "document";

/** A snapshot of the local library, indexed for the LWW comparisons. */
interface LocalLibrary {
  folders: Map<string, Folder>;
  documents: Map<string, QrDocument>;
  tombstones: Map<string, Tombstone>;
}

async function readLocal(): Promise<LocalLibrary> {
  const [folders, documents, tombstones] = await Promise.all([
    listFolders(),
    listDocuments(),
    listTombstones(),
  ]);
  return {
    folders: new Map(folders.map((f) => [f.id, f])),
    documents: new Map(documents.map((d) => [d.id, d])),
    tombstones: new Map(tombstones.map((t) => [t.key, t])),
  };
}

const recordsOf = (local: LocalLibrary, kind: RecordKind) =>
  kind === "folder" ? local.folders : local.documents;

/** When the local copy of a record was last written (or deleted), or -1. */
function localStamp(local: LocalLibrary, kind: RecordKind, id: string): number {
  return (
    recordsOf(local, kind).get(id)?.updatedAt ??
    local.tombstones.get(syncKey(kind, id))?.deletedAt ??
    -1
  );
}

/** Apply one pulled record if it is newer than the local copy (last write
 *  wins). Returns whether anything changed. */
async function applyRecord(
  local: LocalLibrary,
  kind: RecordKind,
  remote: RemoteFolder | RemoteDocument,
  put: () => Promise<void>,
  remove: (id: string) => Promise<void>,
): Promise<boolean> {
  if (remote.updatedAt <= localStamp(local, kind, remote.id)) return false;
  if (remote.deletedAt === null) await put();
  else if (recordsOf(local, kind).has(remote.id)) await remove(remote.id);
  if (local.tombstones.has(syncKey(kind, remote.id)))
    await clearTombstone(kind, remote.id);
  return true;
}

function applyFolder(local: LocalLibrary, remote: RemoteFolder) {
  const { deletedAt: _deleted, ...folder } = remote;
  return applyRecord(
    local,
    "folder",
    remote,
    () => putFolder(folder),
    removeFolder,
  );
}

function applyDocument(local: LocalLibrary, remote: RemoteDocument) {
  const { deletedAt: _d, logoHash: _h, logoMime: _m, ...doc } = remote;
  return applyRecord(
    local,
    "document",
    remote,
    () =>
      putDocument({
        ...doc,
        folderId: doc.folderId ?? "",
        // One canonical options shape, whatever the server sent.
        options: normalizeOptions(doc.options),
      }),
    removeDocument,
  );
}

/** Bring each pulled document's logo in line with the cloud, unless the local
 *  logo has unpushed changes (those win and are uploaded instead). Returns the
 *  ids whose logo changed. */
async function applyLogos(
  documents: RemoteDocument[],
  state: SyncState,
  dirtyLogos: Set<string>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const remote of documents) {
    if (dirtyLogos.has(remote.id)) continue;
    const known = state.logoHashes[remote.id] ?? null;
    const wanted = remote.deletedAt === null ? remote.logoHash : null;
    if (wanted === known) continue;
    if (wanted) {
      await putLogoBlob(remote.id, await downloadLogo(remote.id));
      state.logoHashes[remote.id] = wanted;
    } else {
      await removeLogo(remote.id);
      delete state.logoHashes[remote.id];
    }
    changed.push(remote.id);
  }
  return changed;
}

function applySettings(remote: RemoteSettings | null): RemoteSettings | null {
  if (!remote) return null;
  const prefs = getPrefs();
  if (remote.updatedAt <= (prefs.settingsUpdatedAt ?? 0)) return null;
  setPrefs({
    ...prefs,
    colorFormat: remote.colorFormat ?? prefs.colorFormat,
    ...(remote.locale ? { locale: remote.locale } : {}),
    settingsUpdatedAt: remote.updatedAt,
  });
  return remote;
}

/** Apply one pulled page to the local library. */
async function applyResponse(
  response: SyncResponse,
  state: SyncState,
  dirtyLogos: Set<string>,
): Promise<RemoteChanges> {
  const settings = applySettings(response.settings);
  if (response.folders.length === 0 && response.documents.length === 0)
    return { ...NO_CHANGES, settings };

  const local = await readLocal();
  let library = false;
  const documentIds: string[] = [];
  for (const folder of response.folders) {
    if (await applyFolder(local, folder)) library = true;
  }
  for (const doc of response.documents) {
    if (await applyDocument(local, doc)) {
      library = true;
      documentIds.push(doc.id);
    }
  }
  const logoIds = await applyLogos(response.documents, state, dirtyLogos);
  return merge(
    { library, documentIds, settings },
    { library: logoIds.length > 0, documentIds: logoIds, settings: null },
  );
}

/** A queued deletion, as the tombstone the API expects. */
function tombstoneChange(local: LocalLibrary, kind: RecordKind, id: string) {
  const tomb = local.tombstones.get(syncKey(kind, id));
  return tomb && { id, updatedAt: tomb.deletedAt, deletedAt: tomb.deletedAt };
}

function folderChange(
  local: LocalLibrary,
  id: string,
): FolderChange | undefined {
  return local.folders.get(id) ?? tombstoneChange(local, "folder", id);
}

function documentChange(
  local: LocalLibrary,
  id: string,
): DocumentChange | undefined {
  return local.documents.get(id) ?? tombstoneChange(local, "document", id);
}

function settingsChange(): RemoteSettings | null {
  const prefs = getPrefs();
  if (prefs.settingsUpdatedAt === undefined) return null;
  return {
    locale: prefs.locale ?? null,
    colorFormat: prefs.colorFormat,
    updatedAt: prefs.settingsUpdatedAt,
  };
}

/** Logo upload answers that mean "drop this change": 404, the document is gone
 *  (or not in the cloud yet); 400, the API refuses the image (too large or of
 *  an unsupported type). Either way it must not block every later sync. */
const DROPPED_LOGO_STATUSES = [400, 404];

/** Push queued logo changes. */
async function pushLogos(
  entries: OutboxEntry[],
  local: LocalLibrary,
  state: SyncState,
) {
  for (const entry of entries) {
    if (!local.documents.has(entry.id)) continue;
    try {
      const blob = await loadLogoBlob(entry.id);
      if (blob) {
        state.logoHashes[entry.id] = (
          await uploadLogo(entry.id, blob)
        ).logoHash;
      } else {
        await deleteLogo(entry.id);
        delete state.logoHashes[entry.id];
      }
    } catch (err) {
      if (
        !(err instanceof ApiError) ||
        !DROPPED_LOGO_STATUSES.includes(err.status)
      )
        throw err;
    }
  }
}

/** Pull every page after `cursor`, pushing `first` along with the first page. */
async function pullAll(
  state: SyncState,
  first: Omit<SyncPayload, "cursor">,
  dirtyLogos: Set<string>,
): Promise<RemoteChanges> {
  let changes = NO_CHANGES;
  let payload: SyncPayload = { cursor: state.cursor, ...first };
  for (;;) {
    const response = await postSync(payload);
    changes = merge(changes, await applyResponse(response, state, dirtyLogos));
    state.cursor = response.cursor;
    if (!response.hasMore) return changes;
    payload = { cursor: state.cursor, ...EMPTY_PUSH };
  }
}

const EMPTY_LOCAL: LocalLibrary = {
  folders: new Map(),
  documents: new Map(),
  tombstones: new Map(),
};

/** Most queued changes pushed in one request. Mirrors MAX_BATCH in
 *  backend/library/serializers.py, which caps each list; counting every kind
 *  against it is a deliberate over-approximation. */
export const MAX_PUSH = 1000;

/** Push local changes and pull remote ones. No-op until an account has been
 *  adopted. Throws {@link ApiError} when the API can't be reached. */
export async function syncOnce(): Promise<RemoteChanges> {
  const state = await getSyncState();
  if (!state.userId) return NO_CHANGES;

  // A large outbox (e.g. a big library on first sign-in) goes up in batches.
  const outbox = await listOutbox();
  let changes = NO_CHANGES;
  // Always at least one round-trip: an idle poll still pulls.
  for (let i = 0; i === 0 || i < outbox.length; i += MAX_PUSH) {
    const batch = outbox.slice(i, i + MAX_PUSH);
    changes = merge(changes, await syncBatch(state, batch));
  }
  return changes;
}

/** Push `entries` (possibly none), pull what changed, and settle them. */
async function syncBatch(
  state: SyncState,
  entries: OutboxEntry[],
): Promise<RemoteChanges> {
  // An idle poll (nothing queued) doesn't need to read the library.
  const local = entries.length > 0 ? await readLocal() : EMPTY_LOCAL;
  const byKind = (kind: OutboxEntry["kind"]) =>
    entries.filter((e) => e.kind === kind);
  const folders = byKind("folder")
    .map((e) => folderChange(local, e.id))
    .filter((c): c is FolderChange => c !== undefined);
  const documents = byKind("document")
    .map((e) => documentChange(local, e.id))
    .filter((c): c is DocumentChange => c !== undefined);
  const settings = byKind("settings").length > 0 ? settingsChange() : null;
  const logoEntries = byKind("logo");

  const changes = await pullAll(
    state,
    { folders, documents, settings },
    new Set(logoEntries.map((e) => e.id)),
  );

  // Pushed deletions are recorded in the cloud now.
  for (const entry of entries) {
    const tomb = local.tombstones.get(entry.key);
    if (tomb) await clearTombstone(tomb.kind, tomb.id);
  }
  await pushLogos(logoEntries, local, state);
  await settleOutbox(entries);
  await updateSyncState({
    cursor: state.cursor,
    logoHashes: state.logoHashes,
  });
  return changes;
}

/** True when the only local content is the untouched starter project seeded on
 *  first run (one folder, one never-edited document, no logo). */
function isPristineStarter(
  folders: Folder[],
  documents: QrDocument[],
  logoIds: Set<string>,
): boolean {
  if (folders.length !== 1 || documents.length !== 1) return false;
  const [folder] = folders;
  const [doc] = documents;
  return (
    folder.parentId === null &&
    doc.folderId === folder.id &&
    folder.updatedAt === folder.createdAt &&
    doc.updatedAt === doc.createdAt &&
    !logoIds.has(doc.id)
  );
}

/** Queue every local record, logo and synced setting for upload. */
async function enqueueEverything(
  folders: Folder[],
  documents: QrDocument[],
  logoIds: Set<string>,
) {
  for (const folder of folders) await markDirty("folder", folder.id);
  for (const doc of documents) {
    await markDirty("document", doc.id);
    if (logoIds.has(doc.id)) await markDirty("logo", doc.id);
  }
  if (getPrefs().settingsUpdatedAt !== undefined)
    await markDirty("settings", SETTINGS_ID);
}

/** Bind this device's library to `userId`, merging it with the cloud copy the
 *  first time. Safe to call on every sign-in. */
export async function adoptAccount(userId: string): Promise<RemoteChanges> {
  const current = await getSyncState();
  if (current.userId === userId) return NO_CHANGES;

  let wiped = false;
  if (current.userId !== null) {
    // Another account's library is still here (its session expired rather than
    // being signed out): never merge it into this account.
    await wipeLocalLibrary();
    wiped = true;
  }

  const [folders, documents, logoIds] = await Promise.all([
    listFolders(),
    listDocuments(),
    listLogoIds(),
  ]);
  const pristine = isPristineStarter(folders, documents, logoIds);

  // Pull the whole cloud copy first, without pushing anything yet.
  const state: SyncState = { userId, cursor: 0, logoHashes: {} };
  const changes = await pullAll(state, EMPTY_PUSH, new Set());

  const localIds = new Set(documents.map((d) => d.id));
  const cloudHasDocuments = (await listDocuments()).some(
    (d) => !localIds.has(d.id),
  );
  if (pristine && cloudHasDocuments) {
    await removeDocument(documents[0].id);
    await removeFolder(folders[0].id);
    // Forget the starter's queued records (anything else still goes up).
    const starter = new Set([documents[0].id, folders[0].id]);
    await settleOutbox((await listOutbox()).filter((e) => starter.has(e.id)));
  } else {
    await enqueueEverything(folders, documents, logoIds);
  }

  await updateSyncState(state);
  return {
    ...changes,
    library: changes.library || wiped || (pristine && cloudHasDocuments),
  };
}

/** Whether local changes are still waiting to be pushed. */
export async function hasPendingChanges(): Promise<boolean> {
  return (await listOutbox()).length > 0;
}
