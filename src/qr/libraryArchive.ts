/** Whole-library backup as a single `.dotcraft` file.
 *
 *  A `.dotcraft` file is a gzipped tar (see {@link ./tar}) bundling three kinds
 *  of entry:
 *
 *    manifest.json   { format, version, exportedAt }
 *    library.json    { folders, documents, prefs, logos }
 *    logos/<docId>   the raw logo bytes for each document that has one
 *
 *  Documents are stored with `options.logo: null` (their at-rest shape); the
 *  logo bytes live in the `logos/` entries, with their mime types recorded in
 *  `library.json`'s `logos` map so import can rebuild each Blob faithfully.
 *
 *  Export reads the persistence layer; import wipes it and restores the archive
 *  verbatim (same ids), so the library comes back in exactly the same state. */

import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import {
  clearLibrary,
  getPrefs,
  listDocuments,
  listFolders,
  loadLogoBlob,
  normalizeOptions,
  type Prefs,
  saveDocument,
  saveFolder,
  saveLogoBlob,
  setPrefs,
} from "./storage";
import { packTar, type TarEntry, unpackTar } from "./tar";
import type { Folder, QrDocument } from "./types";

const FORMAT = "dotcraft";
const VERSION = 1;
const LOGO_PREFIX = "logos/";

/** Shape of the `library.json` entry. */
interface LibraryPayload {
  folders: Folder[];
  documents: QrDocument[];
  prefs: Prefs;
  /** docId -> logo mime type, for the matching `logos/<docId>` entry. */
  logos: Record<string, string>;
}

/** Thrown when an imported file isn't a readable `.dotcraft` archive. */
export class LibraryImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryImportError";
  }
}

/** Serialise an object to UTF-8 JSON bytes. */
function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

/** Read the whole library and pack it into a `.dotcraft` byte stream.
 *  `exportedAt` is injected (defaulting to now) so output is deterministic in
 *  tests. */
export async function exportLibrary(
  exportedAt: number = Date.now(),
): Promise<Uint8Array> {
  const [folders, documents] = await Promise.all([
    listFolders(),
    listDocuments(),
  ]);

  const logos: Record<string, string> = {};
  const logoEntries: TarEntry[] = [];
  for (const doc of documents) {
    const blob = await loadLogoBlob(doc.id);
    if (!blob) continue;
    logos[doc.id] = blob.type || "application/octet-stream";
    logoEntries.push({
      name: LOGO_PREFIX + doc.id,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }

  const payload: LibraryPayload = {
    folders,
    documents,
    prefs: getPrefs(),
    logos,
  };

  const tar = packTar([
    {
      name: "manifest.json",
      data: jsonBytes({ format: FORMAT, version: VERSION, exportedAt }),
    },
    { name: "library.json", data: jsonBytes(payload) },
    ...logoEntries,
  ]);
  return gzipSync(tar);
}

/** Parse and validate a `.dotcraft` byte stream into its tar entries, keyed by
 *  name. Throws {@link LibraryImportError} on anything unreadable. */
function readArchive(bytes: Uint8Array): {
  payload: LibraryPayload;
  logos: Map<string, Uint8Array>;
} {
  let entries: TarEntry[];
  try {
    entries = unpackTar(gunzipSync(bytes));
  } catch {
    throw new LibraryImportError("Not a valid .dotcraft archive.");
  }

  const byName = new Map(entries.map((e) => [e.name, e.data]));

  const manifestRaw = byName.get("manifest.json");
  const libraryRaw = byName.get("library.json");
  if (!manifestRaw || !libraryRaw)
    throw new LibraryImportError("Archive is missing its library data.");

  let manifest: { format?: unknown };
  let library: Partial<LibraryPayload>;
  try {
    manifest = JSON.parse(strFromU8(manifestRaw));
    library = JSON.parse(strFromU8(libraryRaw));
  } catch {
    throw new LibraryImportError("Archive data is corrupt.");
  }

  if (manifest.format !== FORMAT)
    throw new LibraryImportError("Unrecognised archive format.");
  if (!Array.isArray(library.folders) || !Array.isArray(library.documents))
    throw new LibraryImportError("Archive is missing folders or documents.");

  const logos = new Map<string, Uint8Array>();
  for (const [name, data] of byName) {
    if (name.startsWith(LOGO_PREFIX))
      logos.set(name.slice(LOGO_PREFIX.length), data);
  }

  return {
    payload: {
      folders: library.folders,
      documents: library.documents,
      prefs: (library.prefs ?? getPrefs()) as Prefs,
      logos: (library.logos ?? {}) as Record<string, string>,
    },
    logos,
  };
}

/** Keep only objects carrying a string `id` — guards the cast from parsed JSON. */
function withStringId<T extends { id: string }>(items: T[]): T[] {
  return items.filter(
    (it): it is T =>
      typeof it === "object" && it !== null && typeof it.id === "string",
  );
}

/** Replace the entire library with the contents of a `.dotcraft` file. Wipes
 *  the current library first, then restores folders, documents, logos, and
 *  preferences exactly. Throws {@link LibraryImportError} on a bad archive
 *  (before any data is touched). */
export async function importLibrary(bytes: Uint8Array): Promise<void> {
  const { payload, logos } = readArchive(bytes);

  await clearLibrary();

  for (const folder of withStringId(payload.folders)) await saveFolder(folder);
  for (const doc of withStringId(payload.documents)) {
    await saveDocument({ ...doc, options: normalizeOptions(doc.options) });
  }
  for (const [docId, data] of logos) {
    const type = payload.logos[docId] || "application/octet-stream";
    // Copy into a fresh ArrayBuffer-backed view so it satisfies BlobPart.
    await saveLogoBlob(docId, new Blob([new Uint8Array(data)], { type }));
  }

  setPrefs(payload.prefs);
}
