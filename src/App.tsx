import { useEffect, useMemo, useRef, useState } from "react";
import { Controls } from "./components/Controls";
import { Preview } from "./components/Preview";
import type { ColorFormat } from "./qr/color";
import { randomStyle } from "./qr/random";
import { buildSvg } from "./qr/render";
import {
  clearLogo,
  clearState,
  loadLogo,
  loadState,
  saveLogo,
  saveState,
} from "./qr/storage";
import { DEFAULT_OPTIONS, type QrOptions } from "./qr/types";

export function App() {
  // Restore saved work once on mount, falling back to a random style for new visitors.
  const [persisted] = useState(loadState);
  const [options, setOptions] = useState<QrOptions>(() =>
    persisted ? persisted.options : { ...DEFAULT_OPTIONS, ...randomStyle() },
  );

  // How colours are entered, app-wide. Purely an editing preference — it doesn't
  // affect the rendered QR — so it lives outside QrOptions.
  const [colorFormat, setColorFormat] = useState<ColorFormat>(
    persisted?.colorFormat ?? "hex",
  );

  // Gate the save effects until the async logo load has finished, so they don't
  // clobber the stored logo with the pre-hydration `logo: null`.
  const [ready, setReady] = useState(false);
  // The logo currently persisted in IndexedDB, so the save effect can skip
  // rewriting an unchanged value (e.g. the one just hydrated on load).
  const lastSavedLogo = useRef<string | null>(null);

  const result = useMemo(() => {
    try {
      return { ...buildSvg(options), error: null as string | null };
    } catch (err) {
      return {
        svg: "",
        px: 0,
        error: err instanceof Error ? err.message : "Could not render QR code.",
      };
    }
  }, [options]);

  const patch = (next: Partial<QrOptions>) =>
    setOptions((prev) => ({ ...prev, ...next }));

  // Hydrate the logo from IndexedDB on mount, then open the save gate.
  useEffect(() => {
    let cancelled = false;
    loadLogo().then((logo) => {
      if (cancelled) return;
      lastSavedLogo.current = logo;
      if (logo) setOptions((prev) => ({ ...prev, logo }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist settings (debounced so typing doesn't thrash localStorage).
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => saveState(options, colorFormat), 300);
    return () => clearTimeout(id);
  }, [ready, options, colorFormat]);

  // Persist the logo Blob separately whenever it changes.
  const logo = options.logo;
  useEffect(() => {
    if (!ready || logo === lastSavedLogo.current) return;
    lastSavedLogo.current = logo;
    if (logo) void saveLogo(logo);
    else void clearLogo();
  }, [ready, logo]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>QR Studio</h1>
        <p>Design a styled QR code, then export it as PNG or SVG.</p>
      </header>

      <main className="app__main">
        <Controls
          options={options}
          colorFormat={colorFormat}
          onColorFormatChange={setColorFormat}
          onChange={patch}
          onRandomize={() => patch(randomStyle())}
          onReset={() => {
            clearState();
            setOptions(DEFAULT_OPTIONS);
          }}
        />
        <Preview svg={result.svg} px={result.px} error={result.error} />
      </main>
    </div>
  );
}
