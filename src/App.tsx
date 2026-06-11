import { useMemo, useState } from "react";
import { Controls } from "./components/Controls";
import { Preview } from "./components/Preview";
import { randomStyle } from "./qr/random";
import { buildSvg } from "./qr/render";
import { DEFAULT_OPTIONS, QrOptions } from "./qr/types";

export function App() {
  // Start from a random style on each load.
  const [options, setOptions] = useState<QrOptions>(() => ({
    ...DEFAULT_OPTIONS,
    ...randomStyle(),
  }));

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

  return (
    <div className="app">
      <header className="app__header">
        <h1>QR Studio</h1>
        <p>Design a styled QR code, then export it as PNG or SVG.</p>
      </header>

      <main className="app__main">
        <Controls
          options={options}
          onChange={patch}
          onRandomize={() => patch(randomStyle())}
          onReset={() => setOptions(DEFAULT_OPTIONS)}
        />
        <Preview svg={result.svg} px={result.px} error={result.error} />
      </main>
    </div>
  );
}
