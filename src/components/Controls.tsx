import { Dices } from "lucide-react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { COLOR_FORMATS, type ColorFormat } from "../qr/color";
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
  const { t } = useTranslation();

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
        <legend>{t("controls.content")}</legend>
        <TextField
          label={t("controls.textOrUrl")}
          value={options.data}
          placeholder={t("controls.urlPlaceholder")}
          onChange={(data) => onChange({ data })}
        />
        <SelectField
          label={t("controls.errorCorrection")}
          value={options.logo ? "H" : options.errorCorrection}
          options={ERROR_LEVELS}
          onChange={(errorCorrection) => onChange({ errorCorrection })}
          disabled={!!options.logo}
        />
        {options.logo && <p className="hint">{t("controls.logoForcesH")}</p>}
      </fieldset>

      <fieldset className="panel">
        <legend>{t("controls.style")}</legend>
        <SelectField
          label={t("controls.dotStyle")}
          value={options.dotStyle}
          options={DOT_STYLES}
          onChange={(dotStyle) => onChange({ dotStyle })}
          getLabel={(s) => t(`controls.dotStyles.${s}`)}
        />
        <SelectField
          label={t("controls.eyeStyle")}
          value={options.eyeStyle}
          options={EYE_STYLES}
          onChange={(eyeStyle) => onChange({ eyeStyle })}
          getLabel={(s) => t(`controls.eyeStyles.${s}`)}
        />
        <SelectField
          label={t("controls.colourFormat")}
          value={colorFormat}
          options={COLOR_FORMATS}
          onChange={onColorFormatChange}
          getLabel={(f) => t(`color.${f}`)}
        />
        <ColorField
          label={t("controls.foreground")}
          value={options.fillColor}
          format={colorFormat}
          onChange={(fillColor) => onChange({ fillColor })}
        />
        <ColorField
          label={t("controls.background")}
          value={options.bgColor}
          format={colorFormat}
          onChange={(bgColor) => onChange({ bgColor })}
        />
        <RangeField
          label={t("controls.quietZone")}
          value={options.margin}
          min={0}
          max={8}
          step={1}
          onChange={(margin) => onChange({ margin })}
        />
      </fieldset>

      <fieldset className="panel">
        <legend>{t("controls.logo")}</legend>
        <Field label={t("controls.image")}>
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
                alt={t("controls.logoPreview")}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onChange({ logo: null })}
              >
                {t("controls.removeLogo")}
              </button>
            </div>
            <RangeField
              label={t("controls.size")}
              value={options.logoRatio}
              min={0.1}
              max={0.4}
              step={0.01}
              format={pct}
              onChange={(logoRatio) => onChange({ logoRatio })}
            />
            <RangeField
              label={t("controls.padding")}
              value={options.logoPadding}
              min={0}
              max={0.4}
              step={0.01}
              format={pct}
              onChange={(logoPadding) => onChange({ logoPadding })}
            />
            <RangeField
              label={t("controls.cornerRadius")}
              value={options.logoRadius}
              min={0}
              max={0.5}
              step={0.01}
              format={pct}
              onChange={(logoRadius) => onChange({ logoRadius })}
            />
            <ColorField
              label={t("controls.logoBackground")}
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
              {t("controls.transparentLogoBg")}
            </label>
          </>
        )}
      </fieldset>

      <div className="controls__actions">
        <button type="button" className="btn btn--icon" onClick={onRandomize}>
          <Dices size={16} aria-hidden="true" />
          {t("controls.randomize")}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          {t("controls.reset")}
        </button>
      </div>
    </section>
  );
}
