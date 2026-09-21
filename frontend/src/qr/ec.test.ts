import { describe, expect, it } from "vitest";
import { resolveEc } from "./ec";

describe("resolveEc", () => {
  it("forces H whenever a logo is present, ignoring the setting", () => {
    expect(resolveEc("L", 10, true)).toBe("H");
    expect(resolveEc("auto", 500, true)).toBe("H");
  });

  it("passes an explicit level through unchanged", () => {
    expect(resolveEc("L", 10, false)).toBe("L");
    expect(resolveEc("M", 10, false)).toBe("M");
    expect(resolveEc("Q", 10, false)).toBe("Q");
    expect(resolveEc("H", 10, false)).toBe("H");
  });

  it("auto steps the level down as the payload grows", () => {
    expect(resolveEc("auto", 60, false)).toBe("Q"); // boundary: still short
    expect(resolveEc("auto", 61, false)).toBe("M");
    expect(resolveEc("auto", 150, false)).toBe("M"); // boundary: still medium
    expect(resolveEc("auto", 151, false)).toBe("L");
  });
});
