import { describe, expect, it } from "vitest";
import { fileToDataUrl, isSupportedImage } from "./image";

describe("isSupportedImage", () => {
  it("accepts PNG, JPEG and SVG", () => {
    for (const type of ["image/png", "image/jpeg", "image/svg+xml"]) {
      expect(isSupportedImage(new File([""], "f", { type }))).toBe(true);
    }
  });

  it("rejects other types", () => {
    for (const type of ["text/plain", "image/gif", "application/pdf", ""]) {
      expect(isSupportedImage(new File([""], "f", { type }))).toBe(false);
    }
  });
});

describe("fileToDataUrl", () => {
  it("reads a file into a data URL", async () => {
    const file = new File(["logo-bytes"], "logo.png", { type: "image/png" });
    const url = await fileToDataUrl(file);
    expect(url).toMatch(/^data:image\/png/);
  });
});
