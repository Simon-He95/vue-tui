import type { TuiMarkdownVisualRow } from "./types.js";

export type TuiMarkdownMathMode = "inline" | "display";

export type TuiMarkdownMathImageCells = Readonly<{
  base64: string;
  widthCells: number;
  heightCells: number;
}>;

export type TuiMarkdownMathImageOptions = Readonly<{
  cellWidthPx?: number;
  cellHeightPx?: number;
  scale?: number;
  color?: string;
  maxWidthCells?: number;
  /**
   * Vertical position of the text baseline inside a terminal cell, as a
   * fraction of the cell height (0 = top, 1 = bottom). Inline formula images
   * are padded so their baseline lands here. Defaults to 0.78.
   */
  baselineRatio?: number;
}>;

export type TuiMarkdownMathRasterizer = (
  tex: string,
  mode: TuiMarkdownMathMode,
  options: Required<TuiMarkdownMathImageOptions>,
) => Promise<TuiMarkdownMathImageCells | null>;

type RequiredMathImageOptions = Required<TuiMarkdownMathImageOptions>;

const DEFAULT_MATH_IMAGE_OPTIONS: RequiredMathImageOptions = Object.freeze({
  cellWidthPx: 8,
  cellHeightPx: 16,
  scale: 2,
  color: "#f8f8f2",
  maxWidthCells: 0,
  baselineRatio: 0.78,
});

const MAX_CACHE_ENTRIES = 64;
const MAX_FAILED_ENTRIES = 128;
const mathImageCache = new Map<string, TuiMarkdownMathImageCells>();
const mathImageFailed = new Set<string>();
const mathImageInflight = new Map<string, Promise<TuiMarkdownMathImageCells | null>>();
const mathImageListeners = new Set<() => void>();

let customRasterizer: TuiMarkdownMathRasterizer | null = null;
let builtinRasterizerLoad: Promise<TuiMarkdownMathRasterizer | null> | null = null;
let builtinRasterizerReady = false;

/**
 * Map common terminal foreground style values to hex so rasterized formulas
 * stay readable on any theme (a light formula on a light background would be
 * invisible). Unknown values resolve to `undefined` and the caller falls back
 * to a neutral default.
 */
const NAMED_STYLE_FG_HEX: Readonly<Record<string, string>> = Object.freeze({
  black: "#000000",
  red: "#e53935",
  green: "#43a047",
  yellow: "#fdd835",
  blue: "#1e88e5",
  magenta: "#d81b60",
  cyan: "#00acc1",
  white: "#ffffff",
  gray: "#9e9e9e",
  grey: "#9e9e9e",
  blackBright: "#4a4a4a",
  redBright: "#ff6e6e",
  greenBright: "#69db7c",
  yellowBright: "#ffe066",
  blueBright: "#74c0fc",
  magentaBright: "#f783ac",
  cyanBright: "#3bc9db",
  whiteBright: "#f8f8f2",
  grayBright: "#bdbdbd",
  greyBright: "#bdbdbd",
});

export function resolveMarkdownMathColor(fg: unknown): string | undefined {
  if (typeof fg !== "string" || !fg) return undefined;
  const trimmed = fg.trim();
  if (trimmed.startsWith("#") && /^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.toLowerCase();
  return NAMED_STYLE_FG_HEX[trimmed.toLowerCase()];
}

export function normalizeMathImageOptions(
  options?: TuiMarkdownMathImageOptions,
): RequiredMathImageOptions {
  return {
    cellWidthPx: Math.max(
      1,
      Math.floor(options?.cellWidthPx ?? DEFAULT_MATH_IMAGE_OPTIONS.cellWidthPx),
    ),
    cellHeightPx: Math.max(
      1,
      Math.floor(options?.cellHeightPx ?? DEFAULT_MATH_IMAGE_OPTIONS.cellHeightPx),
    ),
    scale: Math.max(1, Math.floor(options?.scale ?? DEFAULT_MATH_IMAGE_OPTIONS.scale)),
    color: options?.color ?? DEFAULT_MATH_IMAGE_OPTIONS.color,
    maxWidthCells: Math.max(0, Math.floor(options?.maxWidthCells ?? 0)),
    baselineRatio: clamp01(options?.baselineRatio ?? DEFAULT_MATH_IMAGE_OPTIONS.baselineRatio),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.78;
  return Math.min(1, Math.max(0, value));
}

/**
 * Install a custom TeX -> PNG rasterizer (e.g. consumers that already have a
 * katex/mathjax pipeline). Passing `null` restores the built-in lazy loader.
 */
export function setMarkdownMathRasterizer(rasterizer: TuiMarkdownMathRasterizer | null): void {
  customRasterizer = rasterizer;
}

export function subscribeMarkdownMathImage(listener: () => void): () => void {
  mathImageListeners.add(listener);
  return () => mathImageListeners.delete(listener);
}

/**
 * True when a rasterizer is confirmed available (a custom one was installed or
 * the built-in MathJax+resvg stack finished loading). Components should gate
 * image production on this so they never spend time rasterizing formulas while
 * the math engine is still loading or missing.
 */
export function isMarkdownMathImageRendererReady(): boolean {
  return customRasterizer != null || builtinRasterizerReady;
}

/**
 * Ensure the math image rasterizer is loaded (or resolved as unavailable).
 * Resolves `true` once a rasterizer is usable. Safe to call repeatedly; the
 * underlying load is shared and its outcome is cached.
 */
export async function loadMarkdownMathImageRenderer(): Promise<boolean> {
  if (isMarkdownMathImageRendererReady()) return true;
  const rasterizer = customRasterizer ?? (await loadBuiltinMathRasterizer());
  builtinRasterizerReady = rasterizer != null;
  return builtinRasterizerReady;
}

function hashMathImageKey(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function mathImageCacheKey(
  tex: string,
  mode: TuiMarkdownMathMode,
  options: RequiredMathImageOptions,
): string {
  return hashMathImageKey(
    [
      mode,
      tex,
      options.cellWidthPx,
      options.cellHeightPx,
      options.scale,
      options.maxWidthCells,
      options.color,
      options.baselineRatio,
    ].join("\x1F"),
  );
}

function notifyMathImageListeners(): void {
  for (const listener of mathImageListeners) {
    try {
      listener();
    } catch {
      // Listener errors must not break the raster pipeline.
    }
  }
}

/** Synchronous cache lookup used by the markdown AST/layout phase. */
export function getCachedMarkdownMathImage(
  tex: string,
  mode: TuiMarkdownMathMode,
  options?: TuiMarkdownMathImageOptions,
): TuiMarkdownMathImageCells | null {
  return (
    mathImageCache.get(mathImageCacheKey(tex, mode, normalizeMathImageOptions(options))) ?? null
  );
}

/**
 * Drop all cached rasterized formulas (PNG + failed lookups). Useful for long
 * running processes that change cell metrics, and for tests.
 */
export function clearMarkdownMathImageCache(): void {
  mathImageCache.clear();
  mathImageFailed.clear();
}

function evictOldestMathImageEntry(): void {
  const oldest = mathImageCache.keys().next().value;
  if (oldest != null) mathImageCache.delete(oldest);
}

/**
 * Resolve a TeX formula to a PNG base64 + cell size. Cached per
 * (tex, mode, cell metrics, color). In-flight requests are deduped. When a new
 * image finishes, `subscribeMarkdownMathImage` listeners are notified so
 * components can rebuild/re-paint with the real size.
 */
export async function getMarkdownMathImage(
  tex: string,
  mode: TuiMarkdownMathMode,
  options?: TuiMarkdownMathImageOptions,
): Promise<TuiMarkdownMathImageCells | null> {
  const source = String(tex ?? "").trim();
  if (!source) return null;
  const normalized = normalizeMathImageOptions(options);
  const key = mathImageCacheKey(source, mode, normalized);

  const cached = mathImageCache.get(key);
  if (cached) return cached;
  if (mathImageFailed.has(key)) return null;

  const inflight = mathImageInflight.get(key);
  if (inflight) return inflight;

  const pending = (async () => {
    try {
      const rasterizer = customRasterizer ?? (await loadBuiltinMathRasterizer());
      if (!rasterizer) return null;
      const result = await rasterizer(source, mode, normalized);
      if (result && result.base64) {
        mathImageCache.set(key, result);
        if (mathImageCache.size > MAX_CACHE_ENTRIES) evictOldestMathImageEntry();
        notifyMathImageListeners();
      } else if (result === null) {
        // The engine was available but could not render this formula; remember
        // the failure so rebuilds do not re-rasterize it over and over.
        mathImageFailed.add(key);
        if (mathImageFailed.size > MAX_FAILED_ENTRIES) {
          const oldest = mathImageFailed.values().next().value;
          if (oldest != null) mathImageFailed.delete(oldest);
        }
      }
      return result;
    } catch {
      return null;
    } finally {
      mathImageInflight.delete(key);
    }
  })();
  mathImageInflight.set(key, pending);
  return pending;
}

/**
 * Kick off rasterization for every math graphic segment in the given row range
 * that does not have a cached PNG yet. Safe to call after every row rebuild;
 * in-flight and cached requests are deduped inside getMarkdownMathImage. Pass a
 * viewport to avoid rasterizing off-screen formulas (e.g. virtualized views).
 */
export function enqueueMarkdownMathImages(
  rows: readonly TuiMarkdownVisualRow[],
  options?: TuiMarkdownMathImageOptions,
  viewport?: Readonly<{ firstRow: number; lastRow: number }>,
): void {
  const first = Math.max(0, Math.floor(viewport?.firstRow ?? 0));
  const last = Math.min(rows.length, Math.max(first, Math.ceil(viewport?.lastRow ?? rows.length)));
  for (let index = first; index < last; index++) {
    const row = rows[index];
    if (!row) continue;
    for (const segment of row.segments) {
      const graphic = segment.graphic;
      if (graphic?.kind === "math") {
        if (!graphic.base64 && graphic.tex) {
          void getMarkdownMathImage(graphic.tex, "display", options);
        }
        continue;
      }
      // Boxed block-math fallback / raw inline math: the formula still needs
      // rasterization (mode tells us inline vs display).
      const pending = segment.mathAction?.pendingImage;
      if (pending && segment.mathAction?.source) {
        void getMarkdownMathImage(
          segment.mathAction.source,
          segment.mathAction.mode ?? "display",
          options,
        );
      }
    }
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
}

function extractSvgMarkup(containerMarkup: string): string {
  const start = containerMarkup.indexOf("<svg");
  if (start < 0) return "";
  const end = containerMarkup.lastIndexOf("</svg>");
  if (end < start) return "";
  return containerMarkup.slice(start, end + "</svg>".length);
}

function loadBuiltinMathRasterizer(): Promise<TuiMarkdownMathRasterizer | null> {
  if (!builtinRasterizerLoad) {
    builtinRasterizerLoad = (async () => {
      try {
        const [
          { mathjax },
          { TeX },
          { SVG },
          { liteAdaptor },
          { RegisterHTMLHandler },
          { AllPackages },
          { Resvg },
        ] = await Promise.all([
          import("mathjax-full/js/mathjax.js"),
          import("mathjax-full/js/input/tex.js"),
          import("mathjax-full/js/output/svg.js"),
          import("mathjax-full/js/adaptors/liteAdaptor.js"),
          import("mathjax-full/js/handlers/html.js"),
          import("mathjax-full/js/input/tex/AllPackages.js"),
          import("@resvg/resvg-js"),
        ]);

        const adaptor = liteAdaptor();
        RegisterHTMLHandler(adaptor);
        // Malformed TeX must throw so it falls back to raw text instead of
        // rendering MathJax's inline error markup as an image.
        const texInput = new TeX({
          packages: AllPackages,
          formatError: () => {
            throw new Error("Malformed TeX");
          },
        });
        const svgOutput = new SVG({ fontCache: "none" });
        const document = mathjax.document("", { InputJax: texInput, OutputJax: svgOutput });

        return async (source, mode, options) => {
          const node = document.convert(source, { display: mode === "display" });
          let svg = extractSvgMarkup(adaptor.outerHTML(node));
          if (!svg) return null;

          const widthEx = Number(/width="([\d.]+)ex"/.exec(svg)?.[1] ?? 0);
          const heightEx = Number(/height="([\d.]+)ex"/.exec(svg)?.[1] ?? 0);
          if (!(widthEx > 0) || !(heightEx > 0)) return null;

          // 1ex ≈ half of the em box: a single-line formula (~2ex) then maps to
          // roughly one terminal cell.
          const exPx = (options.cellHeightPx / 2) * options.scale;

          if (mode === "inline") {
            // Inline formulas are placed inside the current text row, so they
            // must fit one cell row and align their baseline with the text
            // baseline. Formulas taller than ~2 rows (matrices, stacked cases)
            // stay as raw TeX instead of being crushed into one line; common
            // single-line formulas (fractions with digits, radicals,
            // superscripts, limits) stay well below this and render normally.
            const naturalH = heightEx * exPx;
            const naturalW = widthEx * exPx;
            if (naturalH > options.cellHeightPx * options.scale * 2) return null;

            const rectH = options.cellHeightPx * options.scale;
            const k = rectH / naturalH;
            const contentW = Math.max(1, Math.round(naturalW * k));
            // Round UP to whole cells and letterbox the raster to the exact
            // placement-rect aspect, so the terminal never stretches the image
            // (an aspect mismatch would squeeze/deform the glyphs).
            const widthCells = Math.max(
              1,
              Math.ceil(contentW / (options.cellWidthPx * options.scale)),
            );
            const rectW = widthCells * options.cellWidthPx * options.scale;
            const verticalAlignEx = Number(/vertical-align:\s*(-?[\d.]+)ex/.exec(svg)?.[1] ?? 0);
            const formulaBaseline = (heightEx - Math.abs(verticalAlignEx)) * exPx * k;
            const terminalBaseline = options.baselineRatio * rectH;
            const offsetY = terminalBaseline - formulaBaseline;

            // Inner MathJax SVG keeps its original viewBox; we only set the
            // pixel size so the glyphs scale uniformly (no distortion).
            const inner = svg
              .replace(/style="vertical-align:[^"]*"/, "")
              .replace(/width="[\d.]+ex"/, `width="${contentW}px"`)
              .replace(/height="[\d.]+ex"/, `height="${rectH}px"`);
            const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" color="${options.color}" width="${rectW}px" height="${rectH}px" viewBox="0 0 ${rectW} ${rectH}"><g transform="translate(0 ${offsetY.toFixed(2)})">${inner}</g></svg>`;

            const renderedInline = new Resvg(wrapped, { background: "rgba(0,0,0,0)" }).render();
            const pngInline = renderedInline.asPng();
            if (!pngInline || pngInline.length < 8) return null;

            return {
              base64: base64FromBytes(pngInline),
              widthCells,
              heightCells: 1,
            };
          }

          let widthPx = Math.max(1, Math.round(widthEx * exPx));
          let heightPx = Math.max(1, Math.round(heightEx * exPx));

          if (options.maxWidthCells > 0) {
            const maxPx = options.maxWidthCells * options.cellWidthPx * options.scale;
            if (widthPx > maxPx) {
              heightPx = Math.max(1, Math.round(heightPx * (maxPx / widthPx)));
              widthPx = maxPx;
            }
          }

          svg = svg
            .replace(/style="vertical-align:[^"]*"/, "")
            .replace(/width="[\d.]+ex"/, `width="${widthPx}px"`)
            .replace(/height="[\d.]+ex"/, `height="${heightPx}px"`)
            .replace(/<svg/, `<svg color="${options.color}"`);

          const rendered = new Resvg(svg, { background: "rgba(0,0,0,0)" }).render();
          const png = rendered.asPng();
          if (!png || png.length < 8) return null;

          return {
            base64: base64FromBytes(png),
            widthCells: Math.max(1, Math.round(widthPx / (options.cellWidthPx * options.scale))),
            heightCells: Math.max(1, Math.round(heightPx / (options.cellHeightPx * options.scale))),
          };
        };
      } catch {
        return null;
      }
    })();
  }
  return builtinRasterizerLoad;
}
