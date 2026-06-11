/** React state for the QR library: the folder/document tree, which document is
 *  active, and the colour-input preference. Owns all reads/writes against the
 *  persistence layer in {@link ./storage} and keeps an in-memory mirror so the
 *  sidebar renders synchronously.
 *
 *  The live editor working copy (the active document's `QrOptions`, including
 *  its hydrated logo) lives in `App`, not here — this hook only stores the
 *  persisted snapshot and exposes `persistActiveOptions` to write it back. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorFormat } from "./color";
import { detectCountryCode } from "./countries";
import { randomStyle } from "./random";
import {
  copyLogo,
  deleteDocument,
  deleteFolderTree,
  folderDepth,
  folderSubtreeIds,
  getPrefs,
  listDocuments,
  listFolders,
  MAX_FOLDER_DEPTH,
  migrateLegacy,
  saveDocument,
  saveFolder,
  setPrefs,
} from "./storage";
import { defaultOptions, type Folder, type QrDocument } from "./types";

const newId = (): string => crypto.randomUUID();
const now = (): number => Date.now();

/** Localised default names for items the library creates. Injected by the
 *  caller (from the active translation) so new projects/documents are named in
 *  the current language; defaults to English so non-UI callers (and tests) work
 *  without wiring up i18n. */
export interface LibraryLabels {
  myProject: string;
  myQrCode: string;
  newProject: string;
  newFolder: string;
  untitledQr: string;
  copySuffix: (name: string) => string;
}

export const DEFAULT_LIBRARY_LABELS: LibraryLabels = {
  myProject: "My Project",
  myQrCode: "My QR code",
  newProject: "New Project",
  newFolder: "New Folder",
  untitledQr: "Untitled QR",
  copySuffix: (name) => `${name} copy`,
};

/** Return `arr` with the item sharing `item.id` replaced by `item`. */
function replaceById<T extends { id: string }>(arr: T[], item: T): T[] {
  return arr.map((x) => (x.id === item.id ? item : x));
}

/** A fresh top-level project holding one starter document. Used for first-run
 *  seeding and whenever the last document is deleted. */
function makeStarter(labels: LibraryLabels): {
  folder: Folder;
  doc: QrDocument;
} {
  const t = now();
  const folder: Folder = {
    id: newId(),
    name: labels.myProject,
    parentId: null,
    createdAt: t,
    updatedAt: t,
  };
  const doc: QrDocument = {
    id: newId(),
    name: labels.myQrCode,
    folderId: folder.id,
    options: { ...defaultOptions(detectCountryCode()), ...randomStyle() },
    createdAt: t,
    updatedAt: t,
  };
  return { folder, doc };
}

export interface Library {
  folders: Folder[];
  documents: QrDocument[];
  activeDocId: string | null;
  /** True once the initial load (and any migration/seed) has finished. */
  loaded: boolean;
  colorFormat: ColorFormat;
  setColorFormat(format: ColorFormat): void;
  /** Folders the user has collapsed; everything else renders expanded. */
  collapsedFolders: Set<string>;
  /** Toggle a folder's collapsed state (caret click). */
  toggleFolder(id: string): void;
  /** Ensure a folder is expanded (used by drag-hover auto-expand). */
  expandFolder(id: string): void;
  createProject(): void;
  createFolder(parentId: string): void;
  createDocument(folderId: string): void;
  /** Copy a document, placing the copy directly after it in the same folder. */
  duplicateDocument(id: string): void;
  /** Move a document into another folder (drag and drop). */
  moveDocument(id: string, folderId: string): void;
  renameFolder(id: string, name: string): void;
  renameDocument(id: string, name: string): void;
  deleteFolder(id: string): void;
  removeDocument(id: string): void;
  selectDocument(id: string): void;
  /** Write the given options back to the active document (logo stripped). */
  persistActiveOptions(options: QrDocument["options"]): void;
}

export function useLibrary(
  labels: LibraryLabels = DEFAULT_LIBRARY_LABELS,
): Library {
  // Keep the latest labels in a ref so the imperative create callbacks below
  // (memoised with empty deps) always read the current language without being
  // re-created on every render.
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<QrDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [colorFormat, setColorFormat] = useState<ColorFormat>("hex");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [loaded, setLoaded] = useState(false);

  // Mirrors of the latest state, so the imperative callbacks below can read
  // current values without being re-created on every change.
  const foldersRef = useRef(folders);
  const documentsRef = useRef(documents);
  const activeIdRef = useRef(activeDocId);
  foldersRef.current = folders;
  documentsRef.current = documents;
  activeIdRef.current = activeDocId;

  // Initial load: migrate any legacy single-document state, then read the tree,
  // seeding a starter project when the library is empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateLegacy(newId, now());
      let [fs, ds] = await Promise.all([listFolders(), listDocuments()]);
      if (ds.length === 0) {
        const { folder, doc } = makeStarter(labelsRef.current);
        await saveFolder(folder);
        await saveDocument(doc);
        fs = [...fs, folder];
        ds = [doc];
      }
      if (cancelled) return;
      const prefs = getPrefs();
      setFolders(fs);
      setDocuments(ds);
      setColorFormat(prefs.colorFormat);
      setCollapsedFolders(new Set(prefs.collapsedFolderIds));
      setActiveDocId(
        ds.find((d) => d.id === prefs.lastOpenedDocId)?.id ?? ds[0]?.id ?? null,
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist preferences (colour format, last open document, folder fold state).
  useEffect(() => {
    if (!loaded) return;
    // Merge over the stored prefs so the language choice (written separately by
    // the switcher) isn't clobbered by this write.
    setPrefs({
      ...getPrefs(),
      colorFormat,
      lastOpenedDocId: activeDocId,
      collapsedFolderIds: [...collapsedFolders],
    });
  }, [loaded, colorFormat, activeDocId, collapsedFolders]);

  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandFolder = useCallback((id: string) => {
    setCollapsedFolders((prev) => {
      if (!prev.has(id)) return prev; // already expanded — no state churn
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /** Apply a post-deletion document list: reselect if the active doc is gone,
   *  and reseed a starter project if nothing is left so the editor is never
   *  document-less. */
  const settleDocuments = useCallback((remaining: QrDocument[]) => {
    if (remaining.length === 0) {
      const { folder, doc } = makeStarter(labelsRef.current);
      void saveFolder(folder);
      void saveDocument(doc);
      setFolders((fs) => [...fs, folder]);
      setDocuments([doc]);
      setActiveDocId(doc.id);
      return;
    }
    setDocuments(remaining);
    if (!remaining.some((d) => d.id === activeIdRef.current))
      setActiveDocId(remaining[0].id);
  }, []);

  const createProject = useCallback(() => {
    const t = now();
    const folder: Folder = {
      id: newId(),
      name: labelsRef.current.newProject,
      parentId: null,
      createdAt: t,
      updatedAt: t,
    };
    setFolders((fs) => [...fs, folder]);
    void saveFolder(folder);
  }, []);

  const createFolder = useCallback((parentId: string) => {
    // Don't nest past the depth cap (the sidebar hides the button there too).
    if (folderDepth(parentId, foldersRef.current) >= MAX_FOLDER_DEPTH) return;
    const t = now();
    const folder: Folder = {
      id: newId(),
      name: labelsRef.current.newFolder,
      parentId,
      createdAt: t,
      updatedAt: t,
    };
    setFolders((fs) => [...fs, folder]);
    void saveFolder(folder);
  }, []);

  const createDocument = useCallback((folderId: string) => {
    const t = now();
    const doc: QrDocument = {
      id: newId(),
      name: labelsRef.current.untitledQr,
      folderId,
      options: defaultOptions(detectCountryCode()),
      createdAt: t,
      updatedAt: t,
    };
    setDocuments((ds) => [...ds, doc]);
    void saveDocument(doc);
    setActiveDocId(doc.id); // open the new document immediately
  }, []);

  const duplicateDocument = useCallback(async (id: string) => {
    const src = documentsRef.current.find((d) => d.id === id);
    if (!src) return;
    const t = now();
    const copy: QrDocument = {
      ...src,
      id: newId(),
      name: labelsRef.current.copySuffix(src.name),
      options: { ...src.options, logo: null },
      createdAt: t,
      updatedAt: t,
    };
    // Place the copy directly after the original, in the same folder.
    const next = [...documentsRef.current];
    next.splice(next.findIndex((d) => d.id === id) + 1, 0, copy);
    documentsRef.current = next;
    setDocuments(next);
    // Persist the copy (and its logo) before opening it, so the switch loads a
    // logo that is already in place.
    await saveDocument(copy);
    await copyLogo(src.id, copy.id);
    setActiveDocId(copy.id);
  }, []);

  const moveDocument = useCallback((id: string, folderId: string) => {
    const d = documentsRef.current.find((x) => x.id === id);
    if (!d || d.folderId === folderId) return;
    const updated: QrDocument = { ...d, folderId, updatedAt: now() };
    setDocuments((ds) => replaceById(ds, updated));
    void saveDocument(updated);
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    const f = foldersRef.current.find((x) => x.id === id);
    if (!f) return;
    const updated: Folder = { ...f, name, updatedAt: now() };
    setFolders((fs) => replaceById(fs, updated));
    void saveFolder(updated);
  }, []);

  const renameDocument = useCallback((id: string, name: string) => {
    const d = documentsRef.current.find((x) => x.id === id);
    if (!d) return;
    const updated: QrDocument = { ...d, name, updatedAt: now() };
    setDocuments((ds) => replaceById(ds, updated));
    void saveDocument(updated);
  }, []);

  const deleteFolder = useCallback(
    (id: string) => {
      const doomed = folderSubtreeIds(id, foldersRef.current);
      void deleteFolderTree(id, foldersRef.current, documentsRef.current);
      setFolders((fs) => fs.filter((f) => !doomed.has(f.id)));
      // Drop fold state for the removed folders so it doesn't linger in prefs.
      setCollapsedFolders((prev) => {
        if (![...prev].some((fid) => doomed.has(fid))) return prev;
        return new Set([...prev].filter((fid) => !doomed.has(fid)));
      });
      settleDocuments(
        documentsRef.current.filter((d) => !doomed.has(d.folderId)),
      );
    },
    [settleDocuments],
  );

  const removeDocument = useCallback(
    (id: string) => {
      void deleteDocument(id);
      settleDocuments(documentsRef.current.filter((d) => d.id !== id));
    },
    [settleDocuments],
  );

  const selectDocument = useCallback((id: string) => {
    setActiveDocId(id);
  }, []);

  const persistActiveOptions = useCallback((options: QrDocument["options"]) => {
    const id = activeIdRef.current;
    const doc = documentsRef.current.find((d) => d.id === id);
    if (!doc) return;
    const updated: QrDocument = {
      ...doc,
      options: { ...options, logo: null },
      updatedAt: now(),
    };
    // Mirror into the ref immediately so a same-tick duplicate sees the edit.
    documentsRef.current = replaceById(documentsRef.current, updated);
    setDocuments((ds) => replaceById(ds, updated));
    void saveDocument(updated);
  }, []);

  return {
    folders,
    documents,
    activeDocId,
    loaded,
    colorFormat,
    setColorFormat,
    collapsedFolders,
    toggleFolder,
    expandFolder,
    createProject,
    createFolder,
    createDocument,
    duplicateDocument,
    moveDocument,
    renameFolder,
    renameDocument,
    deleteFolder,
    removeDocument,
    selectDocument,
    persistActiveOptions,
  };
}
