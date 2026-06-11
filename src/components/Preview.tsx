import { useTranslation } from "react-i18next";
import { svgDataUri } from "../qr/export";

export function Preview({ svg, error }: { svg: string; error: string | null }) {
  const { t } = useTranslation();

  return (
    <fieldset className="panel preview">
      <legend>{t("preview.title")}</legend>
      <div className="preview__stage">
        {error ? (
          <p className="preview__error">{error}</p>
        ) : (
          // SVG via <img> renders in image mode (no script execution), so the
          // markup can never run code even though it contains user-set colors.
          <img
            className="preview__qr"
            src={svgDataUri(svg)}
            alt={t("preview.qrAlt")}
          />
        )}
      </div>
    </fieldset>
  );
}
