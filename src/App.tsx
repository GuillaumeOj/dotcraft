import { useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { Preview } from "./components/Preview";
import { Sidebar } from "./components/Sidebar";
import { randomStyle } from "./qr/random";
import { buildSvg } from "./qr/render";
import { clearLogo, loadLogo, saveLogo } from "./qr/storage";
import { DEFAULT_OPTIONS, type QrOptions } from "./qr/types";
import { useLibrary } from "./qr/useLibrary";

export function App() {
  const lib = useLibrary();
  const { activeDocId, documents, persistActiveOptions } = lib;

  // The live editor working copy for the active document. It carries the logo
  // (hydrated from IndexedDB); the persisted snapshot in the library never does.
  const [options, setOptions] = useState<QrOptions>(DEFAULT_OPTIONS);

  // Gate the save effects until the active document's logo has loaded, so they
  // don't clobber the stored logo with the pre-hydration `logo: null`.
  const [ready, setReady] = useState(false);
  // The logo currently persisted for the active document, so the logo save
  // effect can skip rewriting an unchanged value (e.g. the one just hydrated).
  const lastSavedLogo = useRef<string | null>(null);
  // The document whose options/logo are loaded into the editor, so the loader
  // below re-runs only on a real switch — not when editing mutates `documents`.
  const loadedDocId = useRef<string | null>(null);

  const result = useMemo(() => {
    try {
      return { ...buildSvg(options), error: null as string | null };
    } catch (err) {
      return {
        svg: "",
        px: 0,
        error: err instanceof Error ? err.message : "Could not render QR code.",
      };
    }
  }, [options]);

  const patch = (next: Partial<QrOptions>) =>
    setOptions((prev) => ({ ...prev, ...next }));

  // Load the active document into the editor on a real switch, then hydrate its
  // logo from IndexedDB and open the save gate. A stale async resolution (the
  // user switched again mid-load) is dropped via the id check.
  useEffect(() => {
    if (!activeDocId || activeDocId === loadedDocId.current) return;
    loadedDocId.current = activeDocId;
    setReady(false);
    const doc = documents.find((d) => d.id === activeDocId);
    setOptions(doc ? { ...doc.options, logo: null } : DEFAULT_OPTIONS);
    loadLogo(activeDocId).then((logo) => {
      if (loadedDocId.current !== activeDocId) return;
      lastSavedLogo.current = logo;
      if (logo) setOptions((prev) => ({ ...prev, logo }));
      setReady(true);
    });
  }, [activeDocId, documents]);

  // Persist the active document's settings (debounced so typing doesn't thrash).
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => persistActiveOptions(options), 300);
    return () => clearTimeout(id);
  }, [ready, options, persistActiveOptions]);

  // Persist the active document's logo Blob separately whenever it changes.
  const logo = options.logo;
  useEffect(() => {
    if (!ready || !activeDocId || logo === lastSavedLogo.current) return;
    lastSavedLogo.current = logo;
    if (logo) void saveLogo(activeDocId, logo);
    else void clearLogo(activeDocId);
  }, [ready, logo, activeDocId]);

  // Flush the current document before opening another, so edits made within the
  // debounce window aren't lost on the switch.
  const selectDocument = (id: string) => {
    if (activeDocId && activeDocId !== id) persistActiveOptions(options);
    lib.selectDocument(id);
  };

  // Flush the live edits into the source first so the copy includes them.
  const duplicateDocument = (id: string) => {
    if (id === activeDocId) persistActiveOptions(options);
    lib.duplicateDocument(id);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>QR Studio</h1>
        <p>Design a styled QR code, then export it as PNG or SVG.</p>
      </header>

      <main className="app__main">
        <Sidebar
          folders={lib.folders}
          documents={documents}
          activeDocId={activeDocId}
          collapsedFolders={lib.collapsedFolders}
          onCreateProject={lib.createProject}
          onCreateFolder={lib.createFolder}
          onCreateDocument={lib.createDocument}
          onDuplicateDocument={duplicateDocument}
          onMoveDocument={lib.moveDocument}
          onToggleFolder={lib.toggleFolder}
          onExpandFolder={lib.expandFolder}
          onRenameFolder={lib.renameFolder}
          onRenameDocument={lib.renameDocument}
          onDeleteFolder={lib.deleteFolder}
          onDeleteDocument={lib.removeDocument}
          onSelectDocument={selectDocument}
        />
        <Controls
          options={options}
          colorFormat={lib.colorFormat}
          onColorFormatChange={lib.setColorFormat}
          onChange={patch}
          onRandomize={() => patch(randomStyle())}
          onReset={() => setOptions(DEFAULT_OPTIONS)}
        />
        <Preview svg={result.svg} px={result.px} error={result.error} />
      </main>
    </div>
  );
}
