import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, type Folder, type QrDocument } from "../qr/types";
import { Sidebar, type SidebarProps } from "./Sidebar";

function folder(over: Partial<Folder>): Folder {
  return {
    id: "f",
    name: "Folder",
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}
function doc(over: Partial<QrDocument>): QrDocument {
  return {
    id: "d",
    name: "Doc",
    folderId: "p",
    options: { ...DEFAULT_OPTIONS },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function setup(over: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    folders: [
      folder({ id: "p", name: "My Project", parentId: null }),
      folder({ id: "s", name: "Sub", parentId: "p" }),
    ],
    documents: [
      doc({ id: "d1", name: "QR One", folderId: "p" }),
      doc({ id: "d2", name: "QR Two", folderId: "s" }),
    ],
    activeDocId: "d1",
    collapsedFolders: new Set<string>(),
    onCreateProject: vi.fn(),
    onCreateFolder: vi.fn(),
    onCreateDocument: vi.fn(),
    onDuplicateDocument: vi.fn(),
    onMoveDocument: vi.fn(),
    onToggleFolder: vi.fn(),
    onExpandFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onRenameDocument: vi.fn(),
    onDeleteFolder: vi.fn(),
    onDeleteDocument: vi.fn(),
    onSelectDocument: vi.fn(),
    ...over,
  };
  render(<Sidebar {...props} />);
  return props;
}

/** The `.tree__row` wrapping a folder/document with the given visible name. */
function row(name: string): HTMLElement {
  const el = screen.getByText(name).closest(".tree__row");
  if (!el) throw new Error(`no row for ${name}`);
  return el as HTMLElement;
}

describe("Sidebar", () => {
  it("renders projects with their nested folders and documents", () => {
    setup();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByText("QR One")).toBeInTheDocument();
    expect(screen.getByText("QR Two")).toBeInTheDocument();
  });

  it("shows an empty hint when there are no projects", () => {
    setup({ folders: [], documents: [] });
    expect(screen.getByText("No projects yet.")).toBeInTheDocument();
  });

  it("creates a project", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole("button", { name: "New Project" }));
    expect(props.onCreateProject).toHaveBeenCalled();
  });

  it("adds a QR code and a subfolder to a folder", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(within(row("My Project")).getByLabelText("Add QR code"));
    expect(props.onCreateDocument).toHaveBeenCalledWith("p");
    await user.click(within(row("My Project")).getByLabelText("Add subfolder"));
    expect(props.onCreateFolder).toHaveBeenCalledWith("p");
  });

  it("opens a document and marks the active one", async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(within(row("QR One")).getByText("QR One")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await user.click(within(row("QR Two")).getByText("QR Two"));
    expect(props.onSelectDocument).toHaveBeenCalledWith("d2");
  });

  it("renames a folder on Enter and ignores an Escape", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(
      within(row("My Project")).getByLabelText("Rename project"),
    );
    const input = screen.getByLabelText("Edit name");
    await user.clear(input);
    await user.type(input, "Renamed{Enter}");
    expect(props.onRenameFolder).toHaveBeenCalledWith("p", "Renamed");

    await user.click(within(row("Sub")).getByLabelText("Rename folder"));
    await user.type(screen.getByLabelText("Edit name"), "x{Escape}");
    expect(props.onRenameFolder).toHaveBeenCalledTimes(1);
  });

  it("renames a document", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(within(row("QR One")).getByLabelText("Rename QR code"));
    const input = screen.getByLabelText("Edit name");
    await user.clear(input);
    await user.type(input, "New name{Enter}");
    expect(props.onRenameDocument).toHaveBeenCalledWith("d1", "New name");
  });

  it("confirms before deleting a folder", async () => {
    const user = userEvent.setup();
    const props = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(
      within(row("My Project")).getByLabelText("Delete project"),
    );
    expect(props.onDeleteFolder).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(
      within(row("My Project")).getByLabelText("Delete project"),
    );
    expect(props.onDeleteFolder).toHaveBeenCalledWith("p");
  });

  it("duplicates a document", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(within(row("QR One")).getByLabelText("Duplicate QR code"));
    expect(props.onDuplicateDocument).toHaveBeenCalledWith("d1");
  });

  it("confirms before deleting a document", async () => {
    const user = userEvent.setup();
    const props = setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(within(row("QR One")).getByLabelText("Delete QR code"));
    expect(props.onDeleteDocument).toHaveBeenCalledWith("d1");
  });

  it("moves a document onto a folder via drag and drop", () => {
    const props = setup();
    // Drag "QR One" (in the project) onto the "Sub" folder.
    fireEvent.dragStart(row("QR One"));
    fireEvent.dragOver(row("Sub"));
    fireEvent.drop(row("Sub"));
    expect(props.onMoveDocument).toHaveBeenCalledWith("d1", "s");
  });

  it("hides the add-subfolder action at the maximum depth", () => {
    // Build a 5-deep chain: f1 (project) > f2 > f3 > f4 > f5.
    const folders = [1, 2, 3, 4, 5].map((n) =>
      folder({
        id: `f${n}`,
        name: `Level ${n}`,
        parentId: n === 1 ? null : `f${n - 1}`,
      }),
    );
    setup({ folders, documents: [] });
    // Shallower folders still offer it...
    expect(
      within(row("Level 4")).queryByLabelText("Add subfolder"),
    ).toBeInTheDocument();
    // ...but the 5th (deepest) level does not.
    expect(
      within(row("Level 5")).queryByLabelText("Add subfolder"),
    ).not.toBeInTheDocument();
  });

  it("toggles a folder's fold state via the caret", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(
      within(row("My Project")).getByLabelText("Collapse My Project"),
    );
    expect(props.onToggleFolder).toHaveBeenCalledWith("p");
  });

  it("hides the contents of a collapsed folder", () => {
    setup({ collapsedFolders: new Set(["p"]) });
    // The project row still shows, but its children are hidden.
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.queryByText("QR One")).not.toBeInTheDocument();
    expect(screen.queryByText("Sub")).not.toBeInTheDocument();
  });

  it("auto-expands a collapsed folder a dragged document hovers over", () => {
    vi.useFakeTimers();
    try {
      const props = setup({ collapsedFolders: new Set(["s"]) });
      fireEvent.dragStart(row("QR One"));
      fireEvent.dragOver(row("Sub"));
      act(() => vi.advanceTimersByTime(700));
      expect(props.onExpandFolder).toHaveBeenCalledWith("s");
    } finally {
      vi.useRealTimers();
    }
  });
});
