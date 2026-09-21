import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type {
  RemoteDocument,
  RemoteFolder,
  SyncPayload,
  SyncResponse,
} from "../api/library";
import * as api from "../api/library";
import {
  deleteDocument,
  deleteFolderTree,
  getPrefs,
  getSyncState,
  listDocuments,
  listFolders,
  listOutbox,
  listTombstones,
  loadLogoBlob,
  markDirty,
  putDocument,
  putFolder,
  putLogoBlob,
  saveDocument,
  saveFolder,
  saveLogoBlob,
  setPrefs,
  updateSyncedSettings,
  updateSyncState,
} from "../qr/storage";
import { DEFAULT_OPTIONS, type Folder, type QrDocument } from "../qr/types";
import { resetDb } from "../test/db";
import { adoptAccount, hasPendingChanges, MAX_PUSH, syncOnce } from "./engine";

vi.mock("../api/library", () => ({
  postSync: vi.fn(),
  uploadLogo: vi.fn(),
  downloadLogo: vi.fn(),
  deleteLogo: vi.fn(),
}));
const postSync = vi.mocked(api.postSync);
const uploadLogo = vi.mocked(api.uploadLogo);
const downloadLogo = vi.mocked(api.downloadLogo);
const deleteLogo = vi.mocked(api.deleteLogo);

const folder = (over: Partial<Folder> = {}): Folder => ({
  id: "f1",
  name: "Project",
  parentId: null,
  createdAt: 100,
  updatedAt: 100,
  ...over,
});
const doc = (over: Partial<QrDocument> = {}): QrDocument => ({
  id: "d1",
  name: "QR",
  folderId: "f1",
  options: { ...DEFAULT_OPTIONS },
  createdAt: 100,
  updatedAt: 100,
  ...over,
});
const remoteFolder = (over: Partial<RemoteFolder> = {}): RemoteFolder => ({
  ...folder(),
  deletedAt: null,
  ...over,
});
const remoteDoc = (over: Partial<RemoteDocument> = {}): RemoteDocument => ({
  ...doc(),
  options: { dotStyle: "dots" },
  deletedAt: null,
  logoHash: null,
  logoMime: null,
  ...over,
});
const response = (over: Partial<SyncResponse> = {}): SyncResponse => ({
  cursor: 10,
  folders: [],
  documents: [],
  settings: null,
  rejected: [],
  hasMore: false,
  ...over,
});
const lastPayload = (): SyncPayload =>
  postSync.mock.calls[postSync.mock.calls.length - 1][0];

/** Pretend this device already belongs to account u1, with nothing pending. */
async function adopted(cursor = 5) {
  await updateSyncState({ userId: "u1", cursor, logoHashes: {} });
}

beforeEach(async () => {
  await resetDb();
  postSync.mockReset().mockResolvedValue(response());
  uploadLogo.mockReset();
  downloadLogo.mockReset();
  deleteLogo.mockReset().mockResolvedValue(undefined);
});

describe("syncOnce", () => {
  it("does nothing until an account is adopted", async () => {
    await saveFolder(folder());

    expect(await syncOnce()).toEqual({
      library: false,
      documentIds: [],
      settings: null,
    });
    expect(postSync).not.toHaveBeenCalled();
    expect(await hasPendingChanges()).toBe(true);
  });

  it("pushes queued records and settles the outbox", async () => {
    await adopted();
    await saveFolder(folder());
    await saveDocument(doc());

    await syncOnce();

    const payload = lastPayload();
    expect(payload.cursor).toBe(5);
    expect(payload.folders).toEqual([folder()]);
    expect(payload.documents).toEqual([
      { ...doc(), options: { ...doc().options, logo: null } },
    ]);
    expect(payload.settings).toBeNull();
    expect(await hasPendingChanges()).toBe(false);
    expect((await getSyncState()).cursor).toBe(10);
  });

  it("pushes a large outbox in batches the API accepts", async () => {
    await adopted();
    for (let i = 0; i <= MAX_PUSH; i++)
      await saveFolder(folder({ id: `f${i}` }));

    await syncOnce();

    expect(postSync).toHaveBeenCalledTimes(2);
    expect(postSync.mock.calls[0][0].folders).toHaveLength(MAX_PUSH);
    expect(postSync.mock.calls[1][0].folders).toHaveLength(1);
    expect(await hasPendingChanges()).toBe(false);
  });

  it("never pushes names longer than the API accepts", async () => {
    await adopted();
    await saveFolder(folder({ name: "x".repeat(300) }));
    await saveDocument(doc({ name: "y".repeat(300) }));

    await syncOnce();

    const payload = lastPayload();
    expect(payload.folders[0]).toMatchObject({ name: "x".repeat(200) });
    expect(payload.documents[0]).toMatchObject({ name: "y".repeat(200) });
  });

  it("pushes deletions as tombstones, then forgets them", async () => {
    await saveFolder(folder());
    await saveDocument(doc());
    await adopted();
    await deleteFolderTree("f1", [folder()], [doc()]);
    expect(await listTombstones()).toHaveLength(2);

    await syncOnce();

    const payload = lastPayload();
    expect(payload.folders).toEqual([
      {
        id: "f1",
        updatedAt: expect.any(Number),
        deletedAt: expect.any(Number),
      },
    ]);
    expect(payload.documents[0]).toMatchObject({ id: "d1" });
    expect(await listTombstones()).toEqual([]);
    expect(await hasPendingChanges()).toBe(false);
  });

  it("drops queued entries whose record vanished without a tombstone", async () => {
    await adopted();
    await markDirty("folder", "ghost");

    await syncOnce();

    expect(lastPayload().folders).toEqual([]);
    expect(await hasPendingChanges()).toBe(false);
  });

  it("keeps entries re-dirtied while the push was in flight", async () => {
    await adopted();
    await saveFolder(folder());
    postSync.mockImplementationOnce(async () => {
      await saveFolder(folder({ name: "Edited meanwhile", updatedAt: 200 }));
      return response();
    });

    await syncOnce();

    expect(await listOutbox()).toHaveLength(1);
  });

  it("applies newer remote records and ignores older ones", async () => {
    await putFolder(folder({ updatedAt: 500 }));
    await putDocument(doc({ updatedAt: 100 }));
    await adopted();
    postSync.mockResolvedValueOnce(
      response({
        folders: [remoteFolder({ name: "Stale", updatedAt: 400 })],
        documents: [remoteDoc({ name: "Fresh", updatedAt: 300 })],
      }),
    );

    const changes = await syncOnce();

    expect(changes).toEqual({
      library: true,
      documentIds: ["d1"],
      settings: null,
    });
    expect((await listFolders())[0].name).toBe("Project");
    const [stored] = await listDocuments();
    expect(stored.name).toBe("Fresh");
    expect(stored.options.dotStyle).toBe("dots");
    // Applying remote changes never queues them back.
    expect(await hasPendingChanges()).toBe(false);
  });

  it("applies remote deletions newer than the local copy", async () => {
    await putFolder(folder());
    await putDocument(doc());
    await putLogoBlob("d1", new Blob(["x"]));
    await adopted();
    postSync.mockResolvedValueOnce(
      response({
        folders: [remoteFolder({ updatedAt: 900, deletedAt: 900 })],
        documents: [remoteDoc({ updatedAt: 900, deletedAt: 900 })],
      }),
    );

    await syncOnce();

    expect(await listFolders()).toEqual([]);
    expect(await listDocuments()).toEqual([]);
    expect(await loadLogoBlob("d1")).toBeUndefined();
  });

  it("ignores remote tombstones of records it never had and older than its own", async () => {
    await adopted();
    await saveFolder(folder({ id: "f2", updatedAt: 50 }));
    await deleteDocument("d9");
    postSync.mockResolvedValueOnce(
      response({
        folders: [remoteFolder({ id: "f3", updatedAt: 1, deletedAt: 1 })],
        documents: [
          remoteDoc({ id: "d9", name: "Old", updatedAt: 1, deletedAt: null }),
        ],
      }),
    );

    await syncOnce();

    // f3 is unknown locally: its tombstone is applied as a no-op.
    expect((await listFolders()).map((f) => f.id)).toEqual(["f2"]);
    // d9 was deleted here after the remote edit: the deletion wins.
    expect(await listDocuments()).toEqual([]);
  });

  it("follows pagination until the server has nothing more", async () => {
    await adopted();
    postSync
      .mockResolvedValueOnce(
        response({ cursor: 7, hasMore: true, folders: [remoteFolder()] }),
      )
      .mockResolvedValueOnce(
        response({
          cursor: 9,
          folders: [remoteFolder({ id: "f2", name: "Second" })],
        }),
      );

    await syncOnce();

    expect(postSync).toHaveBeenCalledTimes(2);
    expect(lastPayload()).toEqual({
      cursor: 7,
      folders: [],
      documents: [],
      settings: null,
    });
    expect(await listFolders()).toHaveLength(2);
    expect((await getSyncState()).cursor).toBe(9);
  });

  describe("settings", () => {
    it("pushes the colour format and language once changed", async () => {
      await adopted();
      updateSyncedSettings({ colorFormat: "rgb", locale: "fr" });
      await vi.waitFor(async () =>
        expect(await hasPendingChanges()).toBe(true),
      );

      await syncOnce();

      expect(lastPayload().settings).toEqual({
        locale: "fr",
        colorFormat: "rgb",
        updatedAt: getPrefs().settingsUpdatedAt,
      });
    });

    it("sends nothing for a queued entry without a stamp", async () => {
      await adopted();
      await markDirty("settings", "settings");

      await syncOnce();

      expect(lastPayload().settings).toBeNull();
    });

    it("adopts newer remote settings without re-queueing them", async () => {
      await adopted();
      postSync.mockResolvedValueOnce(
        response({
          settings: { locale: "de", colorFormat: "hsl", updatedAt: 999 },
        }),
      );

      const changes = await syncOnce();

      expect(changes.settings).toEqual({
        locale: "de",
        colorFormat: "hsl",
        updatedAt: 999,
      });
      expect(getPrefs()).toMatchObject({
        locale: "de",
        colorFormat: "hsl",
        settingsUpdatedAt: 999,
      });
      expect(await hasPendingChanges()).toBe(false);
    });

    it("keeps local settings that are newer, and a missing remote locale", async () => {
      await adopted();
      setPrefs({ ...getPrefs(), colorFormat: "rgb", settingsUpdatedAt: 5000 });
      postSync
        .mockResolvedValueOnce(
          response({
            settings: { locale: "de", colorFormat: "hsl", updatedAt: 10 },
          }),
        )
        .mockResolvedValueOnce(
          response({
            settings: { locale: null, colorFormat: null, updatedAt: 9000 },
          }),
        );

      expect((await syncOnce()).settings).toBeNull();
      expect(getPrefs().colorFormat).toBe("rgb");

      await syncOnce();
      expect(getPrefs()).toMatchObject({ colorFormat: "rgb" });
      expect(getPrefs().locale).toBeUndefined();
    });
  });

  describe("logos", () => {
    it("uploads a changed logo and remembers its hash", async () => {
      await putDocument(doc());
      await adopted();
      await saveLogoBlob("d1", new Blob(["png"], { type: "image/png" }));
      uploadLogo.mockResolvedValue({ logoHash: "h1", logoMime: "image/png" });

      await syncOnce();

      // (fake-indexeddb clones blobs into plain objects, so don't check the type)
      expect(uploadLogo).toHaveBeenCalledWith("d1", expect.anything());
      expect((await getSyncState()).logoHashes).toEqual({ d1: "h1" });
      expect(await hasPendingChanges()).toBe(false);
    });

    it("deletes a removed logo remotely", async () => {
      await putDocument(doc());
      await updateSyncState({
        userId: "u1",
        cursor: 5,
        logoHashes: { d1: "h1" },
      });
      await markDirty("logo", "d1");

      await syncOnce();

      expect(deleteLogo).toHaveBeenCalledWith("d1");
      expect((await getSyncState()).logoHashes).toEqual({});
    });

    it("skips logos of deleted documents and tolerates a 404", async () => {
      await putDocument(doc());
      await adopted();
      await markDirty("logo", "gone");
      await markDirty("logo", "d1");
      deleteLogo.mockRejectedValue(new ApiError(404, "not_found", "x"));

      await syncOnce();

      expect(deleteLogo).toHaveBeenCalledTimes(1);
      expect(await hasPendingChanges()).toBe(false);
    });

    it("drops a logo the API refuses (too large or unsupported)", async () => {
      await putDocument(doc());
      await adopted();
      await saveLogoBlob("d1", new Blob(["huge"], { type: "image/png" }));
      uploadLogo.mockRejectedValue(new ApiError(400, "invalid", "x"));

      await syncOnce();

      expect(await hasPendingChanges()).toBe(false);
      expect((await getSyncState()).cursor).toBe(10);
    });

    it("keeps the logo queued when the upload fails", async () => {
      await putDocument(doc());
      await adopted();
      await markDirty("logo", "d1");
      deleteLogo.mockRejectedValue(new ApiError(0, "network", "x"));

      await expect(syncOnce()).rejects.toMatchObject({ status: 0 });
      expect(await hasPendingChanges()).toBe(true);
    });

    it("downloads changed remote logos and clears removed ones", async () => {
      await putDocument(doc());
      await putDocument(doc({ id: "d2" }));
      await putLogoBlob("d2", new Blob(["old"]));
      await updateSyncState({
        userId: "u1",
        cursor: 5,
        logoHashes: { d2: "old" },
      });
      downloadLogo.mockResolvedValue(new Blob(["new"], { type: "image/png" }));
      postSync.mockResolvedValueOnce(
        response({
          documents: [
            remoteDoc({ logoHash: "h1", logoMime: "image/png" }),
            remoteDoc({ id: "d2", logoHash: null }),
          ],
        }),
      );

      const changes = await syncOnce();

      expect(downloadLogo).toHaveBeenCalledWith("d1");
      expect(await loadLogoBlob("d1")).toBeDefined();
      expect(await loadLogoBlob("d2")).toBeUndefined();
      expect((await getSyncState()).logoHashes).toEqual({ d1: "h1" });
      expect(changes.documentIds.sort()).toEqual(["d1", "d2"]);
      expect(await hasPendingChanges()).toBe(false);
    });

    it("never overwrites a logo with unpushed local changes", async () => {
      await putDocument(doc());
      await adopted();
      await saveLogoBlob("d1", new Blob(["mine"]));
      uploadLogo.mockResolvedValue({ logoHash: "mine", logoMime: "x" });
      postSync.mockResolvedValueOnce(
        response({ documents: [remoteDoc({ logoHash: "theirs" })] }),
      );

      await syncOnce();

      expect(downloadLogo).not.toHaveBeenCalled();
      expect((await getSyncState()).logoHashes).toEqual({ d1: "mine" });
    });
  });
});

describe("adoptAccount", () => {
  it("is a no-op for the account already adopted", async () => {
    await adopted();

    await adoptAccount("u1");

    expect(postSync).not.toHaveBeenCalled();
  });

  it("merges the cloud copy and uploads the existing library", async () => {
    await putFolder(folder({ updatedAt: 150 }));
    await putDocument(doc({ updatedAt: 150 }));
    await putLogoBlob("d1", new Blob(["x"]));
    updateSyncedSettings({ colorFormat: "rgb" });
    postSync.mockResolvedValueOnce(
      response({
        cursor: 42,
        folders: [remoteFolder({ id: "f9", name: "Cloud" })],
      }),
    );

    const changes = await adoptAccount("u1");

    // Pulled without pushing anything first.
    expect(postSync).toHaveBeenCalledWith({
      cursor: 0,
      folders: [],
      documents: [],
      settings: null,
    });
    expect(changes.library).toBe(true);
    expect((await listFolders()).map((f) => f.id).sort()).toEqual(["f1", "f9"]);
    expect(await getSyncState()).toEqual({
      userId: "u1",
      cursor: 42,
      logoHashes: {},
    });
    const queued = (await listOutbox()).map((e) => e.key).sort();
    expect(queued).toEqual([
      "document:d1",
      "folder:f1",
      "logo:d1",
      "settings:settings",
    ]);
  });

  it("drops an untouched starter project when the account has QR codes", async () => {
    await saveFolder(folder());
    await saveDocument(doc());
    postSync.mockResolvedValueOnce(
      response({
        folders: [remoteFolder({ id: "f9" })],
        documents: [remoteDoc({ id: "d9", folderId: "f9" })],
      }),
    );

    const changes = await adoptAccount("u1");

    expect(changes.library).toBe(true);
    expect((await listDocuments()).map((d) => d.id)).toEqual(["d9"]);
    expect((await listFolders()).map((f) => f.id)).toEqual(["f9"]);
    expect(await hasPendingChanges()).toBe(false);
  });

  it("still pushes the settings when it drops the starter", async () => {
    await saveFolder(folder());
    await saveDocument(doc());
    updateSyncedSettings({ colorFormat: "rgb" });
    await Promise.resolve();
    postSync.mockResolvedValueOnce(
      response({ documents: [remoteDoc({ id: "d9", folderId: "f9" })] }),
    );

    await adoptAccount("u1");

    expect((await listOutbox()).map((e) => e.key)).toEqual([
      "settings:settings",
    ]);
  });

  it("keeps an untouched starter when the account is empty", async () => {
    await saveFolder(folder());
    await saveDocument(doc());

    await adoptAccount("u1");

    expect(await listDocuments()).toHaveLength(1);
    expect(await hasPendingChanges()).toBe(true);
  });

  it.each([
    ["an edited document", () => saveDocument(doc({ updatedAt: 999 }))],
    ["a logo", () => saveLogoBlob("d1", new Blob(["x"]))],
    ["a second project", () => saveFolder(folder({ id: "f2" }))],
  ])("uploads a starter with %s", async (_label, change) => {
    await saveFolder(folder());
    await saveDocument(doc());
    await change();
    postSync.mockResolvedValueOnce(
      response({ documents: [remoteDoc({ id: "d9" })] }),
    );

    await adoptAccount("u1");

    expect((await listDocuments()).map((d) => d.id).sort()).toEqual([
      "d1",
      "d9",
    ]);
  });

  it("wipes another account's library instead of merging it", async () => {
    await saveFolder(folder({ name: "Theirs" }));
    await updateSyncState({
      userId: "someone-else",
      cursor: 3,
      logoHashes: {},
    });

    const changes = await adoptAccount("u1");

    expect(changes.library).toBe(true);
    expect(await listFolders()).toEqual([]);
    expect(await hasPendingChanges()).toBe(false);
    expect((await getSyncState()).userId).toBe("u1");
  });

  it("leaves the device unadopted when the pull fails", async () => {
    postSync.mockRejectedValueOnce(new ApiError(0, "network", "x"));

    await expect(adoptAccount("u1")).rejects.toBeInstanceOf(ApiError);
    expect((await getSyncState()).userId).toBeNull();
  });
});
