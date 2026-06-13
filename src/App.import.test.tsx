/** End-to-end test for the library import flow against the real storage and
 *  archive modules (no mocks), proving that an imported logo is restored *and*
 *  displayed. jsdom's Blob doesn't survive fake-indexeddb's structured clone, so
 *  we swap in Node's Blob (which does) plus the fetch/FileReader stubs the
 *  storage suite uses, giving browser-like Blob behaviour end to end. */

import { Blob as NodeBlob } from "node:buffer";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { exportLibrary } from "./qr/libraryArchive";
import {
  clearLibrary,
  saveDocument,
  saveFolder,
  saveLogo,
  setPrefs,
} from "./qr/storage";
import { DEFAULT_OPTIONS, type Folder, type QrDocument } from "./qr/types";
import { resetDb } from "./test/db";

const DATA_URL = "data:image/png;base64,aGVsbG8="; // "hello"

const FOLDER: Folder = {
  id: "p",
  name: "Project",
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
};
const DOC: QrDocument = {
  id: "d1",
  name: "One",
  folderId: "p",
  options: { ...DEFAULT_OPTIONS },
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
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
      readAsDataURL(blob: {
        arrayBuffer(): Promise<ArrayBuffer>;
        type: string;
      }) {
        blob.arrayBuffer().then((buf) => {
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (const b of bytes) bin += String.fromCharCode(b);
          this.result = `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
          this.onload?.();
        });
      }
    },
  );
});

describe("library import (end to end)", () => {
  it("restores and displays a logo that was missing before import", async () => {
    await resetDb();

    // Build an archive from a library whose only document has a logo.
    await saveFolder(FOLDER);
    await saveDocument(DOC);
    await saveLogo("d1", DATA_URL);
    setPrefs({
      colorFormat: "hex",
      lastOpenedDocId: "d1",
      collapsedFolderIds: [],
      collapsedPanelIds: [],
    });
    const bytes = await exportLibrary();

    // Reset to the same document WITHOUT a logo — the starting state the user
    // imports into.
    await clearLibrary();
    await saveFolder(FOLDER);
    await saveDocument(DOC);
    setPrefs({
      colorFormat: "hex",
      lastOpenedDocId: "d1",
      collapsedFolderIds: [],
      collapsedPanelIds: [],
    });

    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    // No logo yet.
    expect(screen.queryByAltText("logo preview")).not.toBeInTheDocument();

    // Import the archive and confirm in the modal.
    const aside = screen.getByRole("complementary", { name: "Saved QR codes" });
    const input = within(aside).getByLabelText(
      "Replace your library with a .dotcraft file",
      { selector: "input" },
    );
    await user.upload(input, new File([new Uint8Array(bytes)], "lib.dotcraft"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    // The restored logo is now shown in the editor.
    await waitFor(() =>
      expect(screen.getByAltText("logo preview")).toBeInTheDocument(),
    );
  });
});
