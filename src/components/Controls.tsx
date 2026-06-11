import type { ChangeEvent } from "react";
import {
  COLOR_FORMAT_LABELS,
  COLOR_FORMATS,
  type ColorFormat,
} from "../qr/color";
import {
  DOT_STYLES,
  ERROR_LEVELS,
  EYE_STYLES,
  isTransparent,
  type QrOptions,
} from "../qr/types";
import {
  ColorField,
  Field,
  RangeField,
  SelectField,
  TextField,
} from "./fields";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Controls({
  options,
  colorFormat,
  onColorFormatChange,
  onChange,
  onRandomize,
  onReset,
}: {
  options: QrOptions;
  colorFormat: ColorFormat;
  onColorFormatChange: (format: ColorFormat) => void;
  onChange: (patch: Partial<QrOptions>) => void;
  onRandomize: () => void;
  onReset: () => void;
}) {
  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ logo: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <section className="controls">
      <fieldset className="panel">
        <legend>Content</legend>
        <TextField
          label="Text or URL"
          value={options.data}
          placeholder="https://example.com"
          onChange={(data) => onChange({ data })}
        />
        <SelectField
          label="Error correction"
          value={options.logo ? "H" : options.errorCorrection}
          options={ERROR_LEVELS}
          onChange={(errorCorrection) => onChange({ errorCorrection })}
          disabled={!!options.logo}
        />
        {options.logo && (
          <p className="hint">
            A logo is set — error correction is forced to H.
          </p>
        )}
      </fieldset>

      <fieldset className="panel">
        <legend>Style</legend>
        <SelectField
          label="Dot style"
          value={options.dotStyle}
          options={DOT_STYLES}
          onChange={(dotStyle) => onChange({ dotStyle })}
        />
        <SelectField
          label="Eye style"
          value={options.eyeStyle}
          options={EYE_STYLES}
          onChange={(eyeStyle) => onChange({ eyeStyle })}
        />
        <SelectField
          label="Colour format"
          value={colorFormat}
          options={COLOR_FORMATS}
          onChange={onColorFormatChange}
          getLabel={(f) => COLOR_FORMAT_LABELS[f]}
        />
        <ColorField
          label="Foreground"
          value={options.fillColor}
          format={colorFormat}
          onChange={(fillColor) => onChange({ fillColor })}
        />
        <ColorField
          label="Background"
          value={options.bgColor}
          format={colorFormat}
          onChange={(bgColor) => onChange({ bgColor })}
        />
        <RangeField
          label="Quiet-zone margin"
          value={options.margin}
          min={0}
          max={8}
          step={1}
          onChange={(margin) => onChange({ margin })}
        />
      </fieldset>

      <fieldset className="panel">
        <legend>Logo</legend>
        <Field label="Image (PNG / JPG / SVG)">
          {(id) => (
            <input
              id={id}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={onLogoFile}
            />
          )}
        </Field>
        {options.logo && (
          <>
            <div className="logo-row">
              <img
                className="logo-thumb"
                src={options.logo}
                alt="logo preview"
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onChange({ logo: null })}
              >
                Remove logo
              </button>
            </div>
            <RangeField
              label="Size"
              value={options.logoRatio}
              min={0.1}
              max={0.4}
              step={0.01}
              format={pct}
              onChange={(logoRatio) => onChange({ logoRatio })}
            />
            <RangeField
              label="Padding"
              value={options.logoPadding}
              min={0}
              max={0.4}
              step={0.01}
              format={pct}
              onChange={(logoPadding) => onChange({ logoPadding })}
            />
            <RangeField
              label="Corner radius"
              value={options.logoRadius}
              min={0}
              max={0.5}
              step={0.01}
              format={pct}
              onChange={(logoRadius) => onChange({ logoRadius })}
            />
            <ColorField
              label="Logo background"
              value={isTransparent(options.logoBg) ? "#ffffff" : options.logoBg}
              format={colorFormat}
              onChange={(logoBg) => onChange({ logoBg })}
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={isTransparent(options.logoBg)}
                onChange={(e) =>
                  onChange({ logoBg: e.target.checked ? "none" : "#ffffff" })
                }
              />
              Transparent logo background
            </label>
          </>
        )}
      </fieldset>

      <div className="controls__actions">
        <button type="button" className="btn" onClick={onRandomize}>
          🎲 Randomize
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
