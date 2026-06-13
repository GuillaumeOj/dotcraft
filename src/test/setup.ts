import "@testing-library/jest-dom/vitest";
// Provides a real (in-memory) IndexedDB implementation on the global scope.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
// Initialise the shared i18n instance so components using `useTranslation`
// render (in English) without each test wiring up a provider.
import i18n from "../i18n/config";
import { installCanvasColorShim } from "./canvasColorShim";
import { createMatchMedia } from "./matchMedia";

// jsdom ships no canvas 2D context. color.ts leans on the browser's CSS colour
// parser (reached via `ctx.fillStyle`), so we install a faithful shim that
// normalises any recognised CSS colour exactly the way Chrome's canvas does
// (opaque -> "#rrggbb", translucent -> "rgba(r, g, b, a)") and silently ignores
// anything unrecognised — which is precisely the behaviour color.ts relies on.
installCanvasColorShim();

// jsdom ships no matchMedia. Install a default that reports "no match" (the
// desktop branch) so useMediaQuery resolves without each test wiring it up. A
// plain assignment (not vi.stubGlobal) keeps it past vi.unstubAllGlobals; tests
// that need the mobile layout override it with vi.spyOn(window, "matchMedia").
if (typeof window.matchMedia !== "function") {
  window.matchMedia = () => createMatchMedia(false);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Reset the interface language so a test that switches it can't leak the
  // change into the next one.
  if (i18n.language !== "en") void i18n.changeLanguage("en");
  // Undo any vi.spyOn / vi.stubGlobal a test installed, so files don't need to
  // repeat this teardown and can't leak stubs into one another.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
