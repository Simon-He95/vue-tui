import {
  forEachTextCellSegment,
  repeatChar,
  sliceByCellsRange,
  textCellWidth,
} from "../utils/text.js";
import type { Style } from "../../core/types.js";
import type {
  TuiMarkdownBlock,
  TuiMarkdownInlineSegment,
  TuiMarkdownVisualRow,
  TuiMarkdownVisualSegment,
} from "./types.js";

export type TuiMarkdownLayoutCache = Readonly<{
  width: number;
  entries: ReadonlyMap<string, TuiMarkdownLayoutCacheEntry>;
}>;

type TuiMarkdownLayoutCacheEntry = Readonly<{
  signature: string;
  rows: readonly TuiMarkdownVisualRow[];
}>;

function toVisualSegment(segment: TuiMarkdownInlineSegment): TuiMarkdownVisualSegment | null {
  if (!segment.text) return null;
  const cells = textCellWidth(segment.text);
  if (cells <= 0) return null;
  return {
    text: segment.text,
    style: segment.style,
    cells,
  };
}

function segmentsPlainText(segments: readonly TuiMarkdownVisualSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function segmentsCellWidth(segments: readonly TuiMarkdownInlineSegment[]): number {
  let cells = 0;
  for (const segment of segments) {
    if (segment.hardBreak || !segment.text) continue;
    cells += textCellWidth(segment.text);
  }
  return cells;
}

function normalizeInlineSegments(
  segments: readonly TuiMarkdownInlineSegment[],
): readonly TuiMarkdownInlineSegment[][] {
  const lines: TuiMarkdownInlineSegment[][] = [[]];
  for (const segment of segments) {
    if (segment.hardBreak) {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1]!.push(segment);
  }
  return lines;
}

function clipInlineSegmentsToWidth(
  segments: readonly TuiMarkdownInlineSegment[],
  width: number,
): readonly TuiMarkdownInlineSegment[] {
  let remaining = Math.max(0, Math.floor(width));
  if (remaining <= 0) return [];
  const out: TuiMarkdownInlineSegment[] = [];
  for (const segment of segments) {
    if (segment.hardBreak || !segment.text || remaining <= 0) continue;
    const piece = sliceByCellsRange(segment.text, 0, remaining);
    const cells = textCellWidth(piece);
    if (!piece || cells <= 0) continue;
    out.push(segment.style ? { text: piece, style: segment.style } : { text: piece });
    remaining -= cells;
  }
  return out;
}

function wrapLineSegments(
  source: readonly TuiMarkdownInlineSegment[],
  prefixSegments: readonly TuiMarkdownInlineSegment[],
  continuationPrefixSegments: readonly TuiMarkdownInlineSegment[],
  width: number,
): readonly (readonly TuiMarkdownVisualSegment[])[] {
  const rows: TuiMarkdownVisualSegment[][] = [];
  const prefixCells = segmentsCellWidth(prefixSegments);
  const continuationPrefixCells = segmentsCellWidth(continuationPrefixSegments);
  const firstPrefix =
    prefixCells >= width ? clipInlineSegmentsToWidth(prefixSegments, width) : prefixSegments;
  const firstPrefixCells = segmentsCellWidth(firstPrefix);
  const continuationPrefix =
    continuationPrefixCells >= width
      ? clipInlineSegmentsToWidth(continuationPrefixSegments, Math.max(0, width - 1))
      : continuationPrefixSegments;
  const trimmedContinuationPrefixCells = segmentsCellWidth(continuationPrefix);
  const maxFirst = Math.max(0, width - firstPrefixCells);
  const maxNext = Math.max(0, width - trimmedContinuationPrefixCells);

  const openRow = (
    useContinuation: boolean,
  ): {
    useContinuation: boolean;
    segments: TuiMarkdownVisualSegment[];
    remaining: number;
  } => {
    const prefix = useContinuation ? continuationPrefix : firstPrefix;
    const renderedPrefix = prefix
      .map(toVisualSegment)
      .filter(Boolean) as TuiMarkdownVisualSegment[];
    return {
      useContinuation,
      segments: [...renderedPrefix],
      remaining: useContinuation ? maxNext : maxFirst,
    };
  };

  const openDegradedRow = (): {
    useContinuation: boolean;
    segments: TuiMarkdownVisualSegment[];
    remaining: number;
  } => ({
    useContinuation: true,
    segments: [],
    remaining: width,
  });

  let row = openRow(false);
  if (!source.length) {
    rows.push(row.segments);
    return rows;
  }

  const pushRow = () => {
    rows.push(row.segments);
    row = openRow(true);
  };

  const prefixLengthForRow = () =>
    row.useContinuation ? continuationPrefix.length : firstPrefix.length;
  const rowHasBody = () => row.segments.length > prefixLengthForRow();

  for (const segment of source) {
    let aborted = false;
    forEachTextCellSegment(segment.text, (piece) => {
      while (true) {
        if (row.remaining <= 0) {
          pushRow();
          continue;
        }
        if (piece.cells > row.remaining) {
          if (rowHasBody()) {
            pushRow();
            continue;
          }
          if (!row.useContinuation) {
            rows.push(row.segments);
            row = openDegradedRow();
            continue;
          }
          if (piece.cells <= width) {
            row = openDegradedRow();
            continue;
          }
          aborted = true;
          return false;
        }
        row.segments.push({
          text: piece.text,
          style: segment.style,
          cells: piece.cells,
        });
        row.remaining -= piece.cells;
        return undefined;
      }
    });
    if (aborted) continue;
  }

  rows.push(row.segments);
  return rows;
}

function inlineBlockRows(
  block: Extract<TuiMarkdownBlock, { type: "inline" }>,
  width: number,
): readonly TuiMarkdownVisualRow[] {
  const rows: TuiMarkdownVisualRow[] = [];
  const lines = normalizeInlineSegments(block.segments);
  const prefix = block.prefixSegments ?? [];
  const continuationPrefix = block.continuationPrefixSegments ?? prefix;
  let rowInBlock = 0;
  for (const line of lines) {
    const wrapped = wrapLineSegments(line, prefix, continuationPrefix, width);
    for (const visualSegments of wrapped) {
      rows.push({
        key: `${block.key}:${rowInBlock}`,
        blockKey: block.key,
        rowInBlock,
        plainText: segmentsPlainText(visualSegments),
        segments: visualSegments,
      });
      rowInBlock++;
    }
  }
  return rows.length
    ? rows
    : [
        {
          key: `${block.key}:0`,
          blockKey: block.key,
          rowInBlock: 0,
          plainText: "",
          segments: prefix.map(toVisualSegment).filter(Boolean) as TuiMarkdownVisualSegment[],
        },
      ];
}

function codeBlockRows(
  block: Extract<TuiMarkdownBlock, { type: "code_block" }>,
  width: number,
): readonly TuiMarkdownVisualRow[] {
  const rows: TuiMarkdownVisualRow[] = [];
  const prefix = block.prefixSegments ?? [];
  const continuationPrefix = block.continuationPrefixSegments ?? prefix;
  const lineSegments = block.lines.length ? block.lines : [""];
  let rowInBlock = 0;
  for (const line of lineSegments) {
    const sourceSegments: readonly TuiMarkdownInlineSegment[] = [
      { text: line, style: block.style },
    ];
    const wrapped = wrapLineSegments(sourceSegments, prefix, continuationPrefix, width);
    for (const visualSegments of wrapped) {
      rows.push({
        key: `${block.key}:${rowInBlock}`,
        blockKey: block.key,
        rowInBlock,
        plainText: segmentsPlainText(visualSegments),
        segments: visualSegments,
      });
      rowInBlock++;
    }
  }
  return rows;
}

function thematicBreakRows(
  block: Extract<TuiMarkdownBlock, { type: "thematic_break" }>,
  width: number,
): readonly TuiMarkdownVisualRow[] {
  const prefix = (block.prefixSegments ?? [])
    .map(toVisualSegment)
    .filter(Boolean) as TuiMarkdownVisualSegment[];
  const prefixCells = prefix.reduce((sum, segment) => sum + segment.cells, 0);
  const fill = Math.max(0, width - prefixCells);
  const bar =
    fill > 0
      ? [
          {
            text: repeatChar(block.char ?? "─", fill),
            style: block.style,
            cells: fill,
          } satisfies TuiMarkdownVisualSegment,
        ]
      : [];
  return [
    {
      key: `${block.key}:0`,
      blockKey: block.key,
      rowInBlock: 0,
      plainText: segmentsPlainText([...prefix, ...bar]),
      segments: [...prefix, ...bar],
    },
  ];
}

function styleSignature(style?: Style): string {
  if (!style) return "";
  return [
    style.fg ?? "",
    style.bg ?? "",
    style.bold ? "1" : "0",
    style.dim ? "1" : "0",
    style.italic ? "1" : "0",
    style.underline ? "1" : "0",
    style.inverse ? "1" : "0",
    style.href ?? "",
  ].join("\u0001");
}

function inlineSegmentSignature(segment: TuiMarkdownInlineSegment): string {
  return [segment.text, segment.hardBreak ? "1" : "0", styleSignature(segment.style)].join(
    "\u0002",
  );
}

function inlineSegmentsSignature(segments?: readonly TuiMarkdownInlineSegment[]): string {
  return (segments ?? []).map(inlineSegmentSignature).join("\u0003");
}

function blockLayoutSignature(block: TuiMarkdownBlock): string {
  switch (block.type) {
    case "inline":
      return [
        block.type,
        inlineSegmentsSignature(block.segments),
        inlineSegmentsSignature(block.prefixSegments),
        inlineSegmentsSignature(block.continuationPrefixSegments),
      ].join("\u0004");
    case "code_block":
      return [
        block.type,
        block.lines.join("\u0002"),
        styleSignature(block.style),
        inlineSegmentsSignature(block.prefixSegments),
        inlineSegmentsSignature(block.continuationPrefixSegments),
      ].join("\u0004");
    case "thematic_break":
      return [
        block.type,
        block.char ?? "",
        styleSignature(block.style),
        inlineSegmentsSignature(block.prefixSegments),
      ].join("\u0004");
    case "blank":
      return block.type;
  }
}

export function layoutMarkdownBlock(
  block: TuiMarkdownBlock,
  width: number,
): readonly TuiMarkdownVisualRow[] {
  switch (block.type) {
    case "inline":
      return inlineBlockRows(block, width);
    case "code_block":
      return codeBlockRows(block, width);
    case "thematic_break":
      return thematicBreakRows(block, width);
    case "blank":
      return [
        {
          key: `${block.key}:0`,
          blockKey: block.key,
          rowInBlock: 0,
          plainText: "",
          segments: [],
        },
      ];
  }
}

export function layoutMarkdownBlocksCached(
  blocks: readonly TuiMarkdownBlock[],
  width: number,
  previous?: TuiMarkdownLayoutCache,
): Readonly<{
  rows: readonly TuiMarkdownVisualRow[];
  cache: TuiMarkdownLayoutCache;
}> {
  const normalizedWidth = Math.max(0, Math.floor(width));
  if (normalizedWidth <= 0) {
    return { rows: [], cache: { width: normalizedWidth, entries: new Map() } };
  }

  const rows: TuiMarkdownVisualRow[] = [];
  const entries = new Map<string, TuiMarkdownLayoutCacheEntry>();
  const previousEntries = previous?.width === normalizedWidth ? previous.entries : undefined;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const cacheKey = `${index}\u0000${block.key}`;
    const signature = blockLayoutSignature(block);
    const cached = previousEntries?.get(cacheKey);
    const blockRows =
      cached?.signature === signature ? cached.rows : layoutMarkdownBlock(block, normalizedWidth);
    if (blockRows.length) {
      rows.push(...blockRows);
      entries.set(cacheKey, { signature, rows: blockRows });
    }
  }

  if (!rows.length) {
    const emptyRows = [
      { key: "md-empty:0", blockKey: "md-empty", rowInBlock: 0, plainText: "", segments: [] },
    ];
    entries.set("0\u0000md-empty", { signature: "empty", rows: emptyRows });
    rows.push(...emptyRows);
  }

  return {
    rows,
    cache: { width: normalizedWidth, entries },
  };
}

export function layoutMarkdownBlocks(
  blocks: readonly TuiMarkdownBlock[],
  width: number,
): readonly TuiMarkdownVisualRow[] {
  return layoutMarkdownBlocksCached(blocks, width).rows;
}
