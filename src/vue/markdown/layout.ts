import { repeatChar, sliceByCellsRange, textCellWidth } from "../utils/text.js";
import type {
  TuiMarkdownBlock,
  TuiMarkdownInlineSegment,
  TuiMarkdownVisualRow,
  TuiMarkdownVisualSegment,
} from "./types.js";

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
    segments: TuiMarkdownVisualSegment[];
    remaining: number;
  } => {
    const prefix = useContinuation ? continuationPrefix : firstPrefix;
    const renderedPrefix = prefix
      .map(toVisualSegment)
      .filter(Boolean) as TuiMarkdownVisualSegment[];
    return {
      segments: [...renderedPrefix],
      remaining: useContinuation ? maxNext : maxFirst,
    };
  };

  let row = openRow(false);
  if (!source.length) {
    rows.push(row.segments);
    return rows;
  }

  const pushRow = () => {
    rows.push(row.segments);
    row = openRow(true);
  };

  for (const segment of source) {
    const totalCells = textCellWidth(segment.text);
    let start = 0;
    while (start < totalCells) {
      if (row.remaining <= 0) pushRow();
      const end = Math.min(totalCells, start + row.remaining);
      let piece = sliceByCellsRange(segment.text, start, end);
      let pieceCells = textCellWidth(piece);
      if (pieceCells <= 0) {
        if (
          row.segments.length > (rows.length > 0 ? continuationPrefix.length : firstPrefix.length)
        ) {
          pushRow();
          continue;
        }
        piece = sliceByCellsRange(segment.text, start, totalCells);
        pieceCells = textCellWidth(piece);
        if (pieceCells <= 0) break;
      }
      row.segments.push({
        text: piece,
        style: segment.style,
        cells: pieceCells,
      });
      start += pieceCells;
      row.remaining -= pieceCells;
      if (start < totalCells) pushRow();
    }
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

export function layoutMarkdownBlocks(
  blocks: readonly TuiMarkdownBlock[],
  width: number,
): readonly TuiMarkdownVisualRow[] {
  const normalizedWidth = Math.max(0, Math.floor(width));
  if (normalizedWidth <= 0) return [];
  const rows: TuiMarkdownVisualRow[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "inline":
        rows.push(...inlineBlockRows(block, normalizedWidth));
        break;
      case "code_block":
        rows.push(...codeBlockRows(block, normalizedWidth));
        break;
      case "thematic_break":
        rows.push(...thematicBreakRows(block, normalizedWidth));
        break;
      case "blank":
        rows.push({
          key: `${block.key}:0`,
          blockKey: block.key,
          rowInBlock: 0,
          plainText: "",
          segments: [],
        });
        break;
    }
  }
  return rows.length
    ? rows
    : [{ key: "md-empty:0", blockKey: "md-empty", rowInBlock: 0, plainText: "", segments: [] }];
}
