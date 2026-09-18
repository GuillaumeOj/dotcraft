import { useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadPng, downloadSvg } from "../qr/export";
import { InfoLink } from "./InfoLink";
import { type FoldProps, Panel } from "./Panel";

const PNG_SIZES = [512, 1024, 2048];

/** Export settings and download buttons for the current QR code. */
export function ExportPanel({
  svg,
  px,
  ...fold
}: { svg: string; px: number } & Partial<FoldProps>) {
  const [pngSize, setPngSize] = useState(1024);
  const { t } = useTranslation();

  return (
    <Panel
      title={t("export.title")}
      info={<InfoLink anchor="export-qr" label={t("info.exportQr")} />}
      {...fold}
    >
      <label className="field field--inline">
        <span className="field__label">{t("preview.pngSize")}</span>
        <select
          value={pngSize}
          onChange={(e) => setPngSize(Number(e.target.value))}
        >
          {PNG_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </label>
      <div className="preview__buttons">
        <button
          type="button"
          className="btn"
          disabled={!svg}
          onClick={() => downloadPng(svg, pngSize)}
        >
          {t("preview.downloadPng")}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!svg}
          onClick={() => downloadSvg(svg)}
        >
          {t("preview.downloadSvg")}
        </button>
      </div>
      {px > 0 && <p className="hint">{t("preview.vectorSize", { px })}</p>}
    </Panel>
  );
}
