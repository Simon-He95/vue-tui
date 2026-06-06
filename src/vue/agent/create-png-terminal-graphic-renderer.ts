import type {
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
} from "../components/TAgentTerminalGraphic.js";
import type { TerminalGraphicRenderQueue } from "../../renderer/terminal-graphic-render-queue.js";
import {
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
  hashTerminalGraphicsString,
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
}>;

type CachedPngTerminalGraphicFrame = Readonly<{
  base64: string;
  fallback?: string;
  cols: number;
  rows?: number;
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

  return {
    base64: String(frame.base64 ?? "").replace(/\s+/g, ""),
    fallback: frame.fallback == null ? undefined : sanitizeTerminalFallbackText(frame.fallback),
    cols: size?.width ?? fallbackCols,
    rows: rawRows == null ? undefined : size?.height,
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
): Promise<string> {
  throwIfAborted(context.signal);
  const value = (await options.fallback?.(content, context)) ?? content;
  throwIfAborted(context.signal);
  return sanitizeTerminalFallbackText(value);
}

async function resolvePngFallbackText(
  frame: CachedPngTerminalGraphicFrame,
  options: CreatePngTerminalGraphicRendererOptions,
  content: string,
  context: TAgentTerminalGraphicRendererContext,
): Promise<string> {
  if (frame.fallback != null) return frame.fallback;
  return resolveFallbackText(options, content, context);
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
      return { type: "text", text: await resolveFallbackText(options, content, context) };
    }

    const key =
      options.cacheKey?.(content, context) ??
      defaultCacheKey(content, context, resolveCacheSalt(options, content, context));
    throwIfAborted(context.signal);

    const png = await queue.cached<CachedPngTerminalGraphicFrame>(
      `${key}\x1Fpng`,
      context.signal,
      async () => {
        throwIfAborted(context.signal);
        const frame = await options.toPngBase64(content, context);
        throwIfAborted(context.signal);
        return normalizeCachedPngFrame(frame, context);
      },
      pngFrameBytes,
      { dedupeInflight: options.dedupeInflight ?? false },
    );

    throwIfAborted(context.signal);
    let fallbackPromise: Promise<string> | undefined;
    const fallback = () =>
      (fallbackPromise ??= resolvePngFallbackText(png, options, content, context));

    if (!png.base64) {
      return {
        type: "text",
        text: await fallback(),
      };
    }

    if (protocol === "kitty") {
      return {
        type: "sequence",
        protocol: "kitty",
        sequence: createKittyGraphicsSequence(png.base64, {
          imageId: context.imageId,
          placementId: context.placementId,
          columns: png.cols,
          rows: png.rows,
        }),
        clearSequence: createKittyDeleteGraphicsSequence({
          imageId: context.imageId,
          placementId: context.placementId,
        }),
        fallback: await fallback(),
        cols: png.cols,
        rows: png.rows,
      };
    }

    if (protocol === "iterm2") {
      return {
        type: "sequence",
        protocol: "iterm2",
        sequence: createIterm2InlineImageSequence(png.base64, {
          width: png.cols,
          height: png.rows,
          preserveAspectRatio: true,
          doNotMoveCursor: true,
        }),
        fallback: await fallback(),
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

      return {
        type: "sequence",
        protocol: "sixel",
        sequence: sixel,
        fallback: await fallback(),
        cols: png.cols,
        rows: png.rows,
      };
    }

    return {
      type: "text",
      text: await fallback(),
    };
  };
}
