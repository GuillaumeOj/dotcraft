import { useCallback, useEffect, useRef, useState } from "react";
import { getPrefs, setPrefs } from "../qr/storage";

/** Track whether the desktop library column is hidden, persisting the choice to
 *  the preferences record so it survives reloads. Mirrors the hydrate-then-
 *  write-back-skipping-initial-mount pattern in {@link useCollapsedPanels}. Only
 *  affects the desktop layout; below the mobile breakpoint the library lives in
 *  a modal and ignores this. */
export function useLibraryCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => getPrefs().libraryCollapsed ?? false,
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPrefs({ ...getPrefs(), libraryCollapsed: collapsed });
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  return { collapsed, toggle };
}
