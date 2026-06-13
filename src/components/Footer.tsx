import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { BLOG_URL, GITHUB_URL } from "../links";

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

/** The footer shared by every route: navigation to the help pages, the author's
 *  blog and the GitHub repo, plus a "Made with ♥ in Lyon" credit. */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="app__footer">
      <nav className="app__footer-links" aria-label={t("footer.label")}>
        <Link className="app__footer-link" to="/faq">
          {t("footer.faq")}
        </Link>
        <Link className="app__footer-link" to="/help-center">
          {t("footer.helpCenter")}
        </Link>
        <a
          className="app__footer-link"
          href={BLOG_URL}
          target="_blank"
          rel="noreferrer"
        >
          {t("footer.blog")}
        </a>
        <a
          className="app__footer-link"
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
        >
          <GithubMark />
          <span>{t("footer.github")}</span>
        </a>
      </nav>
      <p className="app__footer-credit">
        {t("footer.madeWithPrefix")}{" "}
        <Heart
          className="app__footer-heart"
          size={13}
          aria-label={t("footer.love")}
        />{" "}
        {t("footer.madeWithSuffix")}
      </p>
    </footer>
  );
}
