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
  cacheKey?: (content: string, context: TAgentTerminalGraphicRendererContext) => string;
  queue?: TerminalGraphicRenderQueue;
  dedupeInflight?: boolean;
}>;

type CachedPngTerminalGraphicFrame = Readonly<{
  base64: string;
  fallback: string;
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

function defaultCacheKey(content: string, context: TAgentTerminalGraphicRendererContext): string {
  const contentIdentity =
    context.cacheKey != null
      ? `cache:${context.cacheKey}`
      : `content:${hashTerminalGraphicsString(content)}`;
  return [
    context.kind,
    context.protocol,
    context.width,
    context.height ?? "",
    context.final ? "final" : "draft",
    contentIdentity,
  ].join("\x1F");
}

function normalizeCachedPngFrame(
  frame: PngTerminalGraphicFrame,
  fallback: string,
  context: TAgentTerminalGraphicRendererContext,
): CachedPngTerminalGraphicFrame {
  return {
    base64: String(frame.base64 ?? "").replace(/\s+/g, ""),
    fallback: sanitizeTerminalFallbackText(frame.fallback ?? fallback),
    cols: positiveInt(frame.cols) ?? positiveInt(context.width) ?? 1,
    rows: positiveInt(frame.rows) ?? positiveInt(context.height),
  };
}

function pngFrameBytes(frame: CachedPngTerminalGraphicFrame): number {
  return frame.base64.length + frame.fallback.length;
}

function stringBytes(value: string): number {
  return value.length;
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

    const fallback = sanitizeTerminalFallbackText(
      (await options.fallback?.(content, context)) ?? content,
    );
    throwIfAborted(context.signal);

    if (
      !context.capabilities.supported ||
      context.protocol === "unicode" ||
      context.protocol === "none" ||
      !context.visible
    ) {
      return { type: "text", text: fallback };
    }

    const key = options.cacheKey?.(content, context) ?? defaultCacheKey(content, context);
    throwIfAborted(context.signal);

    const png = await queue.cached<CachedPngTerminalGraphicFrame>(
      `${key}\x1Fpng`,
      context.signal,
      async () => {
        throwIfAborted(context.signal);
        const frame = await options.toPngBase64(content, context);
        throwIfAborted(context.signal);
        return normalizeCachedPngFrame(frame, fallback, context);
      },
      pngFrameBytes,
      { dedupeInflight: options.dedupeInflight ?? false },
    );

    throwIfAborted(context.signal);

    if (!png.base64) {
      return { type: "text", text: png.fallback || fallback };
    }

    if (context.protocol === "kitty") {
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
        fallback: png.fallback,
        cols: png.cols,
        rows: png.rows,
      };
    }

    if (context.protocol === "iterm2") {
      return {
        type: "sequence",
        protocol: "iterm2",
        sequence: createIterm2InlineImageSequence(png.base64, {
          width: png.cols,
          height: png.rows,
          preserveAspectRatio: true,
          doNotMoveCursor: true,
        }),
        fallback: png.fallback,
        cols: png.cols,
        rows: png.rows,
      };
    }

    if (context.protocol === "sixel" && options.toSixel) {
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
        fallback: png.fallback,
        cols: png.cols,
        rows: png.rows,
      };
    }

    return { type: "text", text: png.fallback || fallback };
  };
}
