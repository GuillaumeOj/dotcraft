import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  FilePlus2,
  FolderPlus,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { MAX_FOLDER_DEPTH } from "../qr/storage";
import type { Folder, QrDocument } from "../qr/types";
import { InfoLink } from "./InfoLink";
import { Panel } from "./Panel";

const ICON = 15;
/** How long a dragged document must hover a collapsed folder before it opens. */
const AUTO_EXPAND_MS = 600;

/** The public API: the data plus the library actions. */
export interface SidebarProps {
  /** Desktop-only: render the hide/show control and reflect its state. Omitted
   *  (false) inside the mobile modal, where the library has no collapsed form. */
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?(): void;
  folders: Folder[];
  documents: QrDocument[];
  activeDocId: string | null;
  collapsedFolders: Set<string>;
  onCreateProject(): void;
  onExportLibrary(): void;
  onImportLibrary(file: File): void;
  onCreateFolder(parentId: string): void;
  onCreateDocument(folderId: string): void;
  onDuplicateDocument(id: string): void;
  onMoveDocument(id: string, folderId: string): void;
  onToggleFolder(id: string): void;
  onExpandFolder(id: string): void;
  onRenameFolder(id: string, name: string): void;
  onRenameDocument(id: string, name: string): void;
  onDeleteFolder(id: string): void;
  onDeleteDocument(id: string): void;
  onSelectDocument(id: string): void;
}

/** What the recursive nodes receive: the public props plus shared drag state so
 *  a document dragged from anywhere can be dropped onto any folder, and the
 *  children pre-indexed by parent so each node is an O(1) lookup, not a scan. */
interface TreeCtx extends SidebarProps {
  draggingId: string | null;
  dropFolderId: string | null;
  foldersByParent: Map<string | null, Folder[]>;
  docsByFolder: Map<string, QrDocument[]>;
  onDocDragStart(id: string): void;
  onDragEnd(): void;
  onFolderDragOver(folderId: string): void;
  onFolderDrop(folderId: string): void;
}

/** Group `items` into a Map keyed by `key(item)`, preserving order. */
function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const arr = map.get(key(item));
    if (arr) arr.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const onImportChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the user re-pick the same file later
    if (file) props.onImportLibrary(file);
  };

  // Index the tree once per change rather than filtering inside every node.
  const foldersByParent = useMemo(
    () => groupBy(props.folders, (f) => f.parentId),
    [props.folders],
  );
  const docsByFolder = useMemo(
    () => groupBy(props.documents, (d) => d.folderId),
    [props.documents],
  );

  const ctx: TreeCtx = {
    ...props,
    draggingId,
    dropFolderId,
    foldersByParent,
    docsByFolder,
    onDocDragStart: setDraggingId,
    onDragEnd: () => {
      setDraggingId(null);
      setDropFolderId(null);
    },
    onFolderDragOver: setDropFolderId,
    onFolderDrop: (folderId) => {
      if (draggingId) props.onMoveDocument(draggingId, folderId);
      setDraggingId(null);
      setDropFolderId(null);
    },
  };

  // Auto-expand a collapsed folder the dragged document lingers over, so it can
  // be dropped into a nested folder.
  const { collapsedFolders, onExpandFolder } = props;
  useEffect(() => {
    if (!draggingId || !dropFolderId || !collapsedFolders.has(dropFolderId))
      return;
    const t = setTimeout(() => onExpandFolder(dropFolderId), AUTO_EXPAND_MS);
    return () => clearTimeout(t);
  }, [draggingId, dropFolderId, collapsedFolders, onExpandFolder]);

  const projects = foldersByParent.get(null) ?? [];
  const collapseLabel = t(
    props.collapsed ? "sidebar.showLibrary" : "sidebar.hideLibrary",
  );
  return (
    <aside
      id="library"
      className="sidebar"
      aria-label={t("sidebar.savedQrCodes")}
    >
      {props.collapsible && (
        <button
          type="button"
          className="sidebar__collapse"
          aria-expanded={!props.collapsed}
          aria-controls="library"
          aria-label={collapseLabel}
          title={collapseLabel}
          onClick={props.onToggleCollapse}
        >
          {props.collapsed ? (
            <ChevronsRight size={ICON} aria-hidden="true" />
          ) : (
            <ChevronsLeft size={ICON} aria-hidden="true" />
          )}
        </button>
      )}
      <Panel
        title={t("sidebar.library")}
        className="sidebar__panel"
        info={<InfoLink anchor="library" label={t("info.library")} />}
      >
        <button
          type="button"
          className="btn btn--ghost sidebar__new"
          onClick={props.onCreateProject}
        >
          <Plus size={ICON} aria-hidden="true" />
          {t("sidebar.newProject")}
        </button>
        <div className="sidebar__library-actions">
          <button
            type="button"
            className="btn btn--ghost sidebar__library-action"
            title={t("sidebar.exportLibraryTitle")}
            onClick={props.onExportLibrary}
          >
            <Download size={ICON} aria-hidden="true" />
            {t("sidebar.exportLibrary")}
          </button>
          <button
            type="button"
            className="btn btn--ghost sidebar__library-action"
            title={t("sidebar.importLibraryTitle")}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload size={ICON} aria-hidden="true" />
            {t("sidebar.importLibrary")}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".dotcraft"
            className="sidebar__import-input"
            aria-label={t("sidebar.importLibraryTitle")}
            onChange={onImportChange}
          />
        </div>
        {projects.length === 0 ? (
          <p className="hint">{t("sidebar.noProjects")}</p>
        ) : (
          <ul className="tree">
            {projects.map((folder) => (
              <FolderNode key={folder.id} folder={folder} depth={1} ctx={ctx} />
            ))}
          </ul>
        )}
      </Panel>
    </aside>
  );
}

/** A text input that replaces a label while renaming; commits on Enter/blur and
 *  cancels on Escape. An empty value keeps the previous name. */
function InlineEdit({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit(name: string): void;
  onCancel(): void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // Focus and select the name when the rename field opens.
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => onCommit(draft.trim() || value);
  return (
    <input
      ref={ref}
      type="text"
      className="tree__edit"
      aria-label={t("sidebar.editName")}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") onCancel();
      }}
    />
  );
}

/** An icon-only action button used throughout the tree rows. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="tree__action"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FolderNode({
  folder,
  depth,
  ctx,
}: {
  folder: Folder;
  depth: number;
  ctx: TreeCtx;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const childFolders = ctx.foldersByParent.get(folder.id) ?? [];
  const childDocs = ctx.docsByFolder.get(folder.id) ?? [];
  const isProject = folder.parentId === null;
  const expanded = !ctx.collapsedFolders.has(folder.id);
  const toggle = () => ctx.onToggleFolder(folder.id);
  const canNest = depth < MAX_FOLDER_DEPTH;
  const isDropTarget = ctx.dropFolderId === folder.id;

  return (
    <li className="tree__item">
      <div
        className={`tree__row tree__row--${isProject ? "project" : "folder"}${isDropTarget ? " is-drop" : ""}`}
        role="treeitem"
        aria-expanded={expanded}
        aria-label={folder.name}
        tabIndex={0}
        onDragOver={(e) => {
          if (!ctx.draggingId) return;
          e.preventDefault();
          ctx.onFolderDragOver(folder.id);
        }}
        onDrop={(e) => {
          if (!ctx.draggingId) return;
          e.preventDefault();
          ctx.onFolderDrop(folder.id);
        }}
      >
        <button
          type="button"
          className="tree__caret"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? t("sidebar.collapse", { name: folder.name })
              : t("sidebar.expand", { name: folder.name })
          }
          onClick={toggle}
        >
          {expanded ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronRight size={14} aria-hidden="true" />
          )}
        </button>
        {editing ? (
          <InlineEdit
            value={folder.name}
            onCommit={(name) => {
              ctx.onRenameFolder(folder.id, name);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className="tree__name tree__name--folder"
            onClick={toggle}
          >
            {folder.name}
          </button>
        )}
        <span className="tree__actions">
          <IconButton
            label={t("sidebar.addQrCode")}
            onClick={() => ctx.onCreateDocument(folder.id)}
          >
            <FilePlus2 size={ICON} aria-hidden="true" />
          </IconButton>
          {canNest && (
            <IconButton
              label={t("sidebar.addSubfolder")}
              onClick={() => ctx.onCreateFolder(folder.id)}
            >
              <FolderPlus size={ICON} aria-hidden="true" />
            </IconButton>
          )}
          <IconButton
            label={
              isProject ? t("sidebar.renameProject") : t("sidebar.renameFolder")
            }
            onClick={() => setEditing(true)}
          >
            <Pencil size={ICON} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={
              isProject ? t("sidebar.deleteProject") : t("sidebar.deleteFolder")
            }
            onClick={() => {
              if (
                window.confirm(
                  t("sidebar.confirmDeleteFolder", { name: folder.name }),
                )
              )
                ctx.onDeleteFolder(folder.id);
            }}
          >
            <Trash2 size={ICON} aria-hidden="true" />
          </IconButton>
        </span>
      </div>

      {expanded && (childFolders.length > 0 || childDocs.length > 0) && (
        <ul className="tree tree--nested">
          {childFolders.map((f) => (
            <FolderNode key={f.id} folder={f} depth={depth + 1} ctx={ctx} />
          ))}
          {childDocs.map((doc) => (
            <DocNode key={doc.id} doc={doc} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

function DocNode({ doc, ctx }: { doc: QrDocument; ctx: TreeCtx }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const active = doc.id === ctx.activeDocId;
  const dragging = ctx.draggingId === doc.id;

  return (
    <li className="tree__item">
      <div
        className={`tree__row tree__row--doc${active ? " is-active" : ""}${
          dragging ? " is-dragging" : ""
        }`}
        role="treeitem"
        aria-selected={active}
        aria-label={doc.name}
        tabIndex={0}
        draggable={!editing}
        onDragStart={(e) => {
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          ctx.onDocDragStart(doc.id);
        }}
        onDragEnd={ctx.onDragEnd}
      >
        <span className="tree__caret tree__caret--leaf">
          <QrCode size={13} aria-hidden="true" />
        </span>
        {editing ? (
          <InlineEdit
            value={doc.name}
            onCommit={(name) => {
              ctx.onRenameDocument(doc.id, name);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            className="tree__name tree__name--doc"
            aria-current={active ? "true" : undefined}
            onClick={() => ctx.onSelectDocument(doc.id)}
          >
            {doc.name}
          </button>
        )}
        <span className="tree__actions">
          <IconButton
            label={t("sidebar.duplicateQrCode")}
            onClick={() => ctx.onDuplicateDocument(doc.id)}
          >
            <Copy size={ICON} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={t("sidebar.renameQrCode")}
            onClick={() => setEditing(true)}
          >
            <Pencil size={ICON} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={t("sidebar.deleteQrCode")}
            onClick={() => {
              if (
                window.confirm(
                  t("sidebar.confirmDeleteDoc", { name: doc.name }),
                )
              )
                ctx.onDeleteDocument(doc.id);
            }}
          >
            <Trash2 size={ICON} aria-hidden="true" />
          </IconButton>
        </span>
      </div>
    </li>
  );
}
