import { describe, expect, it } from "vitest";
import { type Corners, roundedRectPath } from "./paths";

describe("roundedRectPath", () => {
  it("emits arcs for every corner when given a uniform radius", () => {
    const d = roundedRectPath(0, 0, 100, 100, 10);
    // Four corners -> four elliptical-arc commands.
    expect(d.match(/A/g)).toHaveLength(4);
    expect(d.startsWith("M10 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("draws straight lines (no arcs) when the radius is zero", () => {
    const d = roundedRectPath(0, 0, 50, 50, 0);
    expect(d).not.toContain("A");
    // L commands replace the arcs at each corner.
    expect(d.match(/L/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts per-corner radii and keeps a sharp corner where r is 0", () => {
    const corners: Corners = { tl: 8, tr: 0, br: 8, bl: 0 };
    const d = roundedRectPath(0, 0, 40, 40, corners);
    // Two rounded corners -> two arcs; the 0-radius corners use a line.
    expect(d.match(/A/g)).toHaveLength(2);
  });

  it("clamps each radius to half the shorter side", () => {
    // r far larger than the box; should clamp to min(w,h)/2 = 10.
    const d = roundedRectPath(0, 0, 20, 40, 999);
    expect(d).toContain("A10 10");
    expect(d).not.toContain("999");
  });

  it("offsets the path by x and y", () => {
    const d = roundedRectPath(5, 7, 30, 30, 0);
    expect(d.startsWith("M5 7")).toBe(true);
  });
});
