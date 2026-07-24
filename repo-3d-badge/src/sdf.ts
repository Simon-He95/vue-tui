/**
 * Signed distance field math for @simon_he/repo-3d-badge.
 *
 * Pure and dependency-free. Implements the Felzenszwalb & Huttenlocher
 * separable 1D Euclidean distance transform (lower envelope of parabolas),
 * then packs a logo bitmap into an RGBA8 SDF texture for the WebGPU shader:
 * RGB carries the logo color, A carries a normalized signed distance field.
 */
import type { LogoSdfTexture, RepoLogo } from "./types.js";

/**
 * Large finite sentinel for "no source in range". A finite value (not
 * Number.POSITIVE_INFINITY) keeps the parabola-intersection arithmetic
 * finite — `Inf - Inf` would yield NaN. 1e20 is the conventional EDT sentinel
 * and is far larger than any squared pixel distance we encounter.
 */
const INF = 1e20;

/**
 * 1D squared Euclidean distance transform via the Felzenszwalb-Huttenlocher
 * lower-envelope-of-parabolas algorithm. O(n).
 *
 * `f[i]` is the additive height of the parabola rooted at `i` (0 for a source,
 * INF for "no source here"). Returns `d[i] = min_j ((i - j)^2 + f[j])`, i.e. the
 * squared distance from `i` to the nearest source (plus the source height).
 */
function edt1d(f: Float64Array, n: number): Float64Array {
  const d = new Float64Array(n);
  if (n <= 0) return d;
  // v[k] = index of the k-th parabola in the lower envelope.
  const v = new Int32Array(n);
  // z[k] = horizontal boundary between parabola k-1 and k.
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < n; q++) {
    // Intersection of the parabola at q with the current rightmost parabola v[k].
    let vk = v[k]!;
    let s = ((f[q]! + q * q) - (f[vk]! + vk * vk)) / (2 * q - 2 * vk);
    while (s <= z[k]!) {
      k--;
      vk = v[k]!;
      s = ((f[q]! + q * q) - (f[vk]! + vk * vk)) / (2 * q - 2 * vk);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  // Evaluate the lower envelope.
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const vk = v[k]!;
    d[q] = (q - vk) * (q - vk) + f[vk]!;
  }
  return d;
}

/**
 * Separable 2D squared Euclidean distance transform.
 *
 * `grid` holds a per-pixel class marker (zero vs non-zero). When
 * `sourcesAreZero` is true, pixels whose value is 0 are the sources
 * (distance 0); otherwise non-zero pixels are the sources. Returns the squared
 * distance from every pixel to the nearest source pixel.
 */
function edt2d(grid: Float64Array, width: number, height: number, sourcesAreZero: boolean): Float64Array {
  const n = width * height;
  const out = new Float64Array(n);
  if (n === 0) return out;

  // Pass 1: transform each column (y axis) independently.
  const tmp = new Float64Array(n);
  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const val = grid[y * width + x]!;
      const isSource = sourcesAreZero ? val === 0 : val !== 0;
      col[y] = isSource ? 0 : INF;
    }
    const d = edt1d(col, height);
    for (let y = 0; y < height; y++) tmp[y * width + x] = d[y]!;
  }

  // Pass 2: transform each row (x axis), using pass-1 squared distances as the
  // parabola heights. `min_x' ((x-x')^2 + tmp[x'])` yields the full 2D squared
  // Euclidean distance to the nearest source.
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = tmp[y * width + x]!;
    const d = edt1d(row, width);
    for (let x = 0; x < width; x++) out[y * width + x] = d[x]!;
  }
  return out;
}

/**
 * Compute a signed Euclidean distance field from a binary mask.
 *
 * `mask[y*width+x]` is non-zero for INSIDE the shape, zero for OUTSIDE.
 * Returns a Float32Array (length width*height) where each value is the
 * Euclidean distance from that pixel to the nearest pixel of the OPPOSITE
 * class: INSIDE pixels are negative, OUTSIDE pixels are positive, the
 * boundary is ~0.
 *
 * Implemented as two unsigned EDT passes (outside-as-source and
 * inside-as-source) combined with the appropriate sign.
 */
export function euclideanDistanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  if (width <= 0 || height <= 0) {
    throw new Error("euclideanDistanceTransform: width and height must be positive");
  }
  if (mask.length !== width * height) {
    throw new Error("euclideanDistanceTransform: mask length must equal width*height");
  }
  const n = width * height;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = mask[i] !== 0 ? 1 : 0;

  // Distance to the nearest OUTSIDE pixel (sources = outside = zero mask).
  const distSqToOutside = edt2d(grid, width, height, true);
  // Distance to the nearest INSIDE pixel (sources = inside = non-zero mask).
  const distSqToInside = edt2d(grid, width, height, false);

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (mask[i] !== 0) {
      // Inside: negative distance to the nearest outside pixel.
      out[i] = -Math.sqrt(distSqToOutside[i]!);
    } else {
      // Outside: positive distance to the nearest inside pixel.
      out[i] = Math.sqrt(distSqToInside[i]!);
    }
  }
  return out;
}

/** Clamp a value to [0, 255] and round to an integer byte. */
function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return Math.round(v);
}

/**
 * Bilinearly sample a scalar grid at fractional coords (fx, fy).
 * Out-of-bounds samples return `oob`. Grid is row-major [height][width].
 */
function sampleBilinear(
  grid: Float32Array | Float64Array,
  width: number,
  height: number,
  fx: number,
  fy: number,
  oob: number,
): number {
  if (fx < 0 || fy < 0 || fx > width - 1 || fy > height - 1) return oob;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1 <= width - 1 ? x0 + 1 : width - 1;
  const y1 = y0 + 1 <= height - 1 ? y0 + 1 : height - 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = grid[y0 * width + x0]!;
  const v10 = grid[y0 * width + x1]!;
  const v01 = grid[y1 * width + x0]!;
  const v11 = grid[y1 * width + x1]!;
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/**
 * Bilinearly sample an RGBA8 logo and composite it over a black background
 * (premultiplied): opaque interior keeps its color, fully-transparent pixels
 * become black, edges fade to black. Samples outside the logo return black.
 */
function sampleLogoColor(
  rgba: Uint8Array,
  width: number,
  height: number,
  fx: number,
  fy: number,
): { r: number; g: number; b: number } {
  if (fx < 0 || fy < 0 || fx > width - 1 || fy > height - 1) return { r: 0, g: 0, b: 0 };
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = x0 + 1 <= width - 1 ? x0 + 1 : width - 1;
  const y1 = y0 + 1 <= height - 1 ? y0 + 1 : height - 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const off = (x: number, y: number, c: number) => (y * width + x) * 4 + c;
  const lerp = (c0: number, c1: number, c2: number, c3: number) => {
    const u = c0 + (c1 - c0) * tx;
    const v = c2 + (c3 - c2) * tx;
    return u + (v - u) * ty;
  };
  const r = lerp(
    rgba[off(x0, y0, 0)]!,
    rgba[off(x1, y0, 0)]!,
    rgba[off(x0, y1, 0)]!,
    rgba[off(x1, y1, 0)]!,
  );
  const g = lerp(
    rgba[off(x0, y0, 1)]!,
    rgba[off(x1, y0, 1)]!,
    rgba[off(x0, y1, 1)]!,
    rgba[off(x1, y1, 1)]!,
  );
  const b = lerp(
    rgba[off(x0, y0, 2)]!,
    rgba[off(x1, y0, 2)]!,
    rgba[off(x0, y1, 2)]!,
    rgba[off(x1, y1, 2)]!,
  );
  const a = lerp(
    rgba[off(x0, y0, 3)]!,
    rgba[off(x1, y0, 3)]!,
    rgba[off(x0, y1, 3)]!,
    rgba[off(x1, y1, 3)]!,
  );
  // Composite the blended sample over black: out = srcColor * srcAlpha.
  const fa = a / 255;
  return { r: r * fa, g: g * fa, b: b * fa };
}

/**
 * Build a packed RGBA8 SDF texture for a repo logo.
 *
 * RGB carries the logo color (premultiplied over black; transparent areas are
 * black). A carries a normalized signed distance field of the logo alpha mask
 * encoded as `round((sdf*0.5+0.5)*255)`: 128 = boundary, <128 = inside,
 * >128 = outside, 0 = deep inside, 255 = far outside.
 *
 * The alpha mask is padded with a 1-px transparent border so the SDF reaches
 * edges cleanly, and the logo is fit (aspect preserved, letterboxed) into the
 * `targetSize` square.
 */
export function buildLogoSdfTexture(logo: RepoLogo, targetSize = 128): LogoSdfTexture {
  const W = logo.width;
  const H = logo.height;
  if (logo.rgba.length === 0 || W <= 0 || H <= 0) {
    throw new Error("buildLogoSdfTexture: logo bitmap is empty; caller must supply a fallback first");
  }

  // 1. Build alpha mask. When the image has real transparency (alpha < 255
  //    for a significant fraction of pixels), use the alpha channel directly.
  //    When the image is fully opaque (common for README banner logos), fall
  //    back to background-color separation: sample the border pixels to find
  //    the dominant background color, then treat pixels close to that color
  //    as transparent background.
  const mask = new Uint8Array(W * H);

  let opaqueCount = 0;
  let totalCount = W * H;
  for (let i = 0; i < totalCount; i++) {
    if (logo.rgba[i * 4 + 3]! >= 250) opaqueCount++;
  }
  const hasTransparency = opaqueCount < totalCount * 0.95;

  if (hasTransparency) {
    // Real alpha channel: mask non-zero where alpha > 128.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        mask[y * W + x] = logo.rgba[(y * W + x) * 4 + 3]! > 128 ? 1 : 0;
      }
    }
  } else {
    // Opaque image: separate background by edge-color flooding.
    // Sample the 4 border edges to determine the dominant background color.
    const borderR: number[] = [];
    const borderG: number[] = [];
    const borderB: number[] = [];
    const sampleBorder = (x: number, y: number) => {
      const idx = (y * W + x) * 4;
      borderR.push(logo.rgba[idx]!);
      borderG.push(logo.rgba[idx + 1]!);
      borderB.push(logo.rgba[idx + 2]!);
    };
    for (let x = 0; x < W; x++) { sampleBorder(x, 0); sampleBorder(x, H - 1); }
    for (let y = 0; y < H; y++) { sampleBorder(0, y); sampleBorder(W - 1, y); }

    // Use median of border colors as the background color (robust to outliers).
    const median = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)]!;
    };
    const bgR = median(borderR);
    const bgG = median(borderG);
    const bgB = median(borderB);

    // A pixel is "inside" the logo if it differs from the background by more
    // than a threshold. Use a perceptual color distance in RGB.
    const threshold = 40; // tune: 40 catches near-background shades
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const dr = logo.rgba[idx]! - bgR;
        const dg = logo.rgba[idx + 1]! - bgG;
        const db = logo.rgba[idx + 2]! - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        mask[y * W + x] = dist > threshold ? 1 : 0;
      }
    }
  }

  // 2. Pad with a 1-px transparent border so the SDF reaches edges cleanly.
  const PW = W + 2;
  const PH = H + 2;
  const padded = new Uint8Array(PW * PH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      padded[(y + 1) * PW + (x + 1)] = mask[y * W + x]!;
    }
  }

  // 3. Signed EDT over the padded mask (inside negative, outside positive).
  const sdfPadded = euclideanDistanceTransform(padded, PW, PH);

  // 4. Normalize to [-1, 1] (targetSize/2 maps to +/-1) and clamp.
  const norm = 1 / (targetSize * 0.5);
  const sdfNorm = new Float32Array(sdfPadded.length);
  for (let i = 0; i < sdfPadded.length; i++) {
    let v = sdfPadded[i]! * norm;
    if (v < -1) v = -1;
    else if (v > 1) v = 1;
    sdfNorm[i] = v;
  }

  // 5. Letterbox fit: preserve aspect ratio inside the targetSize square.
  const scale = targetSize / Math.max(W, H);
  const drawW = W * scale;
  const drawH = H * scale;
  const offX = (targetSize - drawW) / 2;
  const offY = (targetSize - drawH) / 2;

  // 6. Sample the SDF + logo color into a targetSize x targetSize RGBA8 texture.
  const rgba = new Uint8Array(targetSize * targetSize * 4);
  for (let oy = 0; oy < targetSize; oy++) {
    for (let ox = 0; ox < targetSize; ox++) {
      // Map output pixel -> logo space (fractional) -> padded space (+1 border).
      const lx = (ox - offX) / scale;
      const ly = (oy - offY) / scale;
      const px = lx + 1;
      const py = ly + 1;

      // SDF sample (out-of-bounds = far outside = +1).
      const sdf = sampleBilinear(sdfNorm, PW, PH, px, py, 1);
      const a = clampByte((sdf * 0.5 + 0.5) * 255);

      // Color sample (premultiplied over black; out-of-bounds = black).
      const { r, g, b } = sampleLogoColor(logo.rgba, W, H, lx, ly);

      const idx = (oy * targetSize + ox) * 4;
      rgba[idx] = clampByte(r);
      rgba[idx + 1] = clampByte(g);
      rgba[idx + 2] = clampByte(b);
      rgba[idx + 3] = a;
    }
  }

  return { rgba, width: targetSize, height: targetSize };
}
