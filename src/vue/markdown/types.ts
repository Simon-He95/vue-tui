import type { Style } from "../../core/types.js";

export type TuiMarkdownNode = Readonly<{
  type: string;
  raw?: string;
  children?: readonly TuiMarkdownNode[];
  [key: string]: unknown;
}>;

export type TuiMarkdownInlineSegment = Readonly<{
  text: string;
  style?: Style;
  hardBreak?: boolean;
}>;

export type TuiMarkdownTableCellAlign = "left" | "center" | "right";

export type TuiMarkdownTableCell = Readonly<{
  segments: readonly TuiMarkdownInlineSegment[];
  align?: TuiMarkdownTableCellAlign;
}>;

export type TuiMarkdownBlock =
  | Readonly<{
      type: "inline";
      key: string;
      segments: readonly TuiMarkdownInlineSegment[];
      prefixSegments?: readonly TuiMarkdownInlineSegment[];
      continuationPrefixSegments?: readonly TuiMarkdownInlineSegment[];
    }>
  | Readonly<{
      type: "code_block";
      key: string;
      lines: readonly string[];
      language?: string;
      style?: Style;
      prefixSegments?: readonly TuiMarkdownInlineSegment[];
      continuationPrefixSegments?: readonly TuiMarkdownInlineSegment[];
    }>
  | Readonly<{
      type: "thematic_break";
      key: string;
      char?: string;
      style?: Style;
      prefixSegments?: readonly TuiMarkdownInlineSegment[];
    }>
  | Readonly<{
      type: "table";
      key: string;
      header: readonly TuiMarkdownTableCell[];
      rows: readonly (readonly TuiMarkdownTableCell[])[];
      borderStyle?: Style;
      prefixSegments?: readonly TuiMarkdownInlineSegment[];
    }>
  | Readonly<{
      type: "blank";
      key: string;
    }>;

export type TuiMarkdownVisualSegment = Readonly<{
  text: string;
  style?: Style;
  cells: number;
}>;

export type TuiMarkdownVisualRow = Readonly<{
  key: string;
  blockKey: string;
  rowInBlock: number;
  plainText: string;
  segments: readonly TuiMarkdownVisualSegment[];
}>;
