import { useState } from "react";
import { downloadPng, downloadSvg, svgDataUri } from "../qr/export";

const PNG_SIZES = [512, 1024, 2048];

export function Preview({
  svg,
  px,
  error,
}: {
  svg: string;
  px: number;
  error: string | null;
}) {
  const [pngSize, setPngSize] = useState(1024);

  return (
    <section className="preview">
      <div className="preview__stage">
        {error ? (
          <p className="preview__error">{error}</p>
        ) : (
          // SVG via <img> renders in image mode (no script execution), so the
          // markup can never run code even though it contains user-set colors.
          <img
            className="preview__qr"
            src={svgDataUri(svg)}
            alt="QR code preview"
          />
        )}
      </div>

      <div className="preview__actions">
        <label className="field field--inline">
          <span className="field__label">PNG size</span>
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
            Download PNG
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!svg}
            onClick={() => downloadSvg(svg)}
          >
            Download SVG
          </button>
        </div>
        {px > 0 && (
          <p className="hint">
            Vector size: {px}×{px}
          </p>
        )}
      </div>
    </section>
  );
}
