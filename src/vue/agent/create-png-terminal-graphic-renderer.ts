import type {
  TAgentTerminalGraphicRenderer,
  TAgentTerminalGraphicRendererContext,
  TAgentTerminalGraphicRenderResult,
} from "../components/TAgentTerminalGraphic.js";
import type { TerminalGraphicRenderQueue } from "../../renderer/terminal-graphic-render-queue.js";
import {
  createIterm2InlineImageSequence,
  createKittyDeleteGraphicsSequence,
  createKittyGraphicsSequence,
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
}>;

function resultBytes(result: TAgentTerminalGraphicRenderResult): number {
  if (!result || typeof result !== "object") return 0;
  if ("sequence" in result && typeof result.sequence === "string") return result.sequence.length;
  if ("text" in result && typeof result.text === "string") return result.text.length;
  return 0;
}

function defaultCacheKey(content: string, context: TAgentTerminalGraphicRendererContext): string {
  return [
    context.kind,
    context.protocol,
    context.width,
    context.height ?? "",
    context.final ? "final" : "draft",
    content,
  ].join("\x1F");
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
    });

  return async (content, context) => {
    const fallback = sanitizeTerminalFallbackText(
      (await options.fallback?.(content, context)) ?? content,
    );

    if (
      !context.capabilities.supported ||
      context.protocol === "unicode" ||
      context.protocol === "none" ||
      !context.visible
    ) {
      return { type: "text", text: fallback };
    }

    const key = options.cacheKey?.(content, context) ?? defaultCacheKey(content, context);

    return queue.cached<TAgentTerminalGraphicRenderResult>(
      key,
      context.signal,
      async () => {
        const png = await options.toPngBase64(content, context);
        const localFallback = sanitizeTerminalFallbackText(png.fallback ?? fallback);
        const cols = png.cols ?? context.width;
        const rows = png.rows ?? context.height;

        if (context.protocol === "kitty") {
          return {
            type: "sequence",
            protocol: "kitty",
            sequence: createKittyGraphicsSequence(png.base64, {
              imageId: context.imageId,
              placementId: context.placementId,
              columns: cols,
              rows,
            }),
            clearSequence: createKittyDeleteGraphicsSequence({
              imageId: context.imageId,
              placementId: context.placementId,
            }),
            fallback: localFallback,
            cols,
            rows,
          };
        }

        if (context.protocol === "iterm2") {
          return {
            type: "sequence",
            protocol: "iterm2",
            sequence: createIterm2InlineImageSequence(png.base64, {
              width: cols,
              height: rows,
              preserveAspectRatio: true,
              doNotMoveCursor: true,
            }),
            fallback: localFallback,
            cols,
            rows,
          };
        }

        if (context.protocol === "sixel" && options.toSixel) {
          return {
            type: "sequence",
            protocol: "sixel",
            sequence: await options.toSixel(png.base64, context),
            fallback: localFallback,
            cols,
            rows,
          };
        }

        return { type: "text", text: localFallback };
      },
      resultBytes,
    );
  };
}
