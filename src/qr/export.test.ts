import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { downloadPng, downloadSvg, svgDataUri } from "./export";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("svgDataUri", () => {
  it("builds a URL-encoded svg data URI", () => {
    const uri = svgDataUri(SVG);
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).toContain(encodeURIComponent("<svg"));
    // Round-trips back to the original markup.
    const body = uri.slice("data:image/svg+xml;charset=utf-8,".length);
    expect(decodeURIComponent(body)).toBe(SVG);
  });
});

describe("download helpers", () => {
  let clickSpy: Mock;
  let createUrl: Mock;
  let revokeUrl: Mock;

  beforeEach(() => {
    clickSpy = vi.fn();
    createUrl = vi.fn(() => "blob:fake-url");
    revokeUrl = vi.fn();
    // jsdom doesn't navigate, so intercept the synthetic click.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      clickSpy as () => void,
    );
    URL.createObjectURL = createUrl as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeUrl as unknown as typeof URL.revokeObjectURL;
  });

  it("downloadSvg triggers a click with the right filename and cleans up", () => {
    downloadSvg(SVG, "my-qr.svg");
    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(blob.type).toContain("image/svg+xml");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:fake-url");
    // The anchor is removed again after clicking.
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("downloadSvg defaults the filename to qrcode.svg", () => {
    // Capture the anchor's download attribute at click time.
    let name = "";
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    downloadSvg(SVG);
    expect(name).toBe("qrcode.svg");
  });

  describe("downloadPng", () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      #src = "";
      set src(value: string) {
        this.#src = value;
        // Resolve asynchronously, like a real image decode.
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this.#src;
      }
    }

    beforeEach(() => {
      vi.stubGlobal("Image", FakeImage);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (cb: BlobCallback) => cb(new Blob(["png"], { type: "image/png" })),
      );
    });

    it("rasterises the svg and downloads a PNG of the requested size", async () => {
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage,
      } as unknown as CanvasRenderingContext2D);

      await downloadPng(SVG, 256, "out.png");

      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 256, 256);
      const blob = createUrl.mock.calls[0][0] as Blob;
      expect(blob.type).toBe("image/png");
      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it("rejects when the image fails to load", async () => {
      vi.stubGlobal(
        "Image",
        class {
          onload: (() => void) | null = null;
          onerror: (() => void) | null = null;
          set src(_v: string) {
            queueMicrotask(() => this.onerror?.());
          }
        },
      );
      await expect(downloadPng(SVG)).rejects.toThrow(/Failed to render/i);
    });

    it("throws when the canvas 2D context is unavailable", async () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      await expect(downloadPng(SVG)).rejects.toThrow(/Canvas not supported/i);
    });

    it("throws when PNG encoding yields no blob", async () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
        (cb: BlobCallback) => cb(null),
      );
      await expect(downloadPng(SVG)).rejects.toThrow(/Failed to encode PNG/i);
    });
  });
});
