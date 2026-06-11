import "@testing-library/jest-dom/vitest";
// Provides a real (in-memory) IndexedDB implementation on the global scope.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { installCanvasColorShim } from "./canvasColorShim";

// jsdom ships no canvas 2D context. color.ts leans on the browser's CSS colour
// parser (reached via `ctx.fillStyle`), so we install a faithful shim that
// normalises any recognised CSS colour exactly the way Chrome's canvas does
// (opaque -> "#rrggbb", translucent -> "rgba(r, g, b, a)") and silently ignores
// anything unrecognised — which is precisely the behaviour color.ts relies on.
installCanvasColorShim();

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Undo any vi.spyOn / vi.stubGlobal a test installed, so files don't need to
  // repeat this teardown and can't leak stubs into one another.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
