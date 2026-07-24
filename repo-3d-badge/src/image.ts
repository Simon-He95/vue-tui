/**
 * Image decode/resize, avatar atlas, and logo fallback for
 * @simon_he/repo-3d-badge. Uses `sharp` for decode/resize; the fallback logo
 * and atlas packing are pure CPU so they run under both Node and Bun.
 */
import type { AvatarAtlasTexture, RepoContributor, RepoLogo } from "./types.js";

/** Dark-slate placeholder color (opaque) used for missing avatars / empty tiles. */
const PLACEHOLDER_R = 30;
const PLACEHOLDER_G = 41;
const PLACEHOLDER_B = 59;

/**
 * Decode image bytes to RGBA8 (top-left origin, row-major) via sharp.
 * Forces an alpha channel so the output is always 4 bytes per pixel.
 */
export async function decodeImage(bytes: Uint8Array): Promise<{
  rgba: Uint8Array;
  width: number;
  height: number;
}> {
  const sharp = (await import("sharp")).default;
  const img = sharp(Buffer.from(bytes));
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Decode image bytes and resize to a square `size`x`size` RGBA8 buffer using a
 * cover crop centered on the image.
 */
export async function decodeResizeSquare(
  bytes: Uint8Array,
  size: number,
): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(bytes))
    .resize(size, size, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: new Uint8Array(data), width: info.width, height: info.height };
}

/** Build a single solid dark-slate `tileSize`x`tileSize` RGBA8 tile. */
function makePlaceholderTile(tileSize: number): Uint8Array {
  const tile = new Uint8Array(tileSize * tileSize * 4);
  for (let i = 0; i < tileSize * tileSize; i++) {
    const o = i * 4;
    tile[o] = PLACEHOLDER_R;
    tile[o + 1] = PLACEHOLDER_G;
    tile[o + 2] = PLACEHOLDER_B;
    tile[o + 3] = 255;
  }
  return tile;
}

/** Blit a `tileSize`x`tileSize` tile into an atlas at column `col`, row `row`. */
function blitTile(
  atlas: Uint8Array,
  atlasW: number,
  tile: Uint8Array,
  tileSize: number,
  col: number,
  row: number,
): void {
  const rowBytes = tileSize * 4;
  for (let y = 0; y < tileSize; y++) {
    const srcOff = y * rowBytes;
    const dstOff = ((row * tileSize + y) * atlasW + col * tileSize) * 4;
    atlas.set(tile.subarray(srcOff, srcOff + rowBytes), dstOff);
  }
}

/**
 * Build a packed avatar atlas (square tiles, row-major) from contributor avatars.
 *
 * - Empty input returns a single placeholder tile (columns=1) so the shader
 *   always has a valid texture.
 * - Otherwise the layout is a near-square grid: `columns = ceil(sqrt(count))`.
 * - Each avatar is fetched with a per-request timeout and cover-cropped to a
 *   `tileSize`x`tileSize` tile. A single fetch failure falls back to a
 *   placeholder tile (it does NOT abort the whole atlas). Unused trailing tiles
 *   are filled with the placeholder color.
 */
export async function buildAvatarAtlas(
  contributors: RepoContributor[],
  tileSize = 32,
  timeoutMs = 15000,
): Promise<AvatarAtlasTexture> {
  const count = contributors.length;

  // Empty input: a single placeholder tile so the shader always has a texture.
  if (count === 0) {
    return {
      rgba: makePlaceholderTile(tileSize),
      width: tileSize,
      height: tileSize,
      tileSize,
      columns: 1,
    };
  }

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const atlasW = columns * tileSize;
  const atlasH = rows * tileSize;
  const atlas = new Uint8Array(atlasW * atlasH * 4);
  const placeholder = makePlaceholderTile(tileSize);

  // Pre-fill every tile slot with the placeholder so unused/failed tiles are valid.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      blitTile(atlas, atlasW, placeholder, tileSize, c, r);
    }
  }

  await Promise.all(
    contributors.map(async (contrib, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      try {
        const res = await fetch(contrib.avatarUrl, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`avatar fetch failed (${res.status}) for ${contrib.login}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const { rgba } = await decodeResizeSquare(bytes, tileSize);
        blitTile(atlas, atlasW, rgba, tileSize, col, row);
      } catch {
        // Single fetch/decode failure: leave the placeholder tile in place.
        // Do NOT abort the whole atlas.
      }
    }),
  );

  return { rgba: atlas, width: atlasW, height: atlasH, tileSize, columns };
}

/**
 * FNV-1a 32-bit hash of a string. Used to derive a stable hue per repo.
 */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convert HSL (h in [0,360), s/l in [0,1]) to an 8-bit RGB triple. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Minimal 5x7 bitmap font for A-Z and 0-9. Each glyph is 7 rows of 5 chars,
 * '1' = pixel on. Hardcoded so the fallback needs no font assets.
 */
const FONT_5x7: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01111"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

/**
 * Test whether pixel (x, y) lies inside a rounded rectangle bounded by
 * [x0, x1] x [y0, y1] with corner radius r (pixel centers).
 */
function inRoundedRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  // Central cross / bands: fully inside.
  if ((x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r)) return true;
  // Corner region: within radius of the nearest corner center.
  const cx = x < x0 + r ? x0 + r : x1 - r;
  const cy = y < y0 + r ? y0 + r : y1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Generate a deterministic monogram logo with no network.
 *
 * Draws the first letter of `repo` (uppercased) centered on a rounded-square
 * background whose hue is derived from a hash of `owner/repo` (full saturation,
 * ~55% lightness) with a white glyph. Uses a built-in 5x7 bitmap font for A-Z
 * and 0-9; if the first character is not in the font set, a filled white circle
 * is drawn instead. Returns a `size`x`size` RGBA8 bitmap with source
 * "generated".
 */
export function generateLogoFallback(meta: { owner: string; repo: string }, size = 128): RepoLogo {
  const rgba = new Uint8Array(size * size * 4);

  // Background hue from a stable hash of owner/repo.
  const hue = hashString(`${meta.owner}/${meta.repo}`) % 360;
  const [br, bg, bb] = hslToRgb(hue, 1, 0.55);

  // Rounded-square background bounds.
  const inset = Math.max(1, Math.round(size * 0.08));
  const radius = Math.max(1, Math.round(size * 0.18));
  const x0 = inset;
  const y0 = inset;
  const x1 = size - 1 - inset;
  const y1 = size - 1 - inset;

  // First letter of repo (uppercased); digits pass through unchanged.
  const first = meta.repo.length > 0 ? meta.repo.charAt(0).toUpperCase() : "";
  const glyph = FONT_5x7[first];

  // Glyph layout: scale 5x7 to ~70% of the image, centered.
  const cellSize = glyph ? Math.max(1, Math.floor((size * 0.7) / 7)) : 0;
  const glyphW = 5 * cellSize;
  const glyphH = 7 * cellSize;
  const gx0 = Math.floor((size - glyphW) / 2);
  const gy0 = Math.floor((size - glyphH) / 2);

  const setPx = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const o = (y * size + x) * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = 255;
  };

  // Fill the rounded-square background (corners outside the radius stay transparent).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundedRect(x, y, x0, y0, x1, y1, radius)) setPx(x, y, br, bg, bb);
    }
  }

  if (glyph) {
    // Draw the letter glyph in white.
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy]!.charAt(gx) === "1") {
          for (let py = 0; py < cellSize; py++) {
            for (let px = 0; px < cellSize; px++) {
              setPx(gx0 + gx * cellSize + px, gy0 + gy * cellSize + py, 255, 255, 255);
            }
          }
        }
      }
    }
  } else {
    // Unknown first character: draw a filled white circle as the monogram.
    const cx = (size - 1) / 2;
    const cy = (size - 1) / 2;
    const cr = size * 0.28;
    const cr2 = cr * cr;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= cr2) setPx(x, y, 255, 255, 255);
      }
    }
  }

  return { rgba, width: size, height: size, source: "generated" };
}
