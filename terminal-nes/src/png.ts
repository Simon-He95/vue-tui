/**
 * Terminal NES emulator — PNG encoder (RGBA → PNG, pure Node zlib).
 *
 * Self-contained copy of the encoder pattern used by the contra example so
 * the NES pipeline does not depend on unrelated example code.
 */
import { deflateSync } from "node:zlib";

const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

let crcTab: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (crcTab) return crcTab;
  const t = new Uint32Array(256);
  for (let v = 0; v < 256; v++) {
    let c = v;
    for (let b = 0; b < 8; b++) c = c & 1 ? 3988292384 ^ (c >>> 1) : c >>> 1;
    t[v] = c >>> 0;
  }
  crcTab = t;
  return t;
}

function crc32(type: string, data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  const typeBytes = new TextEncoder().encode(type);
  for (const b of [typeBytes, data]) {
    for (const byte of b) c = t[(c ^ byte) & 255]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function w32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = (v >>> 24) & 255;
  buf[off + 1] = (v >>> 16) & 255;
  buf[off + 2] = (v >>> 8) & 255;
  buf[off + 3] = v & 255;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const c = new Uint8Array(12 + data.byteLength);
  w32(c, 0, data.byteLength);
  c.set(typeBytes, 4);
  c.set(data, 8);
  w32(c, 8 + data.byteLength, crc32(type, data));
  return c;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.byteLength, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

/** Encode an RGBA (4 bytes/pixel, straight alpha) buffer as PNG. */
export function encodeRgbaPng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  const pw = Math.floor(w);
  const ph = Math.floor(h);
  if (pw <= 0 || ph <= 0) throw new Error("PNG dimensions must be positive");
  const rowBytes = pw * 4;
  if (rgba.byteLength !== rowBytes * ph) throw new Error("RGBA byte length mismatch");
  const ihdr = new Uint8Array(13);
  w32(ihdr, 0, pw);
  w32(ihdr, 4, ph);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const scanlines = new Uint8Array((rowBytes + 1) * ph);
  for (let y = 0; y < ph; y++) {
    const t = y * (rowBytes + 1);
    scanlines[t] = 0; // filter: none
    scanlines.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), t + 1);
  }
  return concatBytes([
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines, { level: 1 }))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

/**
 * Nearest-neighbour RGBA resample. `src` must be `srcW*srcH*4` bytes; `dst`
 * must be exactly `dstW*dstH*4`. Repeatedly used to map the NES frame onto the
 * TVideo placement box.
 */
export function resizeNearest(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dst: Uint8Array,
  dstW: number,
  dstH: number,
): void {
  if (dst.byteLength !== dstW * dstH * 4) {
    throw new Error(
      `resizeNearest buffer mismatch: expected ${dstW * dstH * 4}, got ${dst.byteLength}`,
    );
  }
  if (srcW === dstW && srcH === dstH) {
    dst.set(src);
    return;
  }
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si]!;
      dst[di + 1] = src[si + 1]!;
      dst[di + 2] = src[si + 2]!;
      dst[di + 3] = src[si + 3]!;
    }
  }
}
