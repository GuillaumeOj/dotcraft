import type { ChangeEvent, ReactNode } from "react";
import { useId } from "react";

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
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o[0].toUpperCase() + o.slice(1)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const set = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);
  return (
    <Field label={label}>
      {(id) => (
        <span className="color">
          <input id={id} type="color" value={value} onChange={set} />
          <input
            type="text"
            className="color__hex"
            value={value}
            onChange={set}
            aria-label={`${label} hex value`}
          />
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
