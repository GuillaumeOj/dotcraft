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
  type SyncResponse,
  uploadLogo,
} from "../api/library";
import {
  clearLogo,
  clearTombstone,
  deleteDocument,
  deleteFolder,
  getPrefs,
  getSyncState,
  listDocuments,
  listFolders,
  listOutbox,
  listTombstones,
  loadLogoBlob,
  markDirty,
  type OutboxEntry,
  SETTINGS_ID,
  type SyncState,
  saveDocument,
  saveFolder,
  saveLogoBlob,
  setPrefs,
  settleOutbox,
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

function merge(a: RemoteChanges, b: RemoteChanges): RemoteChanges {
  return {
    library: a.library || b.library,
    documentIds: [...new Set([...a.documentIds, ...b.documentIds])],
    settings: b.settings ?? a.settings,
  };
}

const tombstoneKey = (kind: "folder" | "document", id: string) =>
  `${kind}:${id}`;

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

/** When the local copy of a record was last written (or deleted), or -1. */
function localStamp(
  local: LocalLibrary,
  kind: "folder" | "document",
  id: string,
): number {
  const record =
    kind === "folder" ? local.folders.get(id) : local.documents.get(id);
  return (
    record?.updatedAt ??
    local.tombstones.get(tombstoneKey(kind, id))?.deletedAt ??
    -1
  );
}

async function applyFolder(
  local: LocalLibrary,
  remote: RemoteFolder,
): Promise<boolean> {
  if (remote.updatedAt <= localStamp(local, "folder", remote.id)) return false;
  if (remote.deletedAt !== null) {
    if (local.folders.has(remote.id))
      await deleteFolder(remote.id, { track: false });
  } else {
    const { deletedAt: _deleted, ...folder } = remote;
    await saveFolder(folder, { track: false });
  }
  await clearTombstone("folder", remote.id);
  return true;
}

async function applyDocument(
  local: LocalLibrary,
  remote: RemoteDocument,
): Promise<boolean> {
  if (remote.updatedAt <= localStamp(local, "document", remote.id))
    return false;
  if (remote.deletedAt !== null) {
    if (local.documents.has(remote.id))
      await deleteDocument(remote.id, { track: false });
  } else {
    const doc: QrDocument = {
      id: remote.id,
      name: remote.name,
      folderId: remote.folderId,
      options: remote.options as unknown as QrDocument["options"],
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
    };
    await saveDocument(doc, { track: false });
  }
  await clearTombstone("document", remote.id);
  return true;
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
      const blob = await downloadLogo(remote.id);
      await saveLogoBlob(remote.id, blob, { track: false });
      state.logoHashes[remote.id] = wanted;
    } else {
      await clearLogo(remote.id, { track: false });
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
  setPrefs(
    {
      ...prefs,
      colorFormat: remote.colorFormat ?? prefs.colorFormat,
      ...(remote.locale ? { locale: remote.locale } : {}),
      settingsUpdatedAt: remote.updatedAt,
    },
    { track: false },
  );
  return remote;
}

/** Apply one pulled page to the local library. */
async function applyResponse(
  response: SyncResponse,
  state: SyncState,
  dirtyLogos: Set<string>,
): Promise<RemoteChanges> {
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
  return {
    library: library || logoIds.length > 0,
    documentIds: [...new Set([...documentIds, ...logoIds])],
    settings: applySettings(response.settings),
  };
}

function folderChange(
  local: LocalLibrary,
  id: string,
): FolderChange | undefined {
  const folder = local.folders.get(id);
  if (folder) return folder;
  const tomb = local.tombstones.get(tombstoneKey("folder", id));
  return tomb && { id, updatedAt: tomb.deletedAt, deletedAt: tomb.deletedAt };
}

function documentChange(
  local: LocalLibrary,
  id: string,
): DocumentChange | undefined {
  const doc = local.documents.get(id);
  if (doc) return { ...doc, options: { ...doc.options, logo: null } };
  const tomb = local.tombstones.get(tombstoneKey("document", id));
  return tomb && { id, updatedAt: tomb.deletedAt, deletedAt: tomb.deletedAt };
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

/** Push queued logo changes. A 404 means the document is gone (or not in the
 *  cloud yet); the change is dropped either way. */
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
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }
}

/** Pull every page after `cursor`, pushing `first` along with the first page. */
async function pullAll(
  state: SyncState,
  first: {
    folders: FolderChange[];
    documents: DocumentChange[];
    settings: RemoteSettings | null;
  },
  dirtyLogos: Set<string>,
): Promise<RemoteChanges> {
  let changes = NO_CHANGES;
  let payload = { cursor: state.cursor, ...first };
  for (;;) {
    const response = await postSync(payload);
    changes = merge(changes, await applyResponse(response, state, dirtyLogos));
    state.cursor = response.cursor;
    if (!response.hasMore) return changes;
    payload = {
      cursor: state.cursor,
      folders: [],
      documents: [],
      settings: null,
    };
  }
}

/** Push local changes and pull remote ones. No-op until an account has been
 *  adopted. Throws {@link ApiError} when the API can't be reached. */
export async function syncOnce(): Promise<RemoteChanges> {
  const state = await getSyncState();
  if (!state.userId) return NO_CHANGES;

  const entries = await listOutbox();
  const local = await readLocal();
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
    if (entry.kind !== "folder" && entry.kind !== "document") continue;
    const tomb = local.tombstones.get(tombstoneKey(entry.kind, entry.id));
    if (tomb) await clearTombstone(entry.kind, entry.id);
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
async function isPristineStarter(
  folders: Folder[],
  documents: QrDocument[],
): Promise<boolean> {
  if (folders.length !== 1 || documents.length !== 1) return false;
  const [folder] = folders;
  const [doc] = documents;
  return (
    folder.parentId === null &&
    doc.folderId === folder.id &&
    folder.updatedAt === folder.createdAt &&
    doc.updatedAt === doc.createdAt &&
    !(await loadLogoBlob(doc.id))
  );
}

/** Queue every local record, logo and synced setting for upload. */
async function enqueueEverything(folders: Folder[], documents: QrDocument[]) {
  for (const folder of folders) await markDirty("folder", folder.id);
  for (const doc of documents) {
    await markDirty("document", doc.id);
    if (await loadLogoBlob(doc.id)) await markDirty("logo", doc.id);
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

  const folders = await listFolders();
  const documents = await listDocuments();
  const pristine = await isPristineStarter(folders, documents);

  // Pull the whole cloud copy first, without pushing anything yet.
  const state: SyncState = { userId, cursor: 0, logoHashes: {} };
  const changes = await pullAll(
    state,
    { folders: [], documents: [], settings: null },
    new Set(),
  );

  const cloudHasDocuments = (await listDocuments()).some(
    (d) => !documents.some((local) => local.id === d.id),
  );
  if (pristine && cloudHasDocuments) {
    await deleteDocument(documents[0].id, { track: false });
    await deleteFolder(folders[0].id, { track: false });
    await settleOutbox(await listOutbox());
  } else {
    await enqueueEverything(folders, documents);
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
