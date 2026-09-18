import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Locale } from "../i18n/locales";
import { getPrefs, setPrefs } from "../qr/storage";
import { LanguageSelect } from "./LanguageSelect";

/** The chrome for the static content pages (FAQ, Help Center): a back link to
 *  the editor, the page title and the language picker, with the article content
 *  rendered in `<main className="page">`. Keeps the locale in sync the same way
 *  the editor does, so switching language here persists across the app. */
export function PageLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();

  const changeLocale = (next: Locale) => {
    void i18n.changeLanguage(next);
    setPrefs({ ...getPrefs(), locale: next });
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
      <main className="page">{children}</main>
    </>
  );
}
