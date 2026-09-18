import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/PageLayout";

/** The fixed set of FAQ entries, rendered in order. Each id maps to a
 *  `faq.items.<id>.q` / `.a` pair in the catalogs. */
const FAQ_IDS = [
  "privacy",
  "free",
  "account",
  "expire",
  "formats",
  "clearData",
] as const;

/** The FAQ route: short question/answer pairs about privacy, pricing and how the
 *  browser-only library behaves. */
export function FaqPage() {
  const { t } = useTranslation();
  return (
    <PageLayout title={t("faq.title")} subtitle={t("faq.subtitle")}>
      <dl className="faq">
        {FAQ_IDS.map((id) => (
          <div className="faq__item" key={id}>
            <dt className="faq__question">{t(`faq.items.${id}.q`)}</dt>
            <dd className="faq__answer">{t(`faq.items.${id}.a`)}</dd>
          </div>
        ))}
      </dl>
    </PageLayout>
  );
}
