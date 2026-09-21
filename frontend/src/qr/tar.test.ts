import { describe, expect, it } from "vitest";
import { packTar, type TarEntry, unpackTar } from "./tar";

const enc = new TextEncoder();

describe("tar", () => {
  it("round-trips multiple entries", () => {
    const entries: TarEntry[] = [
      { name: "manifest.json", data: enc.encode('{"format":"dotcraft"}') },
      { name: "logos/abc", data: new Uint8Array([1, 2, 3, 4, 5]) },
    ];
    const out = unpackTar(packTar(entries));
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("manifest.json");
    // Compare as plain arrays: the input bytes come from jsdom's TextEncoder, a
    // different realm than the Uint8Array unpackTar slices, so `toEqual` on the
    // typed arrays themselves would spuriously differ.
    expect(Array.from(out[0].data)).toEqual(Array.from(entries[0].data));
    expect(out[1].name).toBe("logos/abc");
    expect(Array.from(out[1].data)).toEqual(Array.from(entries[1].data));
  });

  it("pads each entry to a 512-byte boundary", () => {
    // 1 header + 1 data block + 2 zero terminator blocks.
    const packed = packTar([{ name: "x", data: new Uint8Array([9]) }]);
    expect(packed.length).toBe(512 * 4);
  });

  it("preserves an empty file", () => {
    const out = unpackTar(packTar([{ name: "empty", data: new Uint8Array() }]));
    expect(out).toHaveLength(1);
    expect(out[0].data).toEqual(new Uint8Array());
  });

  it("handles binary data that is not a multiple of 512", () => {
    const data = new Uint8Array(600).map((_, i) => i % 256);
    const out = unpackTar(packTar([{ name: "blob", data }]));
    expect(out[0].data).toEqual(data);
  });

  it("writes a valid USTAR header (magic + checksum)", () => {
    const packed = packTar([{ name: "a", data: new Uint8Array([1]) }]);
    // Magic "ustar" sits at offset 257.
    expect(String.fromCharCode(...packed.slice(257, 262))).toBe("ustar");
    // The recorded checksum equals the sum of all header bytes with the
    // checksum field counted as spaces.
    const header = packed.slice(0, 512);
    const recorded = Number.parseInt(
      String.fromCharCode(...header.slice(148, 154)).trim(),
      8,
    );
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
    expect(recorded).toBe(sum);
  });

  it("stops at the zero-block terminator and ignores trailing bytes", () => {
    const packed = packTar([{ name: "a", data: new Uint8Array([1]) }]);
    const padded = new Uint8Array(packed.length + 512);
    padded.set(packed);
    padded.fill(7, packed.length); // junk after the terminator
    expect(unpackTar(padded)).toHaveLength(1);
  });
});
