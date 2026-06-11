import { describe, expect, it } from "vitest";
import { buildSvg } from "./render";
import {
  DEFAULT_OPTIONS,
  DOT_STYLES,
  EYE_STYLES,
  type QrOptions,
} from "./types";

/** Build options, with a `text` shorthand that selects the text content tab and
 *  fills it — the renderer encodes `contents[contentType]`. */
const opts = (over: Partial<QrOptions> & { text?: string } = {}): QrOptions => {
  const { text, ...rest } = over;
  const base: QrOptions = { ...DEFAULT_OPTIONS, ...rest };
  if (text !== undefined) {
    base.contentType = "text";
    base.contents = { ...base.contents, text: { type: "text", text } };
  }
  return base;
};

const attr = (svg: string, name: string): string | null =>
  svg.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;

describe("buildSvg", () => {
  it("throws when the content is empty", () => {
    expect(() => buildSvg(opts({ text: "" }))).toThrow(/text or a URL/i);
  });

  it("returns a self-contained <svg> and a positive pixel size", () => {
    const { svg, px } = buildSvg(opts({ text: "hello" }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(px).toBeGreaterThan(0);
    expect(attr(svg, "width")).toBe(String(px));
    expect(attr(svg, "viewBox")).toBe(`0 0 ${px} ${px}`);
  });

  it("encodes the active content tab", () => {
    const { svg } = buildSvg(
      opts({
        contentType: "phone",
        contents: {
          ...DEFAULT_OPTIONS.contents,
          phone: {
            type: "phone",
            phone: { country: "US", dialCode: "+1", number: "5551234" },
          },
        },
      }),
    );
    // A tel: payload is short, so "auto" keeps a high level and it still renders.
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("scales the canvas with the margin (quiet zone)", () => {
    const small = buildSvg(opts({ text: "hello", margin: 0 })).px;
    const big = buildSvg(opts({ text: "hello", margin: 4 })).px;
    // px = (n + 2*margin)*MS, so 4 extra modules of margin add 2*4*MS = 80.
    expect(big - small).toBe(2 * 4 * 10);
  });

  it("clamps a negative margin to zero and rounds a fractional one", () => {
    const zero = buildSvg(opts({ text: "hi", margin: 0 })).px;
    expect(buildSvg(opts({ text: "hi", margin: -3 })).px).toBe(zero);
    const m2 = buildSvg(opts({ text: "hi", margin: 2 })).px;
    expect(buildSvg(opts({ text: "hi", margin: 2.4 })).px).toBe(m2);
  });

  it.each(DOT_STYLES)("renders the %s dot style", (dotStyle) => {
    const { svg } = buildSvg(opts({ text: "hello world", dotStyle }));
    if (dotStyle === "circle" || dotStyle === "dots") {
      expect(svg).toContain("<circle");
    } else {
      expect(svg).toContain("<rect");
    }
    if (dotStyle === "rounded") expect(svg).toContain("rx=");
  });

  it.each(EYE_STYLES)("renders the %s eye style", (eyeStyle) => {
    const { svg } = buildSvg(opts({ text: "hello world", eyeStyle }));
    // Each eye is an evenodd ring path plus a pupil path.
    expect(svg).toContain('fill-rule="evenodd"');
  });

  it("uses the chosen fill and background colours", () => {
    const { svg } = buildSvg(
      opts({ text: "hi", fillColor: "#123456", bgColor: "#abcdef" }),
    );
    expect(svg).toContain('fill="#abcdef"'); // bg rect
    expect(svg).toContain('fill="#123456"'); // module group
  });

  it("escapes markup-bearing colour input so it cannot break out", () => {
    const { svg } = buildSvg(
      opts({ text: "hi", bgColor: '"><script>alert(1)</script>' }),
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;");
  });

  describe("logo", () => {
    const LOGO =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

    it("omits logo defs and image when there is no logo", () => {
      const { svg } = buildSvg(opts({ text: "hi", logo: null }));
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("clipPath");
    });

    it("emits a clipped <image> with a rounded badge", () => {
      const { svg } = buildSvg(opts({ text: "hi", logo: LOGO }));
      expect(svg).toContain("<clipPath");
      expect(svg).toContain("<image");
      expect(svg).toContain('clip-path="url(#logo-clip)"');
    });

    it("draws a badge background unless it is transparent", () => {
      const withBg = buildSvg(
        opts({ text: "hi", logo: LOGO, logoBg: "#ff0000" }),
      ).svg;
      // The fill colour appears for the badge in addition to the module group.
      expect(withBg.match(/fill="#ff0000"/g)?.length).toBeGreaterThanOrEqual(1);

      const transparent = buildSvg(
        opts({ text: "hi", logo: LOGO, logoBg: "none" }),
      ).svg;
      // Only the clipPath path + image, no extra filled badge path before <image>.
      const beforeImage = transparent.slice(0, transparent.indexOf("<image"));
      expect(beforeImage).not.toContain('fill="none"');
    });

    it("escapes the logo href", () => {
      const evil = "data:image/svg+xml,<svg onload='x'>&";
      const { svg } = buildSvg(opts({ text: "hi", logo: evil }));
      expect(svg).toContain("&amp;");
      expect(svg).toContain("&#39;");
      expect(svg).not.toContain("onload='x'");
    });

    it("still renders large data once the logo forces error level H", () => {
      // A payload that needs the headroom of H; logo should force it regardless
      // of the requested level, so this must not throw.
      const text = "X".repeat(400);
      expect(() =>
        buildSvg(opts({ text, logo: LOGO, errorCorrection: "L" })),
      ).not.toThrow();
    });
  });
});
