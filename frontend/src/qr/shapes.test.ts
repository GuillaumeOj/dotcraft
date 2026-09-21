import { describe, expect, it } from "vitest";
import { dotShape, EYE_MODULES, MS, pointedCorner, renderEye } from "./shapes";
import { DOT_STYLES, EYE_STYLES } from "./types";

describe("dotShape", () => {
  it.each(DOT_STYLES)("renders the %s dot as the right primitive", (style) => {
    const markup = dotShape(style, 0, 0);
    if (style === "circle" || style === "dots") {
      expect(markup).toContain("<circle");
    } else {
      expect(markup).toContain("<rect");
    }
  });

  it("rounds the rounded dot and insets the gapped dot", () => {
    expect(dotShape("rounded", 0, 0)).toContain("rx=");
    // The gapped square is inset by 12% on each side, so it never starts at 0.
    expect(dotShape("gapped", 0, 0)).not.toContain('x="0"');
  });

  it("offsets the primitive by the given coordinates", () => {
    expect(dotShape("square", MS, MS)).toContain(`x="${MS}"`);
  });
});

describe("renderEye", () => {
  it.each(
    EYE_STYLES,
  )("renders the %s eye as an evenodd ring + pupil", (style) => {
    const markup = renderEye(0, 0, "br", style, 0);
    expect(markup).toContain('fill-rule="evenodd"');
    // A ring path and a pupil path.
    expect(markup.match(/<path/g)?.length).toBe(2);
  });

  it("gives the droplet a sharp pointed corner (a line, not an arc)", () => {
    const droplet = renderEye(0, 0, "br", "droplet", 0);
    const circle = renderEye(0, 0, "br", "circle", 0);
    // The droplet zeroes its pointed corner, so it has straight `L` segments
    // where the fully-rounded circle eye only has arcs.
    expect(droplet).toContain("L");
    expect(circle).not.toMatch(/ L\d/);
  });

  it("shifts the eye by the quiet-zone margin", () => {
    const at0 = renderEye(0, 0, "br", "square", 0);
    const at2 = renderEye(0, 0, "br", "square", 2);
    expect(at0).not.toBe(at2);
    expect(at2).toContain(`M${2 * MS}`);
  });
});

describe("pointedCorner", () => {
  it("points each eye toward the QR center", () => {
    const size = 21;
    expect(pointedCorner(0, 0, size)).toBe("br"); // top-left eye
    expect(pointedCorner(0, size - EYE_MODULES, size)).toBe("bl"); // top-right
    expect(pointedCorner(size - EYE_MODULES, 0, size)).toBe("tr"); // bottom-left
  });
});
