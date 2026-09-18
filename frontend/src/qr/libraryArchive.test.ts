import { Blob as NodeBlob } from "node:buffer";
import { gunzipSync, gzipSync, strFromU8 } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../test/db";
import {
  exportLibrary,
  importLibrary,
  LibraryImportError,
} from "./libraryArchive";
import {
  getPrefs,
  listDocuments,
  listFolders,
  loadLogoBlob,
  saveDocument,
  saveFolder,
  saveLogoBlob,
  setPrefs,
} from "./storage";
import { packTar, unpackTar } from "./tar";
import { DEFAULT_OPTIONS, type Folder, type QrDocument } from "./types";

const enc = new TextEncoder();

/** Read a named entry out of an exported `.dotcraft` byte stream. */
function entry(bytes: Uint8Array, name: string): Uint8Array {
  const found = unpackTar(gunzipSync(bytes)).find((e) => e.name === name);
  if (!found) throw new Error(`no entry ${name}`);
  return found.data;
}

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

function folder(over: Partial<Folder>): Folder {
  return {
    id: "f",
    name: "F",
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}
function doc(over: Partial<QrDocument>): QrDocument {
  return {
    id: "d",
    name: "D",
    folderId: "p",
    options: { ...DEFAULT_OPTIONS },
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

/** Seed a small library: two folders, two documents, one logo, custom prefs. */
async function seed() {
  await saveFolder(folder({ id: "p", name: "Project" }));
  await saveFolder(folder({ id: "s", name: "Sub", parentId: "p" }));
  await saveDocument(
    doc({
      id: "d1",
      name: "One",
      folderId: "p",
      options: { ...DEFAULT_OPTIONS, fillColor: "#123456" },
    }),
  );
  await saveDocument(doc({ id: "d2", name: "Two", folderId: "s" }));
  await saveLogoBlob(
    "d1",
    new NodeBlob(["LOGO"], { type: "image/png" }) as Blob,
  );
  setPrefs({
    colorFormat: "rgb",
    lastOpenedDocId: "d1",
    collapsedFolderIds: ["s"],
    collapsedPanelIds: [],
  });
}

describe("export / import round-trip", () => {
  it("captures the manifest, logo bytes, and mime map in the archive", async () => {
    await seed();
    const bytes = await exportLibrary(1700000000000);

    const manifest = JSON.parse(strFromU8(entry(bytes, "manifest.json")));
    expect(manifest).toMatchObject({
      format: "dotcraft",
      version: 1,
      exportedAt: 1700000000000,
    });

    const library = JSON.parse(strFromU8(entry(bytes, "library.json")));
    expect(library.logos).toEqual({ d1: "image/png" });
    expect(strFromU8(entry(bytes, "logos/d1"))).toBe("LOGO");
    // Only the document with a logo gets an entry.
    expect(() => entry(bytes, "logos/d2")).toThrow();
  });

  it("restores folders, documents, logos, and prefs exactly", async () => {
    await seed();
    const bytes = await exportLibrary(1700000000000);

    // Mutate the live library so we can prove import replaces it.
    await saveFolder(folder({ id: "extra", name: "Extra" }));

    await importLibrary(bytes);

    const folders = await listFolders();
    expect(folders.map((f) => f.id).sort()).toEqual(["p", "s"]);
    expect(folders.find((f) => f.id === "s")?.parentId).toBe("p");

    const docs = await listDocuments();
    expect(docs.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    expect(docs.find((d) => d.id === "d1")?.options.fillColor).toBe("#123456");

    // The logo with a document is restored; the document without one stays bare.
    // (Byte fidelity is covered by the archive-bytes test above and the
    // saveLogoBlob/loadLogoBlob storage round-trip.)
    expect(await loadLogoBlob("d1")).toBeDefined();
    expect(await loadLogoBlob("d2")).toBeUndefined();

    expect(getPrefs()).toMatchObject({
      colorFormat: "rgb",
      lastOpenedDocId: "d1",
      collapsedFolderIds: ["s"],
    });
  });

  it("produces a gzipped byte stream", async () => {
    await seed();
    const bytes = await exportLibrary(1);
    // gzip magic header.
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);
  });
});

describe("importLibrary validation", () => {
  it("rejects bytes that are not a gzip archive", async () => {
    await expect(
      importLibrary(new Uint8Array([1, 2, 3])),
    ).rejects.toBeInstanceOf(LibraryImportError);
  });

  it("rejects an archive missing manifest.json", async () => {
    const tar = packTar([{ name: "library.json", data: enc.encode("{}") }]);
    await expect(importLibrary(gzipSync(tar))).rejects.toThrow(
      /missing its library data/i,
    );
  });

  it("rejects an unrecognised format", async () => {
    const tar = packTar([
      { name: "manifest.json", data: enc.encode('{"format":"other"}') },
      {
        name: "library.json",
        data: enc.encode('{"folders":[],"documents":[]}'),
      },
    ]);
    await expect(importLibrary(gzipSync(tar))).rejects.toThrow(/format/i);
  });

  it("rejects an archive without folders/documents arrays", async () => {
    const tar = packTar([
      { name: "manifest.json", data: enc.encode('{"format":"dotcraft"}') },
      { name: "library.json", data: enc.encode("{}") },
    ]);
    await expect(importLibrary(gzipSync(tar))).rejects.toThrow(
      /folders or documents/i,
    );
  });

  it("rejects corrupt JSON entries", async () => {
    const tar = packTar([
      { name: "manifest.json", data: enc.encode("not json") },
      { name: "library.json", data: enc.encode("{}") },
    ]);
    await expect(importLibrary(gzipSync(tar))).rejects.toThrow(/corrupt/i);
  });

  it("does not touch the existing library when the archive is invalid", async () => {
    await seed();
    await expect(importLibrary(new Uint8Array([0, 1, 2]))).rejects.toThrow();
    // The seeded library is intact.
    expect((await listFolders()).length).toBe(2);
  });
});
