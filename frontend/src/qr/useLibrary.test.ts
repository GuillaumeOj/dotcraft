import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../test/db";
import { getPrefs } from "./storage";
import { DEFAULT_OPTIONS } from "./types";
import { useLibrary } from "./useLibrary";

beforeEach(async () => {
  await resetDb();
});

/** The most recently appended item. */
function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

/** Render the hook and wait for the async initial load to settle. */
async function mounted() {
  const view = renderHook(() => useLibrary());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
}

describe("useLibrary — first run", () => {
  it("seeds a starter project and opens its document", async () => {
    const { result } = await mounted();
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0].name).toBe("My Project");
    expect(result.current.folders[0].parentId).toBeNull();
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.activeDocId).toBe(result.current.documents[0].id);
  });

  it("records the open document and colour format in preferences", async () => {
    const { result } = await mounted();
    act(() => result.current.setColorFormat("hsl"));
    await waitFor(() =>
      expect(getPrefs()).toEqual({
        colorFormat: "hsl",
        lastOpenedDocId: result.current.activeDocId,
        collapsedFolderIds: [],
        collapsedPanelIds: [],
      }),
    );
  });
});

describe("useLibrary — folder fold state", () => {
  it("toggles and persists a folder's collapsed state", async () => {
    const { result } = await mounted();
    const id = result.current.folders[0].id;
    act(() => result.current.toggleFolder(id));
    expect(result.current.collapsedFolders.has(id)).toBe(true);
    await waitFor(() => expect(getPrefs().collapsedFolderIds).toEqual([id]));

    act(() => result.current.toggleFolder(id));
    expect(result.current.collapsedFolders.has(id)).toBe(false);
    await waitFor(() => expect(getPrefs().collapsedFolderIds).toEqual([]));
  });

  it("expandFolder only clears a collapsed folder", async () => {
    const { result } = await mounted();
    const id = result.current.folders[0].id;
    act(() => result.current.toggleFolder(id)); // collapse
    act(() => result.current.expandFolder(id));
    expect(result.current.collapsedFolders.has(id)).toBe(false);
    // Expanding an already-open folder is a no-op.
    act(() => result.current.expandFolder(id));
    expect(result.current.collapsedFolders.has(id)).toBe(false);
  });

  it("restores fold state from preferences on load", async () => {
    const first = await mounted();
    const id = first.result.current.folders[0].id;
    act(() => first.result.current.toggleFolder(id));
    await waitFor(() => expect(getPrefs().collapsedFolderIds).toEqual([id]));
    first.unmount();

    // A fresh mount (same storage) starts with the folder still collapsed.
    const second = await mounted();
    expect(second.result.current.collapsedFolders.has(id)).toBe(true);
  });

  it("drops fold state for deleted folders", async () => {
    const { result } = await mounted();
    const projectId = result.current.folders[0].id;
    act(() => result.current.createFolder(projectId));
    const sub = last(result.current.folders).id;
    act(() => result.current.toggleFolder(sub));
    expect(result.current.collapsedFolders.has(sub)).toBe(true);

    act(() => result.current.deleteFolder(projectId));
    expect(result.current.collapsedFolders.has(sub)).toBe(false);
  });
});

describe("useLibrary — tree editing", () => {
  it("creates projects, nested folders and documents", async () => {
    const { result } = await mounted();
    act(() => result.current.createProject());
    const project = last(result.current.folders);
    expect(project.parentId).toBeNull();

    act(() => result.current.createFolder(project.id));
    const sub = last(result.current.folders);
    expect(sub.parentId).toBe(project.id);

    act(() => result.current.createDocument(sub.id));
    const created = last(result.current.documents);
    expect(created.folderId).toBe(sub.id);
    // Creating a document opens it.
    expect(result.current.activeDocId).toBe(created.id);
  });

  it("duplicates a document next to the original in the same folder", async () => {
    const { result } = await mounted();
    const originalId = result.current.documents[0].id;
    act(() => result.current.renameDocument(originalId, "Original"));
    await act(async () => {
      await result.current.duplicateDocument(originalId);
    });
    const docs = result.current.documents;
    expect(docs).toHaveLength(2);
    expect(docs[0].id).toBe(originalId);
    expect(docs[1].name).toBe("Original copy");
    expect(docs[1].id).not.toBe(originalId);
    expect(docs[1].folderId).toBe(docs[0].folderId);
    // The copy opens automatically.
    expect(result.current.activeDocId).toBe(docs[1].id);
  });

  it("moves a document into another folder", async () => {
    const { result } = await mounted();
    const projectId = result.current.folders[0].id;
    act(() => result.current.createFolder(projectId));
    const sub = last(result.current.folders).id;
    const docId = result.current.documents[0].id;

    act(() => result.current.moveDocument(docId, sub));
    expect(result.current.documents.find((d) => d.id === docId)?.folderId).toBe(
      sub,
    );
  });

  it("stops nesting folders past the depth cap", async () => {
    const { result } = await mounted();
    // Project is level 1; nest four more to reach the level-5 cap.
    let parent = result.current.folders[0].id;
    for (let i = 0; i < 6; i++) {
      const before = result.current.folders.length;
      act(() => result.current.createFolder(parent));
      // Once at the cap, createFolder is a no-op and the count stops growing.
      if (result.current.folders.length > before)
        parent = last(result.current.folders).id;
    }
    // 1 project + 4 nested folders = 5 levels, and no deeper.
    expect(result.current.folders).toHaveLength(5);
  });

  it("renames folders and documents", async () => {
    const { result } = await mounted();
    const folderId = result.current.folders[0].id;
    const docId = result.current.documents[0].id;
    act(() => result.current.renameFolder(folderId, "Renamed project"));
    act(() => result.current.renameDocument(docId, "Renamed doc"));
    expect(result.current.folders[0].name).toBe("Renamed project");
    expect(result.current.documents[0].name).toBe("Renamed doc");
  });

  it("writes edited options back to the active document", async () => {
    const { result } = await mounted();
    act(() =>
      result.current.persistActiveOptions({
        ...DEFAULT_OPTIONS,
        contentType: "text",
        contents: {
          ...DEFAULT_OPTIONS.contents,
          text: { type: "text", text: "edited" },
        },
      }),
    );
    const active = result.current.documents.find(
      (d) => d.id === result.current.activeDocId,
    );
    expect(active?.options.contents.text).toEqual({
      type: "text",
      text: "edited",
    });
  });
});

describe("useLibrary — deletion", () => {
  it("reselects another document when the active one is deleted", async () => {
    const { result } = await mounted();
    const projectId = result.current.folders[0].id;
    act(() => result.current.createDocument(projectId)); // becomes active
    const second = result.current.activeDocId;
    const first = result.current.documents.find((d) => d.id !== second);

    act(() => result.current.removeDocument(second as string));
    expect(result.current.documents.map((d) => d.id)).toEqual([first?.id]);
    expect(result.current.activeDocId).toBe(first?.id);
  });

  it("reseeds a starter when the last document is deleted", async () => {
    const { result } = await mounted();
    const only = result.current.documents[0].id;
    act(() => result.current.removeDocument(only));
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0].id).not.toBe(only);
    expect(result.current.documents[0].name).toBe("My QR code");
    expect(result.current.activeDocId).toBe(result.current.documents[0].id);
  });

  it("cascades a folder deletion to nested folders and documents", async () => {
    const { result } = await mounted();
    const projectId = result.current.folders[0].id;
    act(() => result.current.createFolder(projectId));
    const sub = last(result.current.folders).id;
    act(() => result.current.createDocument(sub));

    act(() => result.current.deleteFolder(projectId));
    // Everything under the project is gone; a starter is reseeded.
    expect(
      result.current.folders.some((f) => f.id === projectId || f.id === sub),
    ).toBe(false);
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.documents).toHaveLength(1);
  });
});

describe("useLibrary — migration", () => {
  it("opens a migrated legacy document on first load", async () => {
    localStorage.setItem(
      "qr-studio:state",
      JSON.stringify({
        version: 1,
        options: { dotStyle: "circle", data: "legacy" },
        colorFormat: "named",
      }),
    );
    const { result } = await mounted();
    expect(result.current.folders[0].name).toBe("My Project");
    expect(result.current.documents[0].name).toBe("My QR code");
    expect(result.current.documents[0].options.contents.text).toEqual({
      type: "text",
      text: "legacy",
    });
    expect(result.current.activeDocId).toBe(result.current.documents[0].id);
    expect(result.current.colorFormat).toBe("named");
  });
});
