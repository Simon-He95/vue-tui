import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value++) {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(type: Uint8Array, data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const bytes of [type, data]) {
    for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.byteLength, crc32(typeBytes, data));
  return chunk;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function encodeRgbaPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const pixelWidth = Math.floor(width);
  const pixelHeight = Math.floor(height);
  if (pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error("PNG dimensions must be positive integers");
  }
  const rowBytes = pixelWidth * 4;
  if (rgba.byteLength !== rowBytes * pixelHeight) {
    throw new Error(
      `RGBA byte length mismatch: expected ${rowBytes * pixelHeight}, got ${rgba.byteLength}`,
    );
  }

  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, pixelWidth);
  writeUint32(ihdr, 4, pixelHeight);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const scanlines = new Uint8Array((rowBytes + 1) * pixelHeight);
  for (let y = 0; y < pixelHeight; y++) {
    const target = y * (rowBytes + 1);
    scanlines[target] = 0;
    scanlines.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), target + 1);
  }

  return concatBytes([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines, { level: 1 }))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}
