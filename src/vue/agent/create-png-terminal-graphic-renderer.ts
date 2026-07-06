import type {
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
} from "../components/TAgentTerminalGraphic.js";
import type { TerminalGraphicRenderQueue } from "../../renderer/terminal-graphic-render-queue.js";
import {
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  createKittyPlacementSequence,
  hashTerminalGraphicsString,
  isSafeTerminalGraphicsSequence,
  normalizeTerminalGraphicSize,
  sanitizeTerminalFallbackText,
} from "../../renderer/terminal-graphics.js";
import { createTerminalGraphicRenderQueue } from "../../renderer/terminal-graphic-render-queue.js";

export type PngTerminalGraphicFrame = Readonly<{
  base64: string;
  fallback?: string;
  cols?: number;
  rows?: number;
}>;

export type CreatePngTerminalGraphicRendererOptions = Readonly<{
  toPngBase64: (
    content: string,
    context: TAgentTerminalGraphicRendererContext,
  ) => Promise<PngTerminalGraphicFrame>;
  toSixel?: (pngBase64: string, context: TAgentTerminalGraphicRendererContext) => Promise<string>;
  fallback?: (
    content: string,
    context: TAgentTerminalGraphicRendererContext,
  ) => string | Promise<string>;
  cacheSalt?: string | ((content: string, context: TAgentTerminalGraphicRendererContext) => string);
  cacheKey?: (content: string, context: TAgentTerminalGraphicRendererContext) => string;
  queue?: TerminalGraphicRenderQueue;
  dedupeInflight?: boolean;
  zIndex?: number;
}>;

type CachedPngTerminalGraphicFrame = Readonly<{
  base64: string;
  fallback?: string;
  cols: number;
  rows?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}>;

function positiveInt(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function abortError(): Error {
  const error = new Error("Terminal graphic render aborted");
  error.name = "AbortError";
  return error;
}

function base64PrefixBytes(value: string, byteCount: number): Uint8Array | null {
  const data = String(value ?? "").replace(/\s+/g, "");
  const chars = Math.ceil(byteCount / 3) * 4;
  try {
    const binary = atob(data.slice(0, chars));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readPngDimensions(base64: string): Readonly<{ width: number; height: number }> | null {
  const bytes = base64PrefixBytes(base64, 24);
  if (!bytes || bytes.length < 24) return null;
  if (
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }
  const width = ((bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!) >>> 0;
  const height =
    ((bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!) >>> 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function defaultCacheKey(
  content: string,
  context: TAgentTerminalGraphicRendererContext,
  cacheSalt: string,
): string {
  const contentIdentity =
    context.cacheKey != null
      ? `cache:${context.cacheKey}`
      : `content:${hashTerminalGraphicsString(content)}`;
  return [
    context.kind,
    context.width,
    context.height ?? "",
    context.final ? "final" : "draft",
    cacheSalt,
    contentIdentity,
  ].join("\x1F");
}

function resolveCacheSalt(
  options: CreatePngTerminalGraphicRendererOptions,
  content: string,
  context: TAgentTerminalGraphicRendererContext,
): string {
  const salt =
    typeof options.cacheSalt === "function"
      ? options.cacheSalt(content, context)
      : options.cacheSalt;
  return salt == null ? "" : String(salt);
}

function normalizeCachedPngFrame(
  frame: PngTerminalGraphicFrame,
  context: TAgentTerminalGraphicRendererContext,
): CachedPngTerminalGraphicFrame {
  const fallbackCols = normalizeTerminalGraphicSize(context.width, 1)?.width ?? 1;
  const requestedCols = positiveInt(frame.cols) ?? fallbackCols;
  const cols = Math.min(requestedCols, fallbackCols);
  const rawRows = positiveInt(frame.rows) ?? positiveInt(context.height);
  const size = normalizeTerminalGraphicSize(cols, rawRows ?? 1);

  if (rawRows != null && !size) {
    return {
      base64: "",
      fallback: frame.fallback == null ? undefined : sanitizeTerminalFallbackText(frame.fallback),
      cols: fallbackCols,
    };
  }

  const base64 = String(frame.base64 ?? "").replace(/\s+/g, "");
  const dimensions = readPngDimensions(base64);

  return {
    base64,
    fallback: frame.fallback == null ? undefined : sanitizeTerminalFallbackText(frame.fallback),
    cols: size?.width ?? fallbackCols,
    rows: rawRows == null ? undefined : size?.height,
    sourceWidth: dimensions?.width,
    sourceHeight: dimensions?.height,
  };
}

function resolveKittyViewportPlacement(
  png: CachedPngTerminalGraphicFrame,
  context: TAgentTerminalGraphicRendererContext,
): Readonly<{
  columns: number;
  rows?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}> {
  const rect = context.viewport.rect;
  const full = context.viewport.fullRect;
  const columns = positiveInt(rect.w) ?? png.cols;
  const rows = positiveInt(rect.h) ?? png.rows;
  const sourceWidth = positiveInt(png.sourceWidth);
  const sourceHeight = positiveInt(png.sourceHeight);

  if (!sourceWidth || !sourceHeight || full.w <= 0 || full.h <= 0) {
    return { columns, rows };
  }

  const offsetX = Math.max(0, rect.x - full.x);
  const offsetY = Math.max(0, rect.y - full.y);
  const visibleW = Math.max(0, Math.min(rect.w, full.w - offsetX));
  const visibleH = Math.max(0, Math.min(rect.h, full.h - offsetY));
  if (
    offsetX <= 0 &&
    offsetY <= 0 &&
    visibleW >= full.w &&
    visibleH >= full.h
  ) {
    return { columns, rows };
  }

  const x0 = Math.max(0, Math.min(sourceWidth - 1, Math.floor((offsetX * sourceWidth) / full.w)));
  const y0 = Math.max(0, Math.min(sourceHeight - 1, Math.floor((offsetY * sourceHeight) / full.h)));
  const x1 = Math.max(
    x0 + 1,
    Math.min(sourceWidth, Math.ceil(((offsetX + visibleW) * sourceWidth) / full.w)),
  );
  const y1 = Math.max(
    y0 + 1,
    Math.min(sourceHeight, Math.ceil(((offsetY + visibleH) * sourceHeight) / full.h)),
  );

  return {
    columns,
    rows,
    sourceX: x0,
    sourceY: y0,
    sourceWidth: x1 - x0,
    sourceHeight: y1 - y0,
  };
}

function pngFrameBytes(frame: CachedPngTerminalGraphicFrame): number {
  return frame.base64.length + (frame.fallback?.length ?? 0);
}

function stringBytes(value: string): number {
  return value.length;
}

async function resolveFallbackText(
  options: CreatePngTerminalGraphicRendererOptions,
  content: string,
  context: TAgentTerminalGraphicRendererContext,
): Promise<string | undefined> {
  throwIfAborted(context.signal);
  if (!options.fallback) return undefined;
  const value = await options.fallback(content, context);
  throwIfAborted(context.signal);
  return sanitizeTerminalFallbackText(value);
}

async function resolvePngFallbackText(
  frame: CachedPngTerminalGraphicFrame,
  options: CreatePngTerminalGraphicRendererOptions,
  content: string,
  context: TAgentTerminalGraphicRendererContext,
): Promise<string | undefined> {
  if (frame.fallback != null) return frame.fallback;
  return resolveFallbackText(options, content, context);
}

function textFallbackResult(
  text: string | undefined,
): Readonly<{ type: "text"; text: string }> | null {
  return text == null ? null : { type: "text", text };
}

export function createPngTerminalGraphicRenderer(
  options: CreatePngTerminalGraphicRendererOptions,
): TAgentTerminalGraphicRenderer {
  const queue =
    options.queue ??
    createTerminalGraphicRenderQueue({
      maxConcurrency: 2,
      maxEntries: 128,
      maxBytes: 32 * 1024 * 1024,
      dedupeInflight: options.dedupeInflight ?? false,
    });

  return async (content, context) => {
    throwIfAborted(context.signal);

    const protocol = context.protocol;
    if (
      !context.capabilities.supported ||
      protocol === "unicode" ||
      protocol === "none" ||
      !context.visible ||
      !context.rawVisible ||
      (protocol === "sixel" && !options.toSixel)
    ) {
      return textFallbackResult(await resolveFallbackText(options, content, context));
    }

    const key =
      options.cacheKey?.(content, context) ??
      defaultCacheKey(content, context, resolveCacheSalt(options, content, context));
    throwIfAborted(context.signal);

    const png = await queue.cached<CachedPngTerminalGraphicFrame>(
      `${key}\x1Fpng`,
      undefined,
      async () => {
        throwIfAborted(context.signal);
        const frame = await options.toPngBase64(content, context);
        return normalizeCachedPngFrame(frame, context);
      },
      pngFrameBytes,
      { dedupeInflight: options.dedupeInflight ?? false },
    );

    throwIfAborted(context.signal);
    let fallbackPromise: Promise<string | undefined> | undefined;
    const fallback = () =>
      (fallbackPromise ??= resolvePngFallbackText(png, options, content, context));
    const sequenceFallback = async (): Promise<Readonly<{ fallback?: string }>> => {
      if (png.fallback == null && !options.fallback) return {};
      const text = await fallback();
      return text == null ? {} : { fallback: text };
    };

    if (!png.base64) {
      return textFallbackResult(await fallback());
    }

    if (protocol === "kitty") {
      const placement = resolveKittyViewportPlacement(png, context);
      const sequence = createKittyGraphicsSequence(png.base64, {
        imageId: context.imageId,
        placementId: context.placementId,
        zIndex: options.zIndex,
        ...placement,
      });
      const resizeSequence = createKittyPlacementSequence({
        imageId: context.imageId,
        placementId: context.placementId,
        zIndex: options.zIndex,
        ...placement,
      });
      if (!isSafeTerminalGraphicsSequence(sequence, "kitty", "draw")) {
        return textFallbackResult(await fallback());
      }

      return {
        type: "sequence",
        protocol: "kitty",
        sequence,
        resizeSequence,
        clearSequence: createKittyDeleteGraphicsSequence({
          imageId: context.imageId,
          placementId: context.placementId,
        }),
        ...(await sequenceFallback()),
        cols: png.cols,
        rows: png.rows,
        sourceWidth: png.sourceWidth,
        sourceHeight: png.sourceHeight,
        zIndex: options.zIndex,
      };
    }

    if (protocol === "iterm2") {
      const sequence = createIterm2InlineImageSequence(png.base64, {
        width: png.cols,
        height: png.rows,
        preserveAspectRatio: true,
        doNotMoveCursor: true,
      });
      if (!isSafeTerminalGraphicsSequence(sequence, "iterm2", "draw")) {
        return textFallbackResult(await fallback());
      }

      return {
        type: "sequence",
        protocol: "iterm2",
        sequence,
        ...(await sequenceFallback()),
        cols: png.cols,
        rows: png.rows,
      };
    }

    if (protocol === "sixel") {
      const sixel = await queue.cached<string>(
        `${key}\x1Fsixel`,
        context.signal,
        async () => {
          throwIfAborted(context.signal);
          const sixel = await options.toSixel!(png.base64, context);
          throwIfAborted(context.signal);
          return sixel;
        },
        stringBytes,
        { dedupeInflight: options.dedupeInflight ?? false },
      );

      throwIfAborted(context.signal);

      if (!isSafeTerminalGraphicsSequence(sixel, "sixel", "draw")) {
        return textFallbackResult(await fallback());
      }

      return {
        type: "sequence",
        protocol: "sixel",
        sequence: sixel,
        ...(await sequenceFallback()),
        cols: png.cols,
        rows: png.rows,
      };
    }

    return textFallbackResult(await fallback());
  };
}
