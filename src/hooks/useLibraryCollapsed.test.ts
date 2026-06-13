import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getPrefs } from "../qr/storage";
import { useLibraryCollapsed } from "./useLibraryCollapsed";

describe("useLibraryCollapsed", () => {
  it("starts with the library shown", () => {
    const { result } = renderHook(() => useLibraryCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggles the library and persists the choice to prefs", () => {
    const { result } = renderHook(() => useLibraryCollapsed());

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(getPrefs().libraryCollapsed).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(getPrefs().libraryCollapsed).toBe(false);
  });

  it("hydrates the collapsed state from stored prefs on mount", () => {
    // Persist a hidden library via a first hook instance...
    const first = renderHook(() => useLibraryCollapsed());
    act(() => first.result.current.toggle());
    first.unmount();

    // ...then a fresh mount reads it back.
    const { result } = renderHook(() => useLibraryCollapsed());
    expect(result.current.collapsed).toBe(true);
  });
});
