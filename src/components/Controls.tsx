import { Dices } from "lucide-react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { COLOR_FORMATS, type ColorFormat } from "../qr/color";
import { CONTENT_TYPES, type QrContent } from "../qr/content";
import {
  DOT_STYLES,
  EC_SETTINGS,
  EYE_STYLES,
  isTransparent,
  type QrOptions,
} from "../qr/types";
import { ContentFields } from "./ContentFields";
import { ColorField, Field, RangeField, SelectField } from "./fields";
import { dotSwatch, eyeSwatch, StylePicker } from "./StylePicker";
import { Tabs } from "./Tabs";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The content panel: a content-type tab strip and the structured form for the
 *  active type. */
export function ContentPanel({
  options,
  onChange,
}: {
  options: QrOptions;
  onChange: (patch: Partial<QrOptions>) => void;
}) {
  const { t } = useTranslation();
  const contentTabs = CONTENT_TYPES.map((id) => ({
    id,
    label: t(`controls.contentTypes.${id}`),
  }));

  return (
    <fieldset className="panel">
      <legend>{t("controls.content")}</legend>
      <Tabs
        value={options.contentType}
        tabs={contentTabs}
        onChange={(contentType) => onChange({ contentType })}
      />
      <ContentFields
        content={options.contents[options.contentType]}
        onChange={(content: QrContent) =>
          onChange({
            contents: { ...options.contents, [content.type]: content },
          })
        }
      />
    </fieldset>
  );
}

/** The settings panel: colour-input format and error correction. */
export function SettingsPanel({
  options,
  colorFormat,
  onColorFormatChange,
  onChange,
}: {
  options: QrOptions;
  colorFormat: ColorFormat;
  onColorFormatChange: (format: ColorFormat) => void;
  onChange: (patch: Partial<QrOptions>) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="panel">
      <legend>{t("controls.settings")}</legend>
      <SelectField
        label={t("controls.colourFormat")}
        value={colorFormat}
        options={COLOR_FORMATS}
        onChange={onColorFormatChange}
        getLabel={(f) => t(`color.${f}`)}
      />
      <SelectField
        label={t("controls.errorCorrection")}
        value={options.errorCorrection}
        options={EC_SETTINGS}
        getLabel={(s) => t(`controls.ecLabels.${s}`)}
        onChange={(errorCorrection) => onChange({ errorCorrection })}
        disabled={!!options.logo}
      />
      <p className="hint">
        {options.logo
          ? t("controls.logoForcesHigh")
          : t(`controls.ecDescriptions.${options.errorCorrection}`)}
      </p>
    </fieldset>
  );
}

/** The style panel: dot/eye swatch pickers, colours and the quiet-zone margin. */
export function StylePanel({
  options,
  colorFormat,
  onChange,
}: {
  options: QrOptions;
  colorFormat: ColorFormat;
  onChange: (patch: Partial<QrOptions>) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="panel">
      <legend>{t("controls.style")}</legend>
      <StylePicker
        label={t("controls.dotStyle")}
        value={options.dotStyle}
        options={DOT_STYLES}
        renderSwatch={dotSwatch}
        onChange={(dotStyle) => onChange({ dotStyle })}
        getLabel={(s) => t(`controls.dotStyles.${s}`)}
      />
      <StylePicker
        label={t("controls.eyeStyle")}
        value={options.eyeStyle}
        options={EYE_STYLES}
        renderSwatch={eyeSwatch}
        onChange={(eyeStyle) => onChange({ eyeStyle })}
        getLabel={(s) => t(`controls.eyeStyles.${s}`)}
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
  );
}

/** The logo panel: upload, preview and the badge sizing/colour controls. */
export function LogoPanel({
  options,
  colorFormat,
  onChange,
}: {
  options: QrOptions;
  colorFormat: ColorFormat;
  onChange: (patch: Partial<QrOptions>) => void;
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
  );
}

/** Randomize / reset actions for the editor. */
export function EditorActions({
  onRandomize,
  onReset,
}: {
  onRandomize: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="controls__actions">
      <button type="button" className="btn btn--icon" onClick={onRandomize}>
        <Dices size={16} aria-hidden="true" />
        {t("controls.randomize")}
      </button>
      <button type="button" className="btn btn--ghost" onClick={onReset}>
        {t("controls.reset")}
      </button>
    </div>
  );
}
