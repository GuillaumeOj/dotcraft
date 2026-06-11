import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogo,
  clearState,
  loadLogo,
  loadState,
  STATE_KEY,
  saveLogo,
  saveState,
} from "./storage";
import { DEFAULT_OPTIONS, type QrOptions } from "./types";

function write(value: unknown) {
  localStorage.setItem(STATE_KEY, JSON.stringify(value));
}

describe("loadState", () => {
  it("returns null for a fresh visitor", () => {
    expect(loadState()).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem(STATE_KEY, "{ not json");
    expect(loadState()).toBeNull();
  });

  it("returns null when the stored payload is the literal null", () => {
    localStorage.setItem(STATE_KEY, "null");
    expect(loadState()).toBeNull();
  });

  it("returns null on a version mismatch", () => {
    write({ version: 999, options: DEFAULT_OPTIONS, colorFormat: "hex" });
    expect(loadState()).toBeNull();
  });

  it("returns null when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadState()).toBeNull();
  });

  it("merges stored options over the defaults", () => {
    write({
      version: 1,
      options: { data: "custom", margin: 7 },
      colorFormat: "rgb",
    });
    const state = loadState();
    expect(state?.options.data).toBe("custom");
    expect(state?.options.margin).toBe(7);
    // Untouched keys fall back to defaults.
    expect(state?.options.fillColor).toBe(DEFAULT_OPTIONS.fillColor);
    expect(state?.colorFormat).toBe("rgb");
  });

  it("snaps unknown enum values back to their defaults", () => {
    write({
      version: 1,
      options: {
        dotStyle: "bogus",
        eyeStyle: "bogus",
        errorCorrection: "Z",
      },
      colorFormat: "weird",
    });
    const state = loadState();
    expect(state?.options.dotStyle).toBe(DEFAULT_OPTIONS.dotStyle);
    expect(state?.options.eyeStyle).toBe(DEFAULT_OPTIONS.eyeStyle);
    expect(state?.options.errorCorrection).toBe(
      DEFAULT_OPTIONS.errorCorrection,
    );
    expect(state?.colorFormat).toBe("hex");
  });

  it("never restores a logo from localStorage", () => {
    write({
      version: 1,
      options: { ...DEFAULT_OPTIONS, logo: "data:image/png;base64,AAAA" },
      colorFormat: "hex",
    });
    expect(loadState()?.options.logo).toBeNull();
  });
});

describe("saveState", () => {
  it("persists options and colour format with a version stamp", () => {
    const opts: QrOptions = { ...DEFAULT_OPTIONS, data: "saved" };
    saveState(opts, "hsl");
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) as string);
    expect(raw.version).toBe(1);
    expect(raw.options.data).toBe("saved");
    expect(raw.colorFormat).toBe("hsl");
  });

  it("strips the logo before writing", () => {
    saveState(
      { ...DEFAULT_OPTIONS, logo: "data:image/png;base64,AAAA" },
      "hex",
    );
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) as string);
    expect(raw.options.logo).toBeNull();
  });

  it("swallows quota / unavailable-storage errors", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveState(DEFAULT_OPTIONS, "hex")).not.toThrow();
  });

  it("round-trips through loadState", () => {
    saveState({ ...DEFAULT_OPTIONS, data: "rt", margin: 3 }, "named");
    const state = loadState();
    expect(state?.options.data).toBe("rt");
    expect(state?.options.margin).toBe(3);
    expect(state?.colorFormat).toBe("named");
  });
});

describe("clearState", () => {
  it("removes the stored settings", () => {
    saveState(DEFAULT_OPTIONS, "hex");
    clearState();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });

  it("swallows removeItem errors", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearState()).not.toThrow();
  });
});

describe("logo IndexedDB storage", () => {
  const DATA_URL = "data:image/png;base64,aGVsbG8="; // "hello"

  beforeEach(async () => {
    await clearLogo();
    // saveLogo fetches the data URL to turn it into a Blob; keep that hermetic.
    // A Node Blob (unlike jsdom's) survives fake-indexeddb's structured clone
    // with its bytes intact, so the round-trip is genuinely exercised.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        blob: async () => new NodeBlob(["hello"], { type: "image/png" }),
      })),
    );
    // jsdom's real FileReader rejects the cloned Blob impl. Swap in a reader
    // that reproduces readAsDataURL's output via arrayBuffer(), which works
    // across Blob implementations.
    vi.stubGlobal(
      "FileReader",
      class {
        result: string | null = null;
        error: unknown = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(blob: Blob) {
          blob
            .arrayBuffer()
            .then((buf) => {
              const bytes = new Uint8Array(buf);
              let bin = "";
              for (const b of bytes) bin += String.fromCharCode(b);
              const type = blob.type || "application/octet-stream";
              this.result = `data:${type};base64,${btoa(bin)}`;
              this.onload?.();
            })
            .catch((e) => {
              this.error = e;
              this.onerror?.();
            });
        }
      },
    );
  });

  it("returns null when no logo is stored", async () => {
    expect(await loadLogo()).toBeNull();
  });

  it("stores and reads back a logo as a data URL", async () => {
    await saveLogo(DATA_URL);
    const loaded = await loadLogo();
    expect(loaded).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("clears a stored logo", async () => {
    await saveLogo(DATA_URL);
    await clearLogo();
    expect(await loadLogo()).toBeNull();
  });

  it("is a no-op when the data URL cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    await expect(saveLogo("data:bogus")).resolves.toBeUndefined();
    expect(await loadLogo()).toBeNull();
  });

  it("degrades to null when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await loadLogo()).toBeNull();
    await expect(saveLogo(DATA_URL)).resolves.toBeUndefined();
  });
});
