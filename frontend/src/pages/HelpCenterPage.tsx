import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { PageLayout } from "../components/PageLayout";
import { BUG_REPORT_URL, FEATURE_REQUEST_URL } from "../links";

/** The error-correction levels explained in the dedicated article, reusing the
 *  editor's own labels and descriptions so the two never drift. */
const EC_LEVELS = ["L", "M", "Q", "H"] as const;

/** Each help article: a stable `id` used as the in-page anchor (matched by the
 *  `InfoLink`s on the editor controls) and the catalog `key` for its copy. */
const ARTICLES = [
  { id: "library", key: "library" },
  { id: "export-qr", key: "exportQr" },
  { id: "error-correction", key: "errorCorrection" },
  { id: "request-feature", key: "requestFeature", cta: FEATURE_REQUEST_URL },
  { id: "report-bug", key: "reportBug", cta: BUG_REPORT_URL },
] as const;

/** Render a body string as one or more paragraphs (blank line separated). */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((para) => (
        <p key={para}>{para}</p>
      ))}
    </>
  );
}

/** The Help Center route: how-to articles for the library, exporting, error
 *  correction, and reaching the author via GitHub issue forms. Deep links like
 *  `/help-center#error-correction` scroll straight to the relevant article. */
export function HelpCenterPage() {
  const { t } = useTranslation();
  const { hash } = useLocation();

  // Scroll to the anchored article on load and whenever the hash changes, so the
  // control info icons land the reader on the right section.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <PageLayout
      title={t("helpCenter.title")}
      subtitle={t("helpCenter.subtitle")}
    >
      <div className="help">
        {ARTICLES.map((article) => (
          <article className="help__article" id={article.id} key={article.id}>
            <h2 className="help__title">
              {t(`helpCenter.articles.${article.key}.title`)}
            </h2>
            <Paragraphs text={t(`helpCenter.articles.${article.key}.body`)} />

            {article.key === "library" && (
              <div className="help__warning" role="note">
                <AlertTriangle
                  className="help__warning-icon"
                  size={16}
                  aria-hidden="true"
                />
                <span>{t("helpCenter.articles.library.warning")}</span>
              </div>
            )}

            {article.key === "errorCorrection" && (
              <>
                <dl className="help__ec">
                  {EC_LEVELS.map((lvl) => (
                    <div className="help__ec-row" key={lvl}>
                      <dt>{t(`controls.ecLabels.${lvl}`)}</dt>
                      <dd>{t(`controls.ecDescriptions.${lvl}`)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="hint">{t("controls.logoForcesHigh")}</p>
              </>
            )}

            {"cta" in article && (
              <a
                className="btn"
                href={article.cta}
                target="_blank"
                rel="noreferrer"
              >
                {t(`helpCenter.articles.${article.key}.cta`)}
              </a>
            )}
          </article>
        ))}
      </div>
    </PageLayout>
  );
}
