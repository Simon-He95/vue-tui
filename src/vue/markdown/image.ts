import { sanitizeDomHref } from "../../core/hyperlink.js";
import { hasEncodedControl } from "../../utils/url-safety.js";

const DATA_IMAGE_RE = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;
const SAFE_IMAGE_MIME_RE = /^image\/(?:png|jpeg|jpg|gif|webp)$/i;

export type TuiMarkdownImageSource = Readonly<{
  src: string;
  mime?: string;
  base64?: string;
}>;

export type TuiMarkdownImageDimensions = Readonly<{
  width: number;
  height: number;
}>;

export function sanitizeMarkdownImageSource(src: unknown): TuiMarkdownImageSource | null {
  if (typeof src !== "string") return null;
  const raw = src.trim();
  if (!raw || raw !== src) return null;

  const data = raw.match(DATA_IMAGE_RE);
  if (data) {
    const mime = data[1]!.toLowerCase();
    const base64 = data[2]!.replace(/\s+/g, "");
    if (!SAFE_IMAGE_MIME_RE.test(mime)) return null;
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    return { src: raw, mime, base64 };
  }

  if (/^(?:blob|file):/i.test(raw)) {
    if (raw.includes("\\") || /\s/u.test(raw) || hasEncodedControl(raw)) return null;
    try {
      const url = new URL(raw);
      if (url.protocol === "blob:" || url.protocol === "file:") return { src: url.toString() };
    } catch {
      return null;
    }
  }

  const safe = sanitizeDomHref(raw, { allowRelative: true });
  return safe ? { src: safe } : null;
}

const BASE64_TABLE = (() => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table = new Map<string, number>();
  for (let i = 0; i < chars.length; i++) table.set(chars[i]!, i);
  return table;
})();

function decodeBase64Prefix(value: string, maxBytes: number): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of value.replace(/\s+/g, "")) {
    if (ch === "=") break;
    const sextet = BASE64_TABLE.get(ch);
    if (sextet == null) continue;
    buffer = (buffer << 6) | sextet;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      if (bytes.length >= maxBytes) return Uint8Array.from(bytes);
    }
  }
  return Uint8Array.from(bytes);
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000) +
    (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0))
  );
}

function validDimensions(width: number, height: number): TuiMarkdownImageDimensions | null {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

export function readMarkdownImageDimensions(
  base64: string | undefined,
): TuiMarkdownImageDimensions | null {
  if (!base64) return null;
  const bytes = decodeBase64Prefix(base64, 4096);
  if (bytes.length < 10) return null;

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52
  ) {
    return validDimensions(u32be(bytes, 16), u32be(bytes, 20));
  }

  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return validDimensions(u16le(bytes, 6), u16le(bytes, 8));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 8 < bytes.length; ) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = u16be(bytes, offset + 2);
      if (length < 2) break;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return validDimensions(u16be(bytes, offset + 7), u16be(bytes, offset + 5));
      }
      offset += 2 + length;
    }
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const format = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
    if (format === "VP8X" && bytes.length >= 30) {
      return validDimensions(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
    }
    if (format === "VP8 " && bytes.length >= 30) {
      return validDimensions(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
    }
    if (format === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b0 = bytes[21] ?? 0;
      const b1 = bytes[22] ?? 0;
      const b2 = bytes[23] ?? 0;
      const b3 = bytes[24] ?? 0;
      return validDimensions(1 + (((b1 & 0x3f) << 8) | b0), 1 + ((b3 << 6) | (b2 >> 2)));
    }
  }

  return null;
}
