import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../test/db";
import {
  clearLibrary,
  clearLogo,
  clearTombstone,
  copyLogo,
  deleteDocument,
  deleteFolderTree,
  folderDepth,
  folderSubtreeIds,
  getPrefs,
  getSyncState,
  listDocuments,
  listFolders,
  listOutbox,
  listTombstones,
  loadLogo,
  loadLogoBlob,
  markDirty,
  migrateLegacy,
  normalizeOptions,
  onLocalChange,
  PREFS_KEY,
  saveDocument,
  saveFolder,
  saveLogo,
  saveLogoBlob,
  setPrefs,
  settleOutbox,
  updateSyncState,
  wipeLocalLibrary,
} from "./storage";
import { DEFAULT_OPTIONS, type Folder, type QrDocument } from "./types";

let counter = 0;
const newId = () => `id-${counter++}`;

beforeEach(async () => {
  counter = 0;
  await resetDb();
});

function folder(over: Partial<Folder> = {}): Folder {
  return {
    id: newId(),
    name: "Folder",
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}
function doc(over: Partial<QrDocument> = {}): QrDocument {
  return {
    id: newId(),
    name: "Doc",
    folderId: "f",
    options: { ...DEFAULT_OPTIONS },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

describe("preferences", () => {
  it("returns defaults for a fresh visitor", () => {
    expect(getPrefs()).toEqual({
      colorFormat: "hex",
      lastOpenedDocId: null,
      collapsedFolderIds: [],
      collapsedPanelIds: [],
    });
  });

  it("round-trips colour format, last opened document and fold state", () => {
    setPrefs({
      colorFormat: "rgb",
      lastOpenedDocId: "abc",
      collapsedFolderIds: ["f1", "f2"],
      collapsedPanelIds: ["style", "logo"],
    });
    expect(getPrefs()).toEqual({
      colorFormat: "rgb",
      lastOpenedDocId: "abc",
      collapsedFolderIds: ["f1", "f2"],
      collapsedPanelIds: ["style", "logo"],
      // Changing a synced setting (the colour format) stamps it for sync.
      settingsUpdatedAt: expect.any(Number),
    });
  });

  it("drops non-string entries from the stored fold-state lists", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        version: 1,
        colorFormat: "hex",
        lastOpenedDocId: null,
        collapsedFolderIds: ["ok", 5, null],
        collapsedPanelIds: ["style", 7, null],
      }),
    );
    expect(getPrefs().collapsedFolderIds).toEqual(["ok"]);
    expect(getPrefs().collapsedPanelIds).toEqual(["style"]);
  });

  it("defaults the panel fold list when it is absent or malformed", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        version: 1,
        colorFormat: "hex",
        lastOpenedDocId: null,
        collapsedFolderIds: [],
        collapsedPanelIds: "nope",
      }),
    );
    expect(getPrefs().collapsedPanelIds).toEqual([]);
  });

  it("falls back on corrupt JSON, version mismatch and bad fields", () => {
    localStorage.setItem(PREFS_KEY, "{ not json");
    expect(getPrefs().colorFormat).toBe("hex");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ version: 9 }));
    expect(getPrefs().lastOpenedDocId).toBeNull();
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ version: 1, colorFormat: "weird", lastOpenedDocId: 5 }),
    );
    expect(getPrefs()).toEqual({
      colorFormat: "hex",
      lastOpenedDocId: null,
      collapsedFolderIds: [],
      collapsedPanelIds: [],
    });
  });

  it("swallows read and write errors", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(getPrefs().colorFormat).toBe("hex");
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() =>
      setPrefs({
        colorFormat: "hex",
        lastOpenedDocId: null,
        collapsedFolderIds: [],
        collapsedPanelIds: [],
      }),
    ).not.toThrow();
  });
});

describe("normalizeOptions", () => {
  it("merges over defaults, snaps unknown enums and drops the logo", () => {
    const opts = normalizeOptions({
      contentType: "text",
      contents: DEFAULT_OPTIONS.contents,
      dotStyle: "bogus",
      eyeStyle: "bogus",
      errorCorrection: "Z",
      logo: "data:image/png;base64,AAAA",
    });
    expect(opts.dotStyle).toBe(DEFAULT_OPTIONS.dotStyle);
    expect(opts.eyeStyle).toBe(DEFAULT_OPTIONS.eyeStyle);
    expect(opts.errorCorrection).toBe(DEFAULT_OPTIONS.errorCorrection);
    expect(opts.logo).toBeNull();
  });

  it("accepts the auto error-correction setting", () => {
    expect(normalizeOptions({ errorCorrection: "auto" }).errorCorrection).toBe(
      "auto",
    );
  });

  it("migrates a legacy `data` string into a typed content draft", () => {
    const url = normalizeOptions({ data: "https://a.test" });
    expect(url.contentType).toBe("url");
    expect(url.contents.url).toEqual({ type: "url", url: "https://a.test" });
    expect((url as unknown as Record<string, unknown>).data).toBeUndefined();

    const text = normalizeOptions({ data: "hello there" });
    expect(text.contentType).toBe("text");
    expect(text.contents.text).toEqual({ type: "text", text: "hello there" });
  });

  it("validates each stored draft, defaulting invalid ones", () => {
    const opts = normalizeOptions({
      contentType: "wifi",
      contents: { wifi: { type: "wifi", ssid: "N", encryption: "bad" } },
    });
    expect(opts.contents.wifi).toMatchObject({ ssid: "N", encryption: "WPA" });
    // A missing draft falls back to its empty default.
    expect(opts.contents.email).toMatchObject({ to: "", subject: "" });
  });
});

describe("folders & documents", () => {
  it("starts empty", async () => {
    expect(await listFolders()).toEqual([]);
    expect(await listDocuments()).toEqual([]);
  });

  it("saves and lists folders and documents", async () => {
    const f = folder({ id: "p", name: "Project" });
    await saveFolder(f);
    const d = doc({ id: "d", folderId: "p", name: "Q" });
    await saveDocument(d);
    expect(await listFolders()).toEqual([f]);
    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("Q");
  });

  it("strips the logo from a saved document", async () => {
    await saveDocument(
      doc({ id: "d", options: { ...DEFAULT_OPTIONS, logo: "data:x" } }),
    );
    const docs = await listDocuments();
    expect(docs[0].options.logo).toBeNull();
  });

  it("deletes a single document", async () => {
    await saveDocument(doc({ id: "d" }));
    await deleteDocument("d");
    expect(await listDocuments()).toEqual([]);
  });
});

describe("folderDepth", () => {
  it("counts a project as level 1 and each nesting as one deeper", () => {
    const folders = [
      folder({ id: "a", parentId: null }),
      folder({ id: "b", parentId: "a" }),
      folder({ id: "c", parentId: "b" }),
    ];
    expect(folderDepth("a", folders)).toBe(1);
    expect(folderDepth("b", folders)).toBe(2);
    expect(folderDepth("c", folders)).toBe(3);
  });
});

describe("folderSubtreeIds", () => {
  it("collects a folder plus every descendant", () => {
    const folders = [
      folder({ id: "a", parentId: null }),
      folder({ id: "b", parentId: "a" }),
      folder({ id: "c", parentId: "b" }),
      folder({ id: "other", parentId: null }),
    ];
    expect([...folderSubtreeIds("a", folders)].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("deleteFolderTree", () => {
  it("cascades to nested folders and their documents", async () => {
    const folders = [
      folder({ id: "a", parentId: null }),
      folder({ id: "b", parentId: "a" }),
      folder({ id: "keep", parentId: null }),
    ];
    for (const f of folders) await saveFolder(f);
    const documents = [
      doc({ id: "d1", folderId: "a" }),
      doc({ id: "d2", folderId: "b" }),
      doc({ id: "d3", folderId: "keep" }),
    ];
    for (const d of documents) await saveDocument(d);

    await deleteFolderTree("a", folders, documents);

    expect((await listFolders()).map((f) => f.id)).toEqual(["keep"]);
    expect((await listDocuments()).map((d) => d.id)).toEqual(["d3"]);
  });
});

describe("logo IndexedDB storage (keyed by document id)", () => {
  const DATA_URL = "data:image/png;base64,aGVsbG8="; // "hello"

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        blob: async () => new NodeBlob(["hello"], { type: "image/png" }),
      })),
    );
    vi.stubGlobal(
      "FileReader",
      class {
        result: string | null = null;
        error: unknown = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(blob: Blob) {
          blob
            .arrayBuffer()
            .then((buf) => {
              const bytes = new Uint8Array(buf);
              let bin = "";
              for (const b of bytes) bin += String.fromCharCode(b);
              const type = blob.type || "application/octet-stream";
              this.result = `data:${type};base64,${btoa(bin)}`;
              this.onload?.();
            })
            .catch((e) => {
              this.error = e;
              this.onerror?.();
            });
        }
      },
    );
  });

  it("returns null when no logo is stored for a document", async () => {
    expect(await loadLogo("nope")).toBeNull();
  });

  it("stores logos independently per document", async () => {
    await saveLogo("doc-a", DATA_URL);
    expect(await loadLogo("doc-a")).toBe(DATA_URL);
    expect(await loadLogo("doc-b")).toBeNull();
  });

  it("copies a logo onto another document", async () => {
    await saveLogo("doc-a", DATA_URL);
    await copyLogo("doc-a", "doc-b");
    expect(await loadLogo("doc-b")).toBe(DATA_URL);
    // Copying from a document without a logo is a no-op.
    await copyLogo("missing", "doc-c");
    expect(await loadLogo("doc-c")).toBeNull();
  });

  it("clears a document's logo", async () => {
    await saveLogo("doc-a", DATA_URL);
    await clearLogo("doc-a");
    expect(await loadLogo("doc-a")).toBeNull();
  });

  it("removes the logo when its document is deleted", async () => {
    await saveLogo("doc-a", DATA_URL);
    await deleteDocument("doc-a");
    expect(await loadLogo("doc-a")).toBeNull();
  });

  it("stores and reads back a logo Blob directly", async () => {
    const blob = new NodeBlob(["hello"], { type: "image/png" }) as Blob;
    await saveLogoBlob("doc-a", blob);
    const read = await loadLogoBlob("doc-a");
    expect(read?.type).toBe("image/png");
    expect(await read?.text()).toBe("hello");
    expect(await loadLogoBlob("missing")).toBeUndefined();
  });

  it("is a no-op when the data URL cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    await expect(saveLogo("doc-a", "data:bogus")).resolves.toBeUndefined();
    expect(await loadLogo("doc-a")).toBeNull();
  });

  it("degrades when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await listFolders()).toEqual([]);
    expect(await listDocuments()).toEqual([]);
    expect(await loadLogo("doc-a")).toBeNull();
    await expect(saveLogo("doc-a", DATA_URL)).resolves.toBeUndefined();
  });
});

describe("clearLibrary", () => {
  it("wipes every folder, document, and logo", async () => {
    const f = folder({ id: "f" });
    const d = doc({ id: "d", folderId: "f" });
    await saveFolder(f);
    await saveDocument(d);
    await saveLogoBlob("d", new NodeBlob(["x"], { type: "image/png" }) as Blob);

    await clearLibrary();

    expect(await listFolders()).toEqual([]);
    expect(await listDocuments()).toEqual([]);
    expect(await loadLogoBlob("d")).toBeUndefined();
  });
});

describe("migrateLegacy", () => {
  const LEGACY_KEY = "qr-studio:state";

  it("does nothing without a legacy record", async () => {
    expect(await migrateLegacy(newId, 100)).toBeNull();
    expect(await listFolders()).toEqual([]);
  });

  it("turns a legacy record into a project + document and clears the key", async () => {
    // A genuine legacy options object: a `data` string, no typed `contents`.
    const { contents, contentType, ...rest } = DEFAULT_OPTIONS;
    const options = { ...rest, data: "legacy" };
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ version: 1, options, colorFormat: "rgb" }),
    );

    const id = await migrateLegacy(newId, 100);
    expect(id).not.toBeNull();

    const folders = await listFolders();
    const docs = await listDocuments();
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe("My Project");
    expect(folders[0].parentId).toBeNull();
    expect(docs[0].folderId).toBe(folders[0].id);
    expect(docs[0].options.contentType).toBe("text");
    expect(docs[0].options.contents.text).toEqual({
      type: "text",
      text: "legacy",
    });
    expect(getPrefs()).toEqual({
      colorFormat: "rgb",
      lastOpenedDocId: id,
      collapsedFolderIds: [],
      collapsedPanelIds: [],
      settingsUpdatedAt: expect.any(Number),
    });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("re-keys the legacy logo blob onto the new document", async () => {
    const DATA_URL = "data:image/png;base64,aGVsbG8=";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        blob: async () => new NodeBlob(["hello"], { type: "image/png" }),
      })),
    );
    vi.stubGlobal(
      "FileReader",
      class {
        result: string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(blob: Blob) {
          blob.arrayBuffer().then((buf) => {
            const bytes = new Uint8Array(buf);
            let bin = "";
            for (const b of bytes) bin += String.fromCharCode(b);
            this.result = `data:${blob.type};base64,${btoa(bin)}`;
            this.onload?.();
          });
        }
      },
    );
    // The legacy logo lived under the fixed "current" key.
    await saveLogo("current", DATA_URL);
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ version: 1, options: DEFAULT_OPTIONS }),
    );

    const id = await migrateLegacy(newId, 100);
    expect(await loadLogo(id as string)).toBe(DATA_URL);
    expect(await loadLogo("current")).toBeNull();
  });

  it("skips migration once a library already exists", async () => {
    await saveFolder(folder({ id: "exists" }));
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ version: 1, options: DEFAULT_OPTIONS }),
    );
    expect(await migrateLegacy(newId, 100)).toBeNull();
    expect((await listFolders()).map((f) => f.id)).toEqual(["exists"]);
  });

  it("discards a corrupt or stale-version legacy record", async () => {
    localStorage.setItem(LEGACY_KEY, "{ not json");
    expect(await migrateLegacy(newId, 100)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

    localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 99 }));
    expect(await migrateLegacy(newId, 100)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe("sync bookkeeping", () => {
  const keys = async () => (await listOutbox()).map((e) => e.key);

  it("queues tracked writes and notifies subscribers", async () => {
    const listener = vi.fn();
    const unsubscribe = onLocalChange(listener);
    const f = folder();
    const d = doc({ folderId: f.id });

    await saveFolder(f);
    await saveDocument(d);
    await saveLogoBlob(d.id, new NodeBlob(["x"]) as unknown as Blob);
    unsubscribe();
    await clearLogo(d.id);

    expect(await keys()).toEqual([
      `folder:${f.id}`,
      `document:${d.id}`,
      `logo:${d.id}`,
    ]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("does not queue untracked writes", async () => {
    const f = folder();
    await saveFolder(f, { track: false });
    await saveDocument(doc(), { track: false });
    await deleteDocument("x", { track: false });

    expect(await listOutbox()).toEqual([]);
    expect(await listTombstones()).toEqual([]);
  });

  it("leaves tombstones for deletions and clears them on re-creation", async () => {
    const f = folder();
    const d = doc({ folderId: f.id });
    await saveFolder(f);
    await saveDocument(d);

    await deleteFolderTree(f.id, [f], [d]);
    expect((await listTombstones()).map((t) => t.key).sort()).toEqual([
      `document:${d.id}`,
      `folder:${f.id}`,
    ]);

    await saveFolder(f);
    expect((await listTombstones()).map((t) => t.key)).toEqual([
      `document:${d.id}`,
    ]);
    await clearTombstone("document", d.id);
    expect(await listTombstones()).toEqual([]);
  });

  it("copies logos as a tracked change of the target", async () => {
    await saveLogoBlob("a", new NodeBlob(["x"]) as unknown as Blob, {
      track: false,
    });
    await copyLogo("a", "b");

    expect(await keys()).toEqual(["logo:b"]);
  });

  it("settles only entries that weren't re-dirtied", async () => {
    await markDirty("folder", "a");
    await markDirty("folder", "b");
    const pushed = await listOutbox();
    await markDirty("folder", "b");

    await settleOutbox(pushed);

    expect(await keys()).toEqual(["folder:b"]);
  });

  it("tombstones the replaced library on import-style clears", async () => {
    const f = folder();
    await saveFolder(f, { track: false });
    await saveDocument(doc({ id: "d1" }), { track: false });

    await clearLibrary();

    expect((await listTombstones()).map((t) => t.key).sort()).toEqual([
      "document:d1",
      `folder:${f.id}`,
    ]);
  });

  it("stamps and queues synced settings only when they change", async () => {
    setPrefs({ ...getPrefs(), collapsedFolderIds: ["x"] });
    expect(getPrefs().settingsUpdatedAt).toBeUndefined();

    setPrefs({ ...getPrefs(), locale: "de" });
    expect(getPrefs().settingsUpdatedAt).toEqual(expect.any(Number));
    await vi.waitFor(async () =>
      expect(await keys()).toEqual(["settings:settings"]),
    );

    setPrefs({ ...getPrefs(), colorFormat: "hsl" }, { track: false });
    expect(getPrefs().colorFormat).toBe("hsl");
  });

  it("stores the sync state and wipes everything on sign-out", async () => {
    expect(await getSyncState()).toEqual({
      userId: null,
      cursor: 0,
      logoHashes: {},
    });
    await updateSyncState({ userId: "u1", cursor: 4, logoHashes: { d: "h" } });
    await updateSyncState({ cursor: 5 });
    expect(await getSyncState()).toEqual({
      userId: "u1",
      cursor: 5,
      logoHashes: { d: "h" },
    });

    await saveFolder(folder());
    await deleteDocument("gone");
    setPrefs({ ...getPrefs(), colorFormat: "rgb" });

    await wipeLocalLibrary();

    expect(await listFolders()).toEqual([]);
    expect(await listOutbox()).toEqual([]);
    expect(await listTombstones()).toEqual([]);
    expect((await getSyncState()).userId).toBeNull();
    // UI prefs survive, but the settings no longer belong to an account.
    expect(getPrefs().colorFormat).toBe("rgb");
    expect(getPrefs().settingsUpdatedAt).toBeUndefined();
  });
});
