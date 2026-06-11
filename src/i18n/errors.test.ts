import { describe, expect, it } from "vitest";
import { EMPTY_CONTENT_ERROR } from "../qr/render";
import i18n from "./config";
import { describeRenderError } from "./errors";

describe("describeRenderError", () => {
  it("maps the empty-content error to its own translated message", () => {
    expect(describeRenderError(EMPTY_CONTENT_ERROR, i18n.t)).toBe(
      "Enter some text or a URL to encode.",
    );
  });

  it("maps any other error to a generic translated message", () => {
    expect(describeRenderError("Canvas not supported.", i18n.t)).toBe(
      "Could not render QR code.",
    );
  });
});
