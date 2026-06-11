import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../test/db";
import {
  clearLogo,
  copyLogo,
  deleteDocument,
  deleteFolderTree,
  folderDepth,
  folderSubtreeIds,
  getPrefs,
  listDocuments,
  listFolders,
  loadLogo,
  migrateLegacy,
  normalizeOptions,
  PREFS_KEY,
  saveDocument,
  saveFolder,
  saveLogo,
  setPrefs,
} from "./storage";
import {
  DEFAULT_OPTIONS,
  type Folder,
  type QrDocument,
  type QrOptions,
} from "./types";

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
    });
  });

  it("round-trips colour format, last opened document and fold state", () => {
    setPrefs({
      colorFormat: "rgb",
      lastOpenedDocId: "abc",
      collapsedFolderIds: ["f1", "f2"],
    });
    expect(getPrefs()).toEqual({
      colorFormat: "rgb",
      lastOpenedDocId: "abc",
      collapsedFolderIds: ["f1", "f2"],
    });
  });

  it("drops non-string entries from a stored fold-state list", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        version: 1,
        colorFormat: "hex",
        lastOpenedDocId: null,
        collapsedFolderIds: ["ok", 5, null],
      }),
    );
    expect(getPrefs().collapsedFolderIds).toEqual(["ok"]);
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
      }),
    ).not.toThrow();
  });
});

describe("normalizeOptions", () => {
  it("merges over defaults, snaps unknown enums and drops the logo", () => {
    const opts = normalizeOptions({
      data: "hi",
      dotStyle: "bogus",
      eyeStyle: "bogus",
      errorCorrection: "Z",
      logo: "data:image/png;base64,AAAA",
    });
    expect(opts.data).toBe("hi");
    expect(opts.dotStyle).toBe(DEFAULT_OPTIONS.dotStyle);
    expect(opts.eyeStyle).toBe(DEFAULT_OPTIONS.eyeStyle);
    expect(opts.errorCorrection).toBe(DEFAULT_OPTIONS.errorCorrection);
    expect(opts.logo).toBeNull();
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

describe("migrateLegacy", () => {
  const LEGACY_KEY = "qr-studio:state";

  it("does nothing without a legacy record", async () => {
    expect(await migrateLegacy(newId, 100)).toBeNull();
    expect(await listFolders()).toEqual([]);
  });

  it("turns a legacy record into a project + document and clears the key", async () => {
    const options: QrOptions = { ...DEFAULT_OPTIONS, data: "legacy" };
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
    expect(docs[0].options.data).toBe("legacy");
    expect(getPrefs()).toEqual({
      colorFormat: "rgb",
      lastOpenedDocId: id,
      collapsedFolderIds: [],
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
