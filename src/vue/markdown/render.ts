import type { Style, Terminal } from "../../core/types.js";
import { createDebugLogger, isDebugEnabled } from "../../core/debug-logger.js";
import { isTerminalGraphicsProtocol } from "../../renderer/terminal-graphics.js";
import {
  createKittyDeleteGraphicsSequence,
  createIterm2InlineImageSequence,
  createKittyGraphicsSequence,
  createKittyPlacementSequence,
  getTerminalGraphicsOutput,
  stableTerminalGraphicNumericId,
} from "../../renderer/terminal-graphics.js";
import { forEachTextCellSegment, sliceByCellsRange, spaces } from "../utils/text.js";
import type { TuiMarkdownVisualRow } from "./types.js";

const mergedStyleCache = new WeakMap<Style, WeakMap<Style, Style>>();
const markdownImageDebugLog = createDebugLogger(isDebugEnabled());
const markdownImageDebug = (...parts: readonly string[]) => {
  if (!isDebugEnabled()) return;
  markdownImageDebugLog.render(`markdown image ${parts.join(" ")}`);
};

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

type MarkdownImageGraphicQueueResult = "queued" | "unavailable" | "rejected";

const activeMarkdownImageGraphics = new WeakMap<
  Terminal,
  Map<string, ActiveMarkdownImageGraphic>
>();

export function markdownImageGraphicId(
  segment: NonNullable<TuiMarkdownVisualRow["segments"][number]["graphic"]>,
  rect: Readonly<{ x: number; y: number }>,
): string {
  return `md-image:${stableTerminalGraphicNumericId(
    `${segment.src}:${rect.x}:${rect.y}:${segment.displayWidth ?? 0}:${segment.displayHeight ?? 0}:${segment.base64 ?? ""}`,
  )}`;
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
  keepVisibleIds?: ReadonlySet<string>,
): void {
  const active = activeMarkdownImageGraphics.get(terminal);
  if (!active?.size) return;
  for (const [id, rect] of active) {
    const intersectsRow = keepVisibleIds ? y >= rect.y && y < rect.y + rect.h : rect.y === y;
    if (!intersectsRow || keepIds.has(id) || keepVisibleIds?.has(id)) continue;
    clearTrackedMarkdownImageGraphic(terminal, id);
  }
}

function canAttemptMarkdownImageGraphic(
  terminal: Terminal,
  segment: NonNullable<TuiMarkdownVisualRow["segments"][number]["graphic"]>,
): boolean {
  if (segment.kind !== "image" || !segment.base64) return false;
  const output = getTerminalGraphicsOutput(terminal);
  const protocol = output?.capabilities.preferredProtocol;
  return Boolean(output?.capabilities.supported && isTerminalGraphicsProtocol(protocol));
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
): MarkdownImageGraphicQueueResult {
  if (segment.kind !== "image" || !segment.base64) return "unavailable";
  const output = getTerminalGraphicsOutput(terminal);
  const protocol = output?.capabilities.preferredProtocol;
  if (!output?.capabilities.supported || !isTerminalGraphicsProtocol(protocol)) {
    return "unavailable";
  }

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
          zIndex: -1,
        })
      : protocol === "iterm2"
        ? createIterm2InlineImageSequence(segment.base64, {
            width,
            height,
            preserveAspectRatio: true,
            doNotMoveCursor: true,
          })
        : "";
  if (!sequence) return "unavailable";
  const clearSequence =
    protocol === "kitty"
      ? createKittyDeleteGraphicsSequence({
          imageId,
          placementId,
        })
      : undefined;
  const resizeSequence =
    protocol === "kitty"
      ? createKittyPlacementSequence({
          imageId,
          placementId,
          columns: width,
          rows: height,
          zIndex: -1,
        })
      : undefined;

  const accepted = output.queue({
    id,
    x: rect.x,
    y: rect.y,
    w: width,
    h: height,
    protocol,
    sequence,
    resizeSequence,
    clearSequence,
    fallbackText: segment.alt ?? "image",
  });
  markdownImageDebug(
    `queue id=${id}`,
    `accepted=${accepted ? "true" : "false"}`,
    `x=${rect.x}`,
    `y=${rect.y}`,
    `w=${width}`,
    `h=${height}`,
    `visibleW=${rect.w}`,
    `displayW=${segment.displayWidth ?? ""}`,
    `displayH=${segment.displayHeight ?? ""}`,
  );
  if (accepted) {
    rememberMarkdownImageGraphic(terminal, id, { x: rect.x, y: rect.y, w: width, h: height });
  }
  return accepted ? "queued" : "rejected";
}

export function collectVisibleMarkdownImageGraphicIds(
  rows: readonly TuiMarkdownVisualRow[],
  options: Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
    rowOffset: number;
    clipStart: number;
    isGraphicCovered?: (rect: Readonly<{ x: number; y: number; w: number; h: number }>) => boolean;
  }>,
): ReadonlySet<string> {
  const keepIds = new Set<string>();
  if (options.w <= 0 || options.h <= 0) return keepIds;

  const clipStart = Math.max(0, Math.floor(options.clipStart));
  const clipEnd = clipStart + options.w;
  const firstRow = Math.min(rows.length, Math.max(0, Math.floor(options.rowOffset)));
  const lastRow = Math.min(rows.length, firstRow + Math.max(0, Math.floor(options.h)));
  let scanStart = firstRow;
  while (scanStart > 0 && (rows[scanStart]?.segments.length ?? 0) === 0) {
    scanStart--;
  }

  for (let rowIndex = scanStart; rowIndex < lastRow; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;
    let logicalX = 0;
    for (const segment of row.segments) {
      const segmentStart = logicalX;
      const segmentEnd = logicalX + segment.cells;
      logicalX = segmentEnd;
      if (!segment.graphic) continue;
      if (segmentEnd <= clipStart || segmentStart >= clipEnd) continue;
      if (Math.max(segmentStart, clipStart) !== segmentStart) continue;
      const height = Math.max(1, Math.floor(segment.graphic.displayHeight ?? 1));
      if (rowIndex + height <= firstRow || rowIndex >= lastRow) continue;
      const rect = {
        x: options.x + segmentStart - clipStart,
        y: options.y + rowIndex - firstRow,
        w: Math.max(1, Math.floor(segment.graphic.displayWidth ?? segment.cells)),
        h: height,
      };
      if (options.isGraphicCovered?.(rect)) continue;
      keepIds.add(
        markdownImageGraphicId(segment.graphic, {
          x: rect.x,
          y: rect.y,
        }),
      );
    }
  }

  return keepIds;
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
    keepGraphicIds?: ReadonlySet<string>;
    isGraphicCovered?: (rect: Readonly<{ x: number; y: number; w: number; h: number }>) => boolean;
  }>,
): void {
  const clipStart = Math.max(0, Math.floor(options.clipStart ?? 0));
  const clipEnd = clipStart + options.w;
  if (!row) {
    if (options.clear !== false) {
      terminal.write(spaces(options.w), { x: options.x, y: options.y, style: options.baseStyle });
      clearStaleMarkdownImageGraphicsForRow(terminal, options.y, new Set(), options.keepGraphicIds);
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

    // Graphic segments must be rendered atomically — their placeholder text
    // (spaces) must never be split by forEachTextCellSegment, otherwise the
    // graphic is not queued.
    if (segment.graphic) {
      const visibleStart = Math.max(segmentStart, clipStart);
      const visibleEnd = Math.min(segmentEnd, clipEnd);
      const visibleCells = visibleEnd - visibleStart;
      if (visibleCells <= 0) continue;

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

      const cellX = options.x + used;
      const graphicRect = {
        x: cellX,
        y: options.y,
        w: Math.max(1, Math.floor(segment.graphic.displayWidth ?? visibleCells)),
        h: Math.max(1, Math.floor(segment.graphic.displayHeight ?? 1)),
      };
      const graphicCovered = options.isGraphicCovered?.(graphicRect) === true;
      const queueResult =
        !graphicCovered &&
        visibleStart === segmentStart &&
        visibleCells > 0 &&
        queueMarkdownImageGraphic(terminal, segment.graphic, {
          x: cellX,
          y: options.y,
          w: visibleCells,
        });
      const graphicAvailable =
        queueResult || canAttemptMarkdownImageGraphic(terminal, segment.graphic);
      const queuedGraphic = queueResult === "queued";
      const suppressFallback =
        queuedGraphic || queueResult === "rejected" || graphicAvailable === true;

      if (queuedGraphic) {
        queuedGraphics.add(markdownImageGraphicId(segment.graphic, { x: cellX, y: options.y }));
      }

      terminal.write(
        suppressFallback
          ? spaces(visibleCells)
          : sliceByCellsRange(
              segment.fallbackText ?? segment.graphic.alt ?? "image",
              0,
              visibleCells,
            ) || spaces(visibleCells),
        {
          x: cellX,
          y: options.y,
          style: suppressFallback ? options.baseStyle : segmentStyle,
        },
      );

      used += visibleCells;
      continue;
    }

    // Text segments: normal grapheme-based rendering.
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
        terminal.write(piece.text, {
          x: options.x + used,
          y: options.y,
          style: segmentStyle,
        });
        used += piece.cells;
        return;
      }

      const pad = Math.min(visibleEnd - visibleStart, options.w - used);
      if (pad > 0) {
        const fallback = sliceByCellsRange(
          piece.text,
          visibleStart - (pieceStart - piece.cells),
          visibleEnd - (pieceStart - piece.cells),
        );
        terminal.write(fallback || spaces(pad), {
          x: options.x + used,
          y: options.y,
          style: segmentStyle,
        });
        used += pad;
      }
    });
  }
  clearStaleMarkdownImageGraphicsForRow(
    terminal,
    options.y,
    queuedGraphics,
    options.keepGraphicIds,
  );
  if (used < options.w && options.clear !== false) {
    terminal.write(spaces(options.w - used), {
      x: options.x + used,
      y: options.y,
      style: options.baseStyle,
    });
  }
}
