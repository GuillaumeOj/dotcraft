import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as storage from "./qr/storage";
import { DEFAULT_OPTIONS, type QrDocument, type QrOptions } from "./qr/types";
import type { Library } from "./qr/useLibrary";
import { useLibrary } from "./qr/useLibrary";

/** Options on the Text tab, pre-filled — the editor then shows a "Text" field. */
const textOpts = (text: string): QrOptions => ({
  ...DEFAULT_OPTIONS,
  contentType: "text",
  contents: { ...DEFAULT_OPTIONS.contents, text: { type: "text", text } },
});

// The logo blob store and the library hook are exercised in their own suites;
// here we mock them to assert App wires the editor to them correctly.
vi.mock("./qr/storage", () => ({
  loadLogo: vi.fn(async () => null),
  saveLogo: vi.fn(async () => {}),
  clearLogo: vi.fn(async () => {}),
  getPrefs: vi.fn(() => ({
    colorFormat: "hex",
    lastOpenedDocId: null,
    collapsedFolderIds: [],
  })),
  setPrefs: vi.fn(),
  MAX_FOLDER_DEPTH: 5,
}));
vi.mock("./qr/useLibrary", () => ({ useLibrary: vi.fn() }));

const mockedStorage = vi.mocked(storage);
const LOGO = "data:image/png;base64,aaaa";

function makeDoc(over: Partial<QrDocument> = {}): QrDocument {
  return {
    id: "d1",
    name: "QR 1",
    folderId: "p",
    options: { ...DEFAULT_OPTIONS },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function makeLib(over: Partial<Library> = {}): Library {
  return {
    folders: [
      {
        id: "p",
        name: "My Project",
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    documents: [makeDoc()],
    activeDocId: "d1",
    loaded: true,
    colorFormat: "hex",
    setColorFormat: vi.fn(),
    collapsedFolders: new Set<string>(),
    toggleFolder: vi.fn(),
    expandFolder: vi.fn(),
    createProject: vi.fn(),
    createFolder: vi.fn(),
    createDocument: vi.fn(),
    duplicateDocument: vi.fn(),
    moveDocument: vi.fn(),
    renameFolder: vi.fn(),
    renameDocument: vi.fn(),
    deleteFolder: vi.fn(),
    removeDocument: vi.fn(),
    selectDocument: vi.fn(),
    persistActiveOptions: vi.fn(),
    ...over,
  };
}

function setLib(over: Partial<Library> = {}): Library {
  const lib = makeLib(over);
  vi.mocked(useLibrary).mockReturnValue(lib);
  return lib;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStorage.loadLogo.mockResolvedValue(null);
  setLib();
});

describe("App", () => {
  it("renders the library, editor and a live preview", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Dotcraft" }),
    ).toBeInTheDocument();
    // The library title is a panel legend, like the editor surfaces.
    expect(screen.getByRole("group", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(await screen.findByAltText("QR code preview")).toBeInTheDocument();
  });

  it("loads the active document's settings into the editor", async () => {
    setLib({
      documents: [makeDoc({ options: textOpts("restored") })],
      colorFormat: "rgb",
    });
    render(<App />);
    await waitFor(() =>
      expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe(
        "restored",
      ),
    );
    // colorFormat rgb -> RGB channel inputs are shown.
    expect((await screen.findAllByLabelText("R")).length).toBeGreaterThan(0);
  });

  it("hydrates the active document's logo from IndexedDB", async () => {
    mockedStorage.loadLogo.mockResolvedValue(LOGO);
    render(<App />);
    expect(await screen.findByAltText("logo preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Error correction")).toBeDisabled();
    expect(mockedStorage.loadLogo).toHaveBeenCalledWith("d1");
  });

  it("debounces a save of the active document after an edit", async () => {
    const lib = setLib();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const input = screen.getByLabelText("URL");
    await user.clear(input);
    await user.type(input, "hi");
    await waitFor(() => {
      const calls = vi.mocked(lib.persistActiveOptions).mock.calls;
      expect(calls[calls.length - 1]?.[0].contents.url.url).toBe("hi");
    });
  });

  it("clears the persisted logo when it is removed", async () => {
    mockedStorage.loadLogo.mockResolvedValue(LOGO);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Remove logo" }),
    );
    await waitFor(() =>
      expect(mockedStorage.clearLogo).toHaveBeenCalledWith("d1"),
    );
  });

  it("persists a newly uploaded logo for the active document", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const file = new File(["bytes"], "logo.png", { type: "image/png" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    await waitFor(() =>
      expect(mockedStorage.saveLogo).toHaveBeenCalledWith(
        "d1",
        expect.any(String),
      ),
    );
  });

  it("resets the active document to defaults", async () => {
    setLib({
      documents: [makeDoc({ options: textOpts("to-reset") })],
    });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() =>
      expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe(
        "to-reset",
      ),
    );
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    // Reset returns to the default URL tab.
    expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe(
      DEFAULT_OPTIONS.contents.url.url,
    );
  });

  it("randomizes the style without breaking the preview", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Randomize/ }));
    expect(screen.getByAltText("QR code preview")).toBeInTheDocument();
  });

  it("flushes the open document before switching to another", async () => {
    const lib = setLib({
      documents: [makeDoc(), makeDoc({ id: "d2", name: "QR 2" })],
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const library = screen.getByRole("complementary", {
      name: "Saved QR codes",
    });
    await user.click(within(library).getByRole("button", { name: "QR 2" }));
    expect(lib.persistActiveOptions).toHaveBeenCalled();
    expect(lib.selectDocument).toHaveBeenCalledWith("d2");
  });

  it("flushes the active document before duplicating it", async () => {
    const lib = setLib();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const library = screen.getByRole("complementary", {
      name: "Saved QR codes",
    });
    await user.click(within(library).getByLabelText("Duplicate QR code"));
    expect(lib.persistActiveOptions).toHaveBeenCalled();
    expect(lib.duplicateDocument).toHaveBeenCalledWith("d1");
  });

  it("surfaces a render error when the content is emptied", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText("URL"));
    expect(
      await screen.findByText(/Enter some text or a URL/i),
    ).toBeInTheDocument();
  });

  it("switches the interface language and remembers the choice", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    await user.selectOptions(screen.getByLabelText("Language"), "fr");
    // The UI re-renders in the selected language...
    expect(
      await screen.findByText(/Concevez un QR code stylisé/),
    ).toBeInTheDocument();
    expect(document.title).toBe("Dotcraft — éditeur de QR codes stylisés");
    // ...and the choice is persisted.
    expect(mockedStorage.setPrefs).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "fr" }),
    );
  });
});
