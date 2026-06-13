import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

/** A controllable matchMedia stub whose match state can be flipped at will. */
function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "",
    onchange: null,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(
    mql as unknown as MediaQueryList,
  );
  return {
    listeners,
    set(v: boolean) {
      matches = v;
      for (const cb of listeners) cb();
    },
  };
}

describe("useMediaQuery", () => {
  it("returns the initial match state", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 1080px)"));
    expect(result.current).toBe(true);
  });

  it("re-renders when the query starts matching", () => {
    const m = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 1080px)"));
    expect(result.current).toBe(false);
    act(() => m.set(true));
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const m = mockMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 1080px)"));
    expect(m.listeners.size).toBe(1);
    unmount();
    expect(m.listeners.size).toBe(0);
  });

  it("falls back to false when matchMedia is unavailable", () => {
    const original = window.matchMedia;
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia =
      undefined;
    try {
      const { result } = renderHook(() => useMediaQuery("(max-width: 1080px)"));
      expect(result.current).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
