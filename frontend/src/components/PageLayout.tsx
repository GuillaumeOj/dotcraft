import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Locale } from "../i18n/locales";
import { updateSyncedSettings } from "../qr/storage";
import { LanguageSelect } from "./LanguageSelect";

/** The chrome for the pages outside the editor (FAQ, Help Center, account): a
 *  back link to the editor, the page title and the language picker, with the
 *  rendered in `<main className="page">`. Keeps the locale in sync the same way
 *  the editor does, so switching language here persists across the app. */
export function PageLayout({
  title,
  subtitle,
  centered = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Centre the content in what's left of the viewport, for the short forms
   *  (sign in, password reset) that would otherwise float against the header. */
  centered?: boolean;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();

  const changeLocale = (next: Locale) => {
    void i18n.changeLanguage(next);
    updateSyncedSettings({ locale: next });
  };

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${title} — Dotcraft`;
  }, [title, i18n.language]);

  return (
    <>
      <header className="app__header page__header">
        <Link className="page__back" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t("nav.backToEditor")}</span>
        </Link>
        <LanguageSelect value={i18n.language} onChange={changeLocale} />
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <main className={centered ? "page page--centered" : "page"}>
        {children}
      </main>
    </>
  );
}
