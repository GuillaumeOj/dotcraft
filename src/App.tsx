import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Controls } from "./components/Controls";
import { Preview } from "./components/Preview";
import { Sidebar } from "./components/Sidebar";
import { describeRenderError } from "./i18n/errors";
import { LOCALE_LABELS, LOCALES, type Locale } from "./i18n/locales";
import { randomStyle } from "./qr/random";
import { buildSvg } from "./qr/render";
import {
  clearLogo,
  getPrefs,
  loadLogo,
  saveLogo,
  setPrefs,
} from "./qr/storage";
import { DEFAULT_OPTIONS, type QrOptions } from "./qr/types";
import { type LibraryLabels, useLibrary } from "./qr/useLibrary";

function GithubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function App() {
  const { t, i18n } = useTranslation();

  // Default names for items the library creates, in the current language. New
  // projects/documents are named in the active locale; existing ones keep their
  // stored name.
  const libraryLabels = useMemo<LibraryLabels>(
    () => ({
      myProject: t("library.myProject"),
      myQrCode: t("library.myQrCode"),
      newProject: t("library.newProject"),
      newFolder: t("library.newFolder"),
      untitledQr: t("library.untitledQr"),
      copySuffix: (name) => t("library.copySuffix", { name }),
    }),
    [t],
  );
  const lib = useLibrary(libraryLabels);
  const { activeDocId, documents, persistActiveOptions } = lib;

  const changeLocale = (next: Locale) => {
    void i18n.changeLanguage(next);
    setPrefs({ ...getPrefs(), locale: next });
  };

  // Keep the document title, language attribute and meta description in sync
  // with the selected locale (the static index.html is the English baseline).
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = t("app.documentTitle");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("app.metaDescription"));
  }, [t, i18n.language]);

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

  const error = result.error ? describeRenderError(result.error, t) : null;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1>Dotcraft</h1>
          <select
            className="app__lang"
            aria-label={t("app.language")}
            value={i18n.language}
            onChange={(e) => changeLocale(e.target.value as Locale)}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <p>{t("app.tagline")}</p>
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
        <Preview svg={result.svg} px={result.px} error={error} />
      </main>

      <footer className="app__footer">
        <a
          className="app__footer-link"
          href="https://github.com/GuillaumeOj/dotcraft"
          target="_blank"
          rel="noreferrer"
        >
          <GithubMark />
          <span>{t("app.viewOnGithub")}</span>
        </a>
      </footer>
    </div>
  );
}
