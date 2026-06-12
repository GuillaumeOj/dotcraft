import { useEffect, useState } from "react";

/** Track whether a CSS media query currently matches, re-rendering on change.
 *
 *  Returns `false` when `matchMedia` is unavailable (e.g. a non-browser test
 *  environment), so callers safely fall back to the desktop/default branch. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Sync once in case the query changed between render and effect.
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
