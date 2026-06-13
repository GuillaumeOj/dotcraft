import { useCallback, useEffect, useRef, useState } from "react";
import { getPrefs, setPrefs } from "../qr/storage";

/** The foldable editor panels (mobile only). Stable ids, used as the persistence
 *  keys in {@link getPrefs}().collapsedPanelIds. */
export type PanelId = "content" | "style" | "logo" | "export";

/** Track which editor panels the user has folded shut, persisting the set to the
 *  preferences record so it survives reloads. Mirrors the collapsed-folder
 *  pattern in {@link useLibrary}: hydrate from prefs, then write back on change
 *  (skipping the initial mount so we never rewrite the value we just read). */
export function useCollapsedPanels() {
  const [collapsed, setCollapsed] = useState<Set<PanelId>>(
    () => new Set(getPrefs().collapsedPanelIds as PanelId[]),
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPrefs({ ...getPrefs(), collapsedPanelIds: [...collapsed] });
  }, [collapsed]);

  const toggle = useCallback((id: PanelId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
