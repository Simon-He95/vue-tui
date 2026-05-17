import type { Style } from "../../core/types.js";

export type TTranscriptSegment = Readonly<{
  text: string;
  style?: Style;
  href?: string;
  selectable?: boolean;
  tokenId?: string;
  meta?: unknown;
}>;

export type TTranscriptAction = Readonly<{
  id: string;
  label: string;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger";
  style?: Style;
  hoverStyle?: Style;
  focusStyle?: Style;
  payload?: unknown;
}>;

export type TTranscriptRow =
  | {
      kind: "message";
      key: string | number;
      role?: "user" | "assistant" | "system" | "tool";
      segments: readonly TTranscriptSegment[];
      selectableText?: string;
      actions?: readonly TTranscriptAction[];
      meta?: unknown;
    }
  | {
      kind: "action";
      key: string | number;
      label: string;
      actions: readonly TTranscriptAction[];
      selectableText?: string;
      meta?: unknown;
    }
  | {
      kind: "tool-call";
      key: string | number;
      title: string;
      collapsed: boolean;
      summary?: readonly TTranscriptSegment[];
      body?: readonly TTranscriptSegment[];
      actions?: readonly TTranscriptAction[];
      selectableText?: string;
      meta?: unknown;
    }
  | {
      kind: "approval";
      key: string | number;
      title: string;
      description?: readonly TTranscriptSegment[];
      actions: readonly TTranscriptAction[];
      selectableText?: string;
      meta?: unknown;
    };

export type TTranscriptDataSource = Readonly<{
  rowCount(): number;
  getRow(index: number): TTranscriptRow;
  getRowKey?: (index: number) => string | number;
  firstRowIndex?: () => number;
}>;

export type TTranscriptVisualSegment = Readonly<{
  text: string;
  cells: number;
  style: Style;
  selectable?: boolean;
  sourceSegmentIndex?: number;
}>;

export type TTranscriptSelectionSegment = Readonly<{
  x0: number;
  x1: number;
  text: string;
  selectable: boolean;
}>;

export type TTranscriptHitRegion = Readonly<{
  id: string;
  kind: "link" | "action" | "fold-toggle" | "tool-call" | "custom";
  rowIndex: number;
  visualRow: number;
  x0: number;
  x1: number;
  payload?: unknown;
  hoverStyle?: Style;
  focusStyle?: Style;
}>;

export type TTranscriptVisualRow = Readonly<{
  rowIndex: number;
  rowKey: string | number;
  partIndex: number;
  startCell: number;
  segments: readonly TTranscriptVisualSegment[];
  selectionSegments: readonly TTranscriptSelectionSegment[];
  hitRegions: readonly TTranscriptHitRegion[];
  selectableText?: string;
  text: string;
}>;

export type TTranscriptRegionEvent = Readonly<{
  region: TTranscriptHitRegion;
  row: TTranscriptRow;
  rowIndex: number;
  absoluteRowIndex: number;
  event?: unknown;
}>;

export type TTranscriptRowEvent = Readonly<{
  row: TTranscriptRow;
  rowIndex: number;
  absoluteRowIndex: number;
  event?: unknown;
}>;

export type TTranscriptViewHandle = Readonly<{
  scrollToBottom(): void;
  scrollToTop(): void;
  scrollToRow(index: number, options?: { align?: "start" | "center" | "end" }): void;
  invalidateRow(index: number): void;
  invalidateRange(start: number, end: number): void;
  refreshViewport(): void;
  focusNextRegion(): boolean;
  focusPreviousRegion(): boolean;
  activateFocusedRegion(): boolean;
  getHoveredRegion(): TTranscriptHitRegion | null;
}>;
