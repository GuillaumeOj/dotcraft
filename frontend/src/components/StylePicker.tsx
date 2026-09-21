import { useId } from "react";
import { svgDataUri } from "../qr/export";
import { dotShape, EYE_MODULES, MS, renderEye } from "../qr/shapes";
import type { DotStyle, EyeStyle } from "../qr/types";

// Swatches are loaded via <img> (so no inline markup is injected), which means
// they can't inherit `currentColor` — the colour is baked in per state instead.
const ART_ON = "#ffffff";
const ART_OFF = "#9aa3b2";

const wrap = (size: number, color: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
  `<g fill="${color}">${body}</g></svg>`;

/** A filled 3×3 block of the dot style — the same primitive `buildSvg` draws. */
export function dotSwatch(style: DotStyle, color: string): string {
  let body = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) body += dotShape(style, c * MS, r * MS);
  }
  return wrap(3 * MS, color, body);
}

/** A single finder-pattern eye of the given style. */
export function eyeSwatch(style: EyeStyle, color: string): string {
  return wrap(EYE_MODULES * MS, color, renderEye(0, 0, "br", style, 0));
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** A radio-group of visual swatches. Each option renders a live preview drawn
 *  from the real QR primitives, so what you pick is what the code will show. */
export function StylePicker<T extends string>({
  label,
  value,
  options,
  renderSwatch,
  getLabel,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  /** Build the swatch SVG for an option, in the given colour. */
  renderSwatch: (style: T, color: string) => string;
  /** Human-readable label for an option; defaults to a capitalised key. */
  getLabel?: (value: T) => string;
  onChange: (value: T) => void;
}) {
  // A unique radio-group name so each picker's options are mutually exclusive.
  const name = useId();
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="swatch-grid" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <label
              key={opt}
              className={active ? "swatch swatch--active" : "swatch"}
            >
              <input
                type="radio"
                className="swatch__radio"
                name={name}
                checked={active}
                onChange={() => onChange(opt)}
              />
              <img
                className="swatch__art"
                src={svgDataUri(renderSwatch(opt, active ? ART_ON : ART_OFF))}
                alt=""
              />
              <span className="swatch__label">
                {getLabel ? getLabel(opt) : cap(opt)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
