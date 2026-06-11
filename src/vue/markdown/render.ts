import type { Style, Terminal } from "../../core/types.js";
import { isTerminalGraphicsProtocol } from "../../renderer/terminal-graphics.js";
import {
  createIterm2InlineImageSequence,
  createKittyGraphicsSequence,
  getTerminalGraphicsOutput,
  stableTerminalGraphicNumericId,
} from "../../renderer/terminal-graphics.js";
import { forEachTextCellSegment, sliceByCellsRange, spaces } from "../utils/text.js";
import type { TuiMarkdownVisualRow } from "./types.js";

const mergedStyleCache = new WeakMap<Style, WeakMap<Style, Style>>();

function mergeStyle(base: Style, overlay?: Style): Style {
  if (!overlay) return base;
  let bucket = mergedStyleCache.get(base);
  if (!bucket) {
    bucket = new WeakMap<Style, Style>();
    mergedStyleCache.set(base, bucket);
  }
  const cached = bucket.get(overlay);
  if (cached) return cached;
  const merged = Object.freeze({ ...base, ...overlay });
  bucket.set(overlay, merged);
  return merged;
}

type ActiveMarkdownImageGraphic = Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
}>;

const activeMarkdownImageGraphics = new WeakMap<Terminal, Map<string, ActiveMarkdownImageGraphic>>();

function markdownImageGraphicId(
  segment: NonNullable<TuiMarkdownVisualRow["segments"][number]["graphic"]>,
  rect: Readonly<{ x: number; y: number }>,
): string {
  return `md-image:${stableTerminalGraphicNumericId(`${segment.src}:${rect.x}:${rect.y}`)}`;
}

function rememberMarkdownImageGraphic(
  terminal: Terminal,
  id: string,
  rect: ActiveMarkdownImageGraphic,
): void {
  let active = activeMarkdownImageGraphics.get(terminal);
  if (!active) {
    active = new Map();
    activeMarkdownImageGraphics.set(terminal, active);
  }
  active.set(id, rect);
}

function clearTrackedMarkdownImageGraphic(terminal: Terminal, id: string): void {
  activeMarkdownImageGraphics.get(terminal)?.delete(id);
  try {
    getTerminalGraphicsOutput(terminal)?.clear?.(id);
  } catch {
    // Best-effort cleanup; raw graphics must not affect text rendering.
  }
}

function clearStaleMarkdownImageGraphicsForRow(
  terminal: Terminal,
  y: number,
  keepIds: ReadonlySet<string>,
): void {
  const active = activeMarkdownImageGraphics.get(terminal);
  if (!active?.size) return;
  for (const [id, rect] of active) {
    if (rect.y !== y || keepIds.has(id)) continue;
    clearTrackedMarkdownImageGraphic(terminal, id);
  }
}

export function clearMarkdownImageGraphics(
  terminal: Terminal,
  rect?: Readonly<{ x: number; y: number; w: number; h: number }>,
): void {
  const active = activeMarkdownImageGraphics.get(terminal);
  if (!active?.size) return;
  for (const [id, item] of active) {
    if (
      rect &&
      (item.x >= rect.x + rect.w ||
        item.x + item.w <= rect.x ||
        item.y >= rect.y + rect.h ||
        item.y + item.h <= rect.y)
    ) {
      continue;
    }
    clearTrackedMarkdownImageGraphic(terminal, id);
  }
}

function queueMarkdownImageGraphic(
  terminal: Terminal,
  segment: NonNullable<TuiMarkdownVisualRow["segments"][number]["graphic"]>,
  rect: Readonly<{ x: number; y: number; w: number }>,
): boolean {
  if (segment.kind !== "image" || !segment.base64) return false;
  const output = getTerminalGraphicsOutput(terminal);
  const protocol = output?.capabilities.preferredProtocol;
  if (!output?.capabilities.supported || !isTerminalGraphicsProtocol(protocol)) return false;

  const width = Math.max(1, Math.floor(segment.displayWidth ?? rect.w));
  const height = Math.max(1, Math.floor(segment.displayHeight ?? 1));
  const id = markdownImageGraphicId(segment, rect);
  const imageId = stableTerminalGraphicNumericId(`image:${id}`);
  const placementId = stableTerminalGraphicNumericId(`placement:${id}`);
  const sequence =
    protocol === "kitty"
      ? createKittyGraphicsSequence(segment.base64, {
          imageId,
          placementId,
          columns: width,
          rows: height,
        })
      : protocol === "iterm2"
        ? createIterm2InlineImageSequence(segment.base64, {
            width,
            height,
            preserveAspectRatio: true,
            doNotMoveCursor: true,
          })
        : "";
  if (!sequence) return false;

  const accepted = output.queue({
    id,
    x: rect.x,
    y: rect.y,
    w: width,
    h: height,
    protocol,
    sequence,
    fallbackText: segment.alt ?? "image",
  });
  if (accepted) {
    rememberMarkdownImageGraphic(terminal, id, { x: rect.x, y: rect.y, w: width, h: height });
  }
  return accepted;
}

export function paintMarkdownVisualRow(
  terminal: Terminal,
  row: TuiMarkdownVisualRow | undefined,
  options: Readonly<{
    x: number;
    y: number;
    w: number;
    clipStart?: number;
    baseStyle: Style;
    clear?: boolean;
  }>,
): void {
  const clipStart = Math.max(0, Math.floor(options.clipStart ?? 0));
  const clipEnd = clipStart + options.w;
  if (!row) {
    if (options.clear !== false) {
      terminal.write(spaces(options.w), { x: options.x, y: options.y, style: options.baseStyle });
      clearStaleMarkdownImageGraphicsForRow(terminal, options.y, new Set());
    }
    return;
  }

  let logicalX = 0;
  let used = 0;
  const queuedGraphics = new Set<string>();
  for (const segment of row.segments) {
    if (used >= options.w || !segment.text) {
      logicalX += segment.cells;
      continue;
    }
    const segmentStart = logicalX;
    const segmentEnd = logicalX + segment.cells;
    logicalX += segment.cells;
    if (segmentEnd <= clipStart || segmentStart >= clipEnd) continue;

    const segmentStyle = mergeStyle(options.baseStyle, segment.style);
    let pieceStart = segmentStart;
    forEachTextCellSegment(segment.text, (piece) => {
      if (used >= options.w) return false;
      const pieceEnd = pieceStart + piece.cells;
      const visibleStart = Math.max(pieceStart, clipStart);
      const visibleEnd = Math.min(pieceEnd, clipEnd);
      pieceStart = pieceEnd;
      if (visibleEnd <= visibleStart) return;

      const expectedUsed = visibleStart - clipStart;
      if (expectedUsed > used) {
        const pad = Math.min(expectedUsed - used, options.w - used);
        terminal.write(spaces(pad), {
          x: options.x + used,
          y: options.y,
          style: options.baseStyle,
        });
        used += pad;
      }

      if (visibleStart === pieceStart - piece.cells && visibleEnd === pieceEnd) {
        const cellX = options.x + used;
        const graphicCandidate =
          segment.graphic && piece.start === 0 && piece.end === segment.text.length
            ? segment.graphic
            : undefined;
        const queuedGraphic = graphicCandidate
          ? queueMarkdownImageGraphic(terminal, graphicCandidate, {
              x: cellX,
              y: options.y,
              w: Math.max(0, options.w - used),
            })
          : false;
        if (queuedGraphic && graphicCandidate) {
          queuedGraphics.add(markdownImageGraphicId(graphicCandidate, { x: cellX, y: options.y }));
        }
        terminal.write(
          queuedGraphic
            ? spaces(piece.cells)
            : segment.graphic
              ? sliceByCellsRange(segment.fallbackText ?? segment.graphic.alt ?? segment.text, 0, piece.cells) || spaces(1)
              : piece.text,
          {
            x: cellX,
            y: options.y,
            style: segmentStyle,
          },
        );
        used += piece.cells;
        return;
      }

      const pad = Math.min(visibleEnd - visibleStart, options.w - used);
      if (pad > 0) {
        const graphicCandidate =
          segment.graphic && piece.start === 0 && piece.end === segment.text.length
            ? segment.graphic
            : undefined;
        const queuedGraphic = graphicCandidate
          ? queueMarkdownImageGraphic(terminal, graphicCandidate, {
              x: options.x + used,
              y: options.y,
              w: pad,
            })
          : false;
        const fallbackSource = graphicCandidate
          ? (segment.fallbackText ?? segment.graphic?.alt ?? piece.text)
          : piece.text;
        const fallback = sliceByCellsRange(
          fallbackSource,
          visibleStart - (pieceStart - piece.cells),
          visibleEnd - (pieceStart - piece.cells),
        );
        if (queuedGraphic && graphicCandidate) {
          queuedGraphics.add(
            markdownImageGraphicId(graphicCandidate, { x: options.x + used, y: options.y }),
          );
        }
        terminal.write(queuedGraphic ? spaces(pad) : fallback || spaces(pad), {
          x: options.x + used,
          y: options.y,
          style: segmentStyle,
        });
        used += pad;
      }
    });
  }
  clearStaleMarkdownImageGraphicsForRow(terminal, options.y, queuedGraphics);
  if (used < options.w && options.clear !== false) {
    terminal.write(spaces(options.w - used), {
      x: options.x + used,
      y: options.y,
      style: options.baseStyle,
    });
  }
}
