import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ColorFormat,
  cssColorToHex,
  cssColorToRgb,
  hslToRgb,
  isNamedColor,
  rgbToHex,
  rgbToHsl,
} from "../qr/color";

/**
 * Labelled form row. Generates an id and hands it to the control via a render
 * prop, so the `<label htmlFor>` is genuinely associated with its input
 * (clickable, screen-reader friendly).
 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  getLabel,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  disabled?: boolean;
  getLabel?: (v: T) => string;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {getLabel ? getLabel(o) : o[0].toUpperCase() + o.slice(1)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

// --- Colour input -----------------------------------------------------------
//
// The canonical value passed in/out is always a CSS colour string. The chosen
// `format` only decides which inputs are shown; each variant decodes the stored
// value into its own editable shape and re-encodes on edit.

/** A stored colour string, decoded into a format's editable shape, with a
 *  committer that re-encodes and emits — but only when the result is valid.
 *
 *  External changes (swatch, randomise, reset, format switch) re-seed the draft;
 *  our own emits don't, so partially-typed values and lossy formats (HSL) don't
 *  get clobbered or drift mid-edit. */
function useColorDraft<S>(
  value: string,
  decode: (v: string) => S,
  onChange: (css: string) => void,
): [S, (next: S, css: string | null) => void] {
  const [draft, setDraft] = useState<S>(() => decode(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) setDraft(decode(value));
  }, [value, decode]);

  const commit = (next: S, css: string | null) => {
    setDraft(next);
    if (css !== null) {
      emitted.current = css;
      onChange(css);
    }
  };
  return [draft, commit];
}

const decodeHex = (v: string): string => cssColorToHex(v)?.slice(1) ?? "";
const decodeRgb = (v: string): [string, string, string] => {
  const c = cssColorToRgb(v);
  return c ? [String(c.r), String(c.g), String(c.b)] : ["", "", ""];
};
const decodeHsl = (v: string): [string, string, string] => {
  const c = cssColorToRgb(v);
  if (!c) return ["", "", ""];
  const { h, s, l } = rgbToHsl(c);
  return [String(h), String(s), String(l)];
};
const decodeNamed = (v: string): string => (isNamedColor(v) ? v.trim() : "");

const HEX_RE = /^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Parse three channel strings; null unless all are filled, numeric and in
 *  range [0, max]. */
function parseChannels(
  parts: [string, string, string],
  maxes: [number, number, number],
): [number, number, number] | null {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const raw = parts[i].trim();
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0 || n > maxes[i]) return null;
    out.push(Math.round(n));
  }
  return out as [number, number, number];
}

function ChannelInput({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= max;
  return (
    <span className="channel">
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={!valid}
        className="channel__input"
      />
      <span className="channel__label">{label}</span>
    </span>
  );
}

function HexInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, commit] = useColorDraft(value, decodeHex, onChange);
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 8);
    commit(cleaned, HEX_RE.test(cleaned) ? `#${cleaned}` : null);
  };
  return (
    <span className="color__hexwrap">
      <span className="color__prefix" aria-hidden="true">
        #
      </span>
      <input
        id={id}
        type="text"
        className="color__hex"
        value={draft}
        onChange={onInput}
        spellCheck={false}
        maxLength={8}
        aria-invalid={!HEX_RE.test(draft)}
        aria-label={t("fields.hexValue")}
        placeholder={t("fields.hexPlaceholder")}
      />
    </span>
  );
}

/** A multi-channel numeric format (RGB, HSL): how to split the stored colour
 *  into editable channels and recombine them back into a CSS colour. */
interface ChannelSpec {
  decode: (v: string) => [string, string, string];
  encode: (nums: [number, number, number]) => string;
  channels: readonly { label: string; max: number }[];
}

const RGB_SPEC: ChannelSpec = {
  decode: decodeRgb,
  encode: ([r, g, b]) => rgbToHex({ r, g, b }),
  channels: [
    { label: "R", max: 255 },
    { label: "G", max: 255 },
    { label: "B", max: 255 },
  ],
};

const HSL_SPEC: ChannelSpec = {
  decode: decodeHsl,
  encode: ([h, s, l]) => rgbToHex(hslToRgb({ h, s, l })),
  channels: [
    { label: "H", max: 360 },
    { label: "S%", max: 100 },
    { label: "L%", max: 100 },
  ],
};

function ChannelsInput({
  id,
  value,
  spec,
  onChange,
}: {
  id: string;
  value: string;
  spec: ChannelSpec;
  onChange: (v: string) => void;
}) {
  const [draft, commit] = useColorDraft(value, spec.decode, onChange);
  const maxes = spec.channels.map((c) => c.max) as [number, number, number];
  const set = (i: number) => (raw: string) => {
    const next: [string, string, string] = [...draft];
    next[i] = raw;
    const nums = parseChannels(next, maxes);
    commit(next, nums ? spec.encode(nums) : null);
  };
  return (
    <span className="color__channels">
      {spec.channels.map((ch, i) => (
        <ChannelInput
          key={ch.label}
          id={i === 0 ? id : undefined}
          label={ch.label}
          max={ch.max}
          value={draft[i]}
          onChange={set(i)}
        />
      ))}
    </span>
  );
}

function NamedInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, commit] = useColorDraft(value, decodeNamed, onChange);
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    commit(raw, isNamedColor(raw) ? raw.trim().toLowerCase() : null);
  };
  const valid = draft.trim() === "" || isNamedColor(draft);
  return (
    <input
      id={id}
      type="text"
      className="color__hex"
      value={draft}
      onChange={onInput}
      spellCheck={false}
      aria-invalid={!valid}
      aria-label={t("fields.namedColour")}
      placeholder={t("fields.namedPlaceholder")}
    />
  );
}

export function ColorField({
  label,
  value,
  format,
  onChange,
}: {
  label: string;
  value: string;
  format: ColorFormat;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const swatch = cssColorToHex(value) ?? "#000000";
  return (
    <Field label={label}>
      {(id) => (
        <span className="color">
          <input
            type="color"
            value={swatch}
            onChange={(e) => onChange(e.target.value)}
            aria-label={t("fields.swatch", { label })}
          />
          {format === "hex" && (
            <HexInput id={id} value={value} onChange={onChange} />
          )}
          {format === "rgb" && (
            <ChannelsInput
              id={id}
              value={value}
              spec={RGB_SPEC}
              onChange={onChange}
            />
          )}
          {format === "hsl" && (
            <ChannelsInput
              id={id}
              value={value}
              spec={HSL_SPEC}
              onChange={onChange}
            />
          )}
          {format === "named" && (
            <NamedInput id={id} value={value} onChange={onChange} />
          )}
        </span>
      )}
    </Field>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label}  ·  ${format ? format(value) : value}`}>
      {(id) => (
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </Field>
  );
}
