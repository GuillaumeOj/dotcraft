import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getPrefs } from "../qr/storage";
import { useCollapsedPanels } from "./useCollapsedPanels";

describe("useCollapsedPanels", () => {
  it("starts with every panel open", () => {
    const { result } = renderHook(() => useCollapsedPanels());
    expect(result.current.collapsed.size).toBe(0);
  });

  it("toggles a panel and persists the set to prefs", () => {
    const { result } = renderHook(() => useCollapsedPanels());

    act(() => result.current.toggle("style"));
    expect(result.current.collapsed.has("style")).toBe(true);
    expect(getPrefs().collapsedPanelIds).toEqual(["style"]);

    act(() => result.current.toggle("style"));
    expect(result.current.collapsed.has("style")).toBe(false);
    expect(getPrefs().collapsedPanelIds).toEqual([]);
  });

  it("hydrates the collapsed set from stored prefs on mount", () => {
    // Persist a folded panel via a first hook instance...
    const first = renderHook(() => useCollapsedPanels());
    act(() => first.result.current.toggle("logo"));
    first.unmount();

    // ...then a fresh mount reads it back.
    const { result } = renderHook(() => useCollapsedPanels());
    expect(result.current.collapsed.has("logo")).toBe(true);
  });
});
