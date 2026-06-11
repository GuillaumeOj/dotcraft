/** A jsdom stand-in for the browser's canvas CSS-colour normaliser.
 *
 *  `color.ts` probes `CanvasRenderingContext2D.fillStyle`: it assigns a colour
 *  string and reads back the normalised value, relying on the spec'd behaviour
 *  that an *unrecognised* assignment is ignored (the previous value stays). This
 *  shim reproduces that precisely so those code paths run under jsdom.
 *
 *  Normalisation matches Chromium: opaque colours serialise to lowercase
 *  "#rrggbb"; colours with alpha < 1 serialise to "rgba(r, g, b, a)". */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

// A small but representative slice of the CSS named-colour table — enough for
// tests, plus the special "transparent" keyword.
const NAMED: Record<string, string> = {
  transparent: "rgba(0, 0, 0, 0)",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  lime: "#00ff00",
  green: "#008000",
  blue: "#0000ff",
  navy: "#000080",
  tomato: "#ff6347",
  rebeccapurple: "#663399",
  hotpink: "#ff69b4",
  gold: "#ffd700",
  teal: "#008080",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  orange: "#ffa500",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
};

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
const toHex2 = (n: number) =>
  clamp(Math.round(n), 255).toString(16).padStart(2, "0");

function expandHex(hex: string): Rgba | null {
  let h = hex;
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === "") return null;

  if (value in NAMED) return parseColor(NAMED[value]);
  if (value.startsWith("#")) return expandHex(value.slice(1));

  // The editor only ever stores hex, rgb()/rgba(), or named colours — it never
  // emits an hsl() string — so the shim handles just rgb()/rgba() here.
  const fn = value.match(/^rgba?\(([^)]*)\)$/);
  if (!fn) return null;
  const parts = fn[1]
    .split(/[,/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const num = (s: string) => Number(s.replace("%", ""));
  const a = parts[3] !== undefined ? clamp(num(parts[3]), 1) : 1;
  if (parts.slice(0, 4).some((p) => !Number.isFinite(num(p)))) return null;

  return {
    r: clamp(Math.round(num(parts[0])), 255),
    g: clamp(Math.round(num(parts[1])), 255),
    b: clamp(Math.round(num(parts[2])), 255),
    a,
  };
}

function serialize(c: Rgba): string {
  if (c.a >= 1) return `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`;
  // Chromium trims trailing zeros on the alpha; `Number` round-trips it.
  return `rgba(${clamp(Math.round(c.r), 255)}, ${clamp(Math.round(c.g), 255)}, ${clamp(Math.round(c.b), 255)}, ${Number(c.a.toFixed(4))})`;
}

// color.ts only ever reads/writes `fillStyle`; nothing else of the 2D context
// is exercised through the shim (export.ts tests stub their own context).
class FakeContext2D {
  private _fill = "#000000";
  get fillStyle(): string {
    return this._fill;
  }
  set fillStyle(value: unknown) {
    if (typeof value !== "string") return;
    const parsed = parseColor(value);
    // Unrecognised assignment is ignored — the previous value persists.
    if (parsed) this._fill = serialize(parsed);
  }
}

export function installCanvasColorShim(): void {
  HTMLCanvasElement.prototype.getContext = function getContext(
    type: string,
  ): unknown {
    return type === "2d" ? new FakeContext2D() : null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}
