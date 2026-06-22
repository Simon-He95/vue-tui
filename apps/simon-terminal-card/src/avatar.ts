import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { deflateSync, inflateSync } from "node:zlib";
import { pngSignature } from "./constants.js";
import { fetchBytes } from "./network.js";
import type { AvatarAsset, AvatarCell, CardSnapshot, GitHubProfile } from "./types.js";

const execFileAsync = promisify(execFile);

function avatarUrl(profile: GitHubProfile, size: number): string {
  const separator = profile.avatar_url.includes("?") ? "&" : "?";
  return `${profile.avatar_url}${separator}s=${size}`;
}

const pngCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngCrc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = pngCrcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

function readPngRgba(png: Buffer): { width: number; height: number; rgba: Uint8Array } {
  if (!png.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error("Invalid PNG");
  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error("Unsupported PNG format");
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * channels);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++]!;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[sourceOffset++]!;
      const left = x >= channels ? row[x - channels]! : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels]! : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 0xff;
      else if (filter === 2) row[x] = (raw + up) & 0xff;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      else throw new Error("Unsupported PNG filter");
    }
    pixels.set(row, y * stride);
    previous = row;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += channels, j += 4) {
    rgba[j] = pixels[i]!;
    rgba[j + 1] = pixels[i + 1]!;
    rgba[j + 2] = pixels[i + 2]!;
    rgba[j + 3] = channels === 4 ? pixels[i + 3]! : 255;
  }
  return { width, height, rgba };
}

function writePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(scanlines, target + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function maskPngBase64ToCircle(pngBase64: string): string {
  const image = readPngRgba(Buffer.from(pngBase64, "base64"));
  const cx = image.width / 2;
  const cy = image.height / 2;
  const radius = Math.min(image.width, image.height) / 2;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - distance));
      const alphaIndex = (y * image.width + x) * 4 + 3;
      image.rgba[alphaIndex] = Math.round(image.rgba[alphaIndex]! * coverage);
    }
  }
  return writePngRgba(image.width, image.height, image.rgba).toString("base64");
}

export function fallbackAvatar(login: string, cols: number, rows: number): readonly AvatarCell[] {
  const cells: AvatarCell[] = [];
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const rx = Math.max(1, cols / 2 - 0.4);
  const ry = Math.max(1, rows / 2 - 0.2);
  const fill = "#0f172a";
  const topEdge = "#38bdf8";
  const bottomEdge = "#22c55e";

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const distance = dx * dx + dy * dy;
      if (distance > 1) continue;
      const edge = distance > 0.72;
      cells.push({
        x,
        y,
        ch: " ",
        style: { bg: edge ? (y <= cy ? topEdge : bottomEdge) : fill },
      });
    }
  }

  const initials =
    login
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "GH";
  const startX = Math.floor((cols - initials.length) / 2);
  const initialY = Math.floor(rows / 2);
  for (let i = 0; i < initials.length; i++) {
    const x = startX + i;
    const y = initialY;
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    cells.push({
      x,
      y,
      ch: initials[i]!,
      style: { fg: "#f8fafc", bg: fill, bold: true },
    });
  }
  return cells;
}

export async function buildAvatar(
  profile: GitHubProfile,
  cols: number,
  rows: number,
  cached?: Pick<CardSnapshot, "avatarPngBase64">,
): Promise<AvatarAsset> {
  const cells = fallbackAvatar(profile.login, cols, rows);
  if (!existsSync("/usr/bin/sips")) {
    return {
      cells,
      pngBase64: cached?.avatarPngBase64,
    };
  }
  const dir = await mkdtemp(join(tmpdir(), "vue-tui-github-avatar-"));
  const source = join(dir, "avatar");
  const png = join(dir, "avatar.png");
  try {
    await writeFile(source, await fetchBytes(avatarUrl(profile, cols * 8)));
    await execFileAsync(
      "/usr/bin/sips",
      ["-s", "format", "png", "-z", "160", "160", source, "--out", png],
      { timeout: 15_000 },
    );
    const pngBase64 = maskPngBase64ToCircle(readFileSync(png).toString("base64"));
    return { cells, pngBase64 };
  } catch {
    return {
      cells,
      pngBase64: cached?.avatarPngBase64,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
