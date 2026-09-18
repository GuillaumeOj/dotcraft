import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "../i18n/locales";
import { LanguageSelect } from "./LanguageSelect";

/** The mobile navbar: a hamburger that toggles a stacked menu holding the
 *  language picker and links opening the library and settings modals. Hidden on
 *  desktop via CSS. The open state is transient (closes on selection, Escape, or
 *  an outside click). */
export function Navbar({
  language,
  onChangeLanguage,
  onOpenLibrary,
  onOpenSettings,
}: {
  language: string;
  onChangeLanguage: (locale: Locale) => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div className="navbar" ref={ref}>
      <button
        type="button"
        className="navbar__toggle"
        aria-label={t("nav.menu")}
        aria-expanded={open}
        aria-controls="navbar-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X size={18} aria-hidden="true" />
        ) : (
          <Menu size={18} aria-hidden="true" />
        )}
      </button>
      {open && (
        <nav id="navbar-menu" className="navbar__menu">
          <LanguageSelect
            className="navbar__lang"
            value={language}
            onChange={(locale) => select(() => onChangeLanguage(locale))}
          />
          <button
            type="button"
            className="navbar__item"
            onClick={() => select(onOpenLibrary)}
          >
            {t("sidebar.library")}
          </button>
          <button
            type="button"
            className="navbar__item"
            onClick={() => select(onOpenSettings)}
          >
            {t("controls.settings")}
          </button>
        </nav>
      )}
    </div>
  );
}
