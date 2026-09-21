/** A tiny, dependency-free USTAR tar reader/writer.
 *
 *  Tar concatenates 512-byte blocks: each file is a 512-byte header followed by
 *  its data, zero-padded up to the next 512-byte boundary, and the archive ends
 *  with two all-zero blocks. We use it as the inner container for `.dotcraft`
 *  library exports (then gzip the whole thing) — it bundles several named files
 *  (`manifest.json`, `library.json`, `logos/<id>`) into one byte stream.
 *
 *  This module is pure: it only moves bytes around, with no DOM, storage, or
 *  clock access, so it round-trips deterministically and is trivially testable.
 *  We support exactly the subset we emit: regular files (`typeflag` "0"), names
 *  short enough to fit the 100-byte field (our names are well under that). */

const BLOCK = 512;

/** One file inside the archive. */
export interface TarEntry {
  name: string;
  data: Uint8Array;
}

/** Write an ASCII string into `buf` at `offset`, NUL-padded to `length`. */
function writeString(
  buf: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  for (let i = 0; i < length; i++) {
    buf[offset + i] = i < value.length ? value.charCodeAt(i) : 0;
  }
}

/** Write `value` as a fixed-width octal string ending in NUL (the tar header
 *  number format), right-justified and zero-padded over `length - 1` digits. */
function writeOctal(
  buf: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const octal = value.toString(8).padStart(length - 1, "0");
  writeString(buf, offset, length, octal);
}

/** Build a 512-byte USTAR header for a regular file. */
function header(name: string, size: number): Uint8Array {
  const buf = new Uint8Array(BLOCK);
  writeString(buf, 0, 100, name); // name
  writeOctal(buf, 100, 8, 0o644); // mode
  writeOctal(buf, 108, 8, 0); // uid
  writeOctal(buf, 116, 8, 0); // gid
  writeOctal(buf, 124, 12, size); // size
  writeOctal(buf, 136, 12, 0); // mtime (fixed, so output is deterministic)
  buf[156] = 0x30; // typeflag "0" (regular file)
  writeString(buf, 257, 6, "ustar"); // magic "ustar\0"
  writeString(buf, 263, 2, "00"); // version

  // Checksum: sum every header byte with the checksum field taken as spaces,
  // then write it back as a 6-digit octal followed by NUL and a space.
  for (let i = 0; i < 8; i++) buf[148 + i] = 0x20;
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += buf[i];
  writeOctal(buf, 148, 7, sum);
  buf[155] = 0x20;
  return buf;
}

/** The smallest multiple of `BLOCK` that is `>= n`. */
function roundUp(n: number): number {
  return Math.ceil(n / BLOCK) * BLOCK;
}

/** Pack entries into a tar byte stream (terminated by two zero blocks). */
export function packTar(entries: TarEntry[]): Uint8Array {
  const total =
    entries.reduce((acc, e) => acc + BLOCK + roundUp(e.data.length), 0) +
    BLOCK * 2;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const entry of entries) {
    out.set(header(entry.name, entry.data.length), offset);
    offset += BLOCK;
    out.set(entry.data, offset);
    offset += roundUp(entry.data.length);
  }
  return out; // trailing bytes are already zero — the two terminator blocks
}

/** Read an ASCII string from `buf[offset..offset+length)`, stopping at the
 *  first NUL. */
function readString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset;
  const limit = offset + length;
  while (end < limit && buf[end] !== 0) end++;
  let s = "";
  for (let i = offset; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

/** Parse the octal `size` field, ignoring NUL/space padding. */
function readOctal(buf: Uint8Array, offset: number, length: number): number {
  const text = readString(buf, offset, length).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

/** True when the 512-byte block at `offset` is entirely zero (a terminator). */
function isZeroBlock(buf: Uint8Array, offset: number): boolean {
  for (let i = 0; i < BLOCK; i++) if (buf[offset + i] !== 0) return false;
  return true;
}

/** Unpack a tar byte stream into its entries. Stops at the first zero block. */
export function unpackTar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  while (offset + BLOCK <= bytes.length) {
    if (isZeroBlock(bytes, offset)) break;
    const name = readString(bytes, offset, 100);
    const size = readOctal(bytes, offset + 124, 12);
    const start = offset + BLOCK;
    entries.push({ name, data: bytes.slice(start, start + size) });
    offset = start + roundUp(size);
  }
  return entries;
}
