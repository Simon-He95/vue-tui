import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Style } from "../../core/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type { FramePerfReason } from "../../observability/frame-perf.js";
import type {
  SelectedRowSpan,
  SelectionTextProvider,
  TerminalSelectionPoint,
  TerminalSelectionRange,
} from "../../selection/terminal-selection.js";
import type { TerminalFrameContext } from "../context.js";
import type {
  TLogDataSource,
  TLogViewScrollPayload,
  TLogViewVisualIndexOptions,
  TLogViewVisualIndexStatus,
} from "../log/types.js";
import type { TLinkifyOptions } from "../linkify.js";
import { applyAnsiSgrStyle, parseAnsiSgr } from "../../core/ansi/sgr.js";
import {
  terminalSelectionRowSpans,
  terminalSelectionVisibleRowSpans,
} from "../../selection/terminal-selection.js";
import { sanitizeTerminalHref } from "../../core/hyperlink.js";
import {
  computed,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, RenderPlaneContextKey } from "../context.js";
import { createFrameMailbox } from "../scheduler/frame-mailbox.js";
import { TuiThemeContextKey, tuiDefaultTheme } from "../theme.js";
import { linkifyTextSegments } from "../linkify.js";
import { intersectRect, normalizeCellRect, translateRect } from "../utils/rect.js";
import {
  forEachTextCellSegment,
  formatInlineCellLine,
  padEndByCells,
  sanitizeInlineText,
  sliceByCellsRange,
  spaces,
  textCellWidth,
  wrapByCells,
} from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";
import { tryUnsafeFullRowScroll } from "../utils/row-scroll.js";

type ScrollStrategy = "auto" | "viewport-repaint";
type RowScrollMode = "off" | "unsafe-full-row";
type TLogLineKey = string | number;
type TLogRenderCacheKey = string;
type TLogRenderCacheEntry = {
  key: TLogRenderCacheKey;
  value: string;
  touchedAt: number;
};
type TLogWrapCacheEntry = {
  key: TLogRenderCacheKey;
  visualRows: readonly string[];
  touchedAt: number;
};
type TLogStyledSegment = Readonly<{
  text: string;
  style: Style;
}>;
type TLogVisualSegment = Readonly<{
  text: string;
  cells: number;
  style: Style;
}>;
type TLogVisualRow = readonly TLogVisualSegment[];
type TLogAnsiLineCacheEntry = {
  key: TLogRenderCacheKey;
  segments: readonly TLogStyledSegment[];
  touchedAt: number;
};
type TLogAnsiWrapCacheEntry = {
  key: TLogRenderCacheKey;
  visualRows: readonly TLogVisualRow[];
  touchedAt: number;
};
type TLogAnsiRowCacheEntry = {
  key: TLogRenderCacheKey;
  visualSegments: readonly TLogVisualSegment[];
  touchedAt: number;
};
type TLogVisibleLinkSegment = Readonly<{
  startX: number;
  endX: number;
  href: string;
  text: string;
  index: number;
  absoluteLineIndex: number;
  startCell: number;
  endCell: number;
}>;
type TLogSearchStatus = "idle" | "scanning" | "done" | "error";
type TLogSearchLineMatch = Readonly<{
  startCell: number;
  endCell: number;
  text: string;
}>;
type TLogSearchLineCacheEntry = {
  key: TLogRenderCacheKey;
  matches: readonly TLogSearchLineMatch[];
  touchedAt: number;
};
type LocatedVisualRow = {
  lineIndex: number;
  partIndex: number;
};
type TLogDataUpdatePayload = Readonly<{
  version: number;
  lineCount: number;
}>;
export type TLogViewSearchMode = "text" | "regex";
export type TLogViewSearchError = Readonly<{
  kind: "invalid-regex";
  query: string;
  flags: string;
  message: string;
}>;
type CompiledSearch = Readonly<{
  key: string;
  query: string;
  mode: TLogViewSearchMode;
  error: TLogViewSearchError | null;
  findLineMatches: (text: string) => readonly TLogSearchLineMatch[];
}>;
export type TLogViewSearchOptions = Readonly<{
  mode?: TLogViewSearchMode;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxMatches?: number;
  scanBudgetMs?: number;
  regexFlags?: string;
  maxMatchesPerLine?: number;
}>;
export type TLogViewSearchMatch = Readonly<{
  absoluteLineIndex: number;
  index: number;
  startCell: number;
  endCell: number;
  text: string;
}>;
export type TLogViewSelectSearchMatchOptions = Readonly<{
  scroll?: boolean;
  align?: "start" | "center" | "end";
}>;
export type TLogViewSearchResult = Readonly<{
  matchIndex: number;
  match: TLogViewSearchMatch;
  preview?: TLogViewSearchResultPreview;
}>;
export type TLogViewSearchResultPreview = Readonly<{
  text: string;
  matchStartCell: number;
  matchEndCell: number;
}>;
export type TLogViewSearchResultsOptions = Readonly<{
  offset?: number;
  limit?: number;
  includePreview?: boolean;
  previewWidth?: number;
  contextCells?: number;
}>;
export type TLogViewSearchState = Readonly<{
  query: string;
  status: TLogSearchStatus;
  matchCount: number;
  currentMatchIndex: number;
  error?: TLogViewSearchError | null;
}>;
export type TLogViewSearchPayload = Readonly<{
  query: string;
  status: TLogSearchStatus;
  matchCount: number;
  error?: TLogViewSearchError | null;
}>;
export type TLogViewSearchMatchPayload = Readonly<{
  match: TLogViewSearchMatch | null;
  currentMatchIndex: number;
  matchCount: number;
}>;
export type TLogViewSearchMarker = Readonly<{
  matchIndex: number;
  absoluteLineIndex: number;
  index: number;
  visualRow: number;
  estimated: boolean;
  current: boolean;
}>;
export type TLogViewSearchMarkersPayload = Readonly<{
  markers: readonly TLogViewSearchMarker[];
  visualIndexStatus: TLogViewVisualIndexStatus;
  matchCount: number;
  currentMatchIndex: number;
}>;
export type TLogViewLinkClickPayload = Readonly<{
  href: string;
  text: string;
  absoluteLineIndex: number;
  index: number;
  startCell: number;
  endCell: number;
  cellX: number;
  cellY: number;
}>;
export type TLogViewVisibleLink = Readonly<{
  visibleIndex: number;
  href: string;
  text: string;
  absoluteLineIndex: number;
  index: number;
  startCell: number;
  endCell: number;
  startX: number;
  endX: number;
  y: number;
  focused?: boolean;
}>;
export type TLogViewLinkFocusPayload = Readonly<{
  link: TLogViewVisibleLink | null;
  focusedLinkIndex: number;
}>;
export type TLogViewLinkActivatePayload = Readonly<{
  link: TLogViewVisibleLink;
  source: "keyboard" | "programmatic";
}>;
export type TLogViewVisualIndexPayload = Readonly<{
  status: TLogViewVisualIndexStatus;
  lineCount: number;
  measuredLineCount: number;
  estimatedVisualRowCount: number;
  visualRowCount: number;
}>;
export type TLogViewScrollMetrics = Readonly<{
  scrollTop: number;
  maxScrollTop: number;
  viewportRows: number;
  lineCount: number;
  firstLineIndex: number;
  estimatedVisualRowCount: number;
  visualRowCount: number;
  measuredVisualRowCount: number;
  measuredLineCount: number;
  visualIndexStatus: TLogViewVisualIndexStatus;
  atTop: boolean;
  atBottom: boolean;
}>;
export type TLogViewHandle = Readonly<{
  scrollToBottom: () => void;
  scrollToTop: () => void;
  scrollToVisualRow: (row: number) => void;
  scrollBy: (delta: number) => void;
  scrollToLine: (
    index: number,
    options?: Readonly<{
      align?: "start" | "center" | "end";
    }>,
  ) => void;
  refreshViewport: () => void;
  invalidateLine: (index: number) => void;
  invalidateRange: (start: number, end: number) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearSearch: () => void;
  getSearchState: () => TLogViewSearchState;
  selectSearchMatch: (matchIndex: number, options?: TLogViewSelectSearchMatchOptions) => boolean;
  getSearchMatch: (matchIndex: number) => TLogViewSearchMatch | null;
  getSearchResults: (options?: TLogViewSearchResultsOptions) => readonly TLogViewSearchResult[];
  measureVisualIndex: () => void;
  getScrollMetrics: () => TLogViewScrollMetrics;
  getSearchMarkers: () => readonly TLogViewSearchMarker[];
  getVisibleLinks: () => readonly TLogViewVisibleLink[];
  focusVisibleLink: (visibleIndex: number) => boolean;
  focusNextLink: () => boolean;
  focusPreviousLink: () => boolean;
  clearLinkFocus: () => void;
  activateFocusedLink: () => boolean;
}>;

let nextTLogViewTaskId = 0;
const DEFAULT_LINK_STYLE: Style = { underline: true };
const DEFAULT_LOG_RENDER_CACHE_SIZE = 2_000;
const DEFAULT_LOG_WRAP_CACHE_SIZE = 2_000;
const DEFAULT_VISUAL_INDEX_CAPACITY = 1_024;
const DEFAULT_SEARCH_MAX_MATCHES = 10_000;
const DEFAULT_SEARCH_SCAN_BUDGET_MS = 4;
const DEFAULT_SEARCH_MAX_MATCHES_PER_LINE = 1_000;
const DEFAULT_VISUAL_INDEX_MEASURE_BUDGET_MS = 4;
const DEFAULT_SEARCH_RESULTS_PREVIEW_WIDTH = 80;
const DEFAULT_SEARCH_RESULTS_CONTEXT_CELLS = 24;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function nextPowerOfTwo(n: number): number {
  n = Math.max(1, Math.floor(n));
  let power = 1;
  while (power < n) power <<= 1;
  return power;
}

function getWheelScrollInput(e: { deltaY?: number; deltaMode?: number }): {
  deltaY: number;
  mode: "auto" | "line" | "pixel";
} {
  const deltaY = Number(e.deltaY ?? 0);
  const deltaMode = typeof e.deltaMode === "number" ? e.deltaMode : undefined;
  if (
    Number.isInteger(deltaY) &&
    deltaY !== 0 &&
    Math.abs(deltaY) >= 100 &&
    Math.abs(deltaY) % 100 === 0 &&
    deltaMode == null
  ) {
    return { deltaY: deltaY / 100, mode: "line" };
  }
  if (deltaMode === 1) return { deltaY, mode: "line" };
  if (deltaMode === 0) return { deltaY, mode: "pixel" };
  return { deltaY, mode: "auto" };
}

function sanitizeAnsiInlineText(text: string): string {
  const sanitized = sanitizeInlineText(text);
  if (!sanitized) return "";
  const out: string[] = [];

  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    if (code === 0x1b) {
      const next = sanitized[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < sanitized.length) {
          const c = sanitized.charCodeAt(j);
          if (c >= 0x40 && c <= 0x7e) break;
          j++;
        }
        if (j >= sanitized.length) break;
        i = j;
        continue;
      }
      if (next === "]") {
        let j = i + 2;
        while (j < sanitized.length) {
          const c = sanitized.charCodeAt(j);
          if (c === 0x07) break;
          if (c === 0x1b && sanitized[j + 1] === "\\") {
            j++;
            break;
          }
          j++;
        }
        if (j >= sanitized.length) break;
        i = j;
        continue;
      }
      continue;
    }
    if (code <= 0x1f || code === 0x7f) continue;
    out.push(sanitized[i]!);
  }

  return out.join("");
}

function mergeAnsiStyle(baseStyle: Style, style: Style): Style {
  let next: Style = { ...baseStyle };
  if (style.fg !== undefined) next = { ...next, fg: style.fg };
  if (style.bg !== undefined) next = { ...next, bg: style.bg };
  if (style.bold !== undefined) next = { ...next, bold: style.bold };
  if (style.dim !== undefined) next = { ...next, dim: style.dim };
  if (style.italic !== undefined) next = { ...next, italic: style.italic };
  if (style.underline !== undefined) next = { ...next, underline: style.underline };
  if (style.inverse !== undefined) next = { ...next, inverse: style.inverse };
  if (style.href !== undefined) next = { ...next, href: style.href };
  return next;
}

function parseSgrCodes(body: string): number[] {
  const codes = body
    .split(";")
    .filter(Boolean)
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  return codes.length ? codes : [0];
}

function parseOscEnd(input: string, start: number): { body: string; end: number } | null {
  let j = start;
  while (j < input.length) {
    const code = input.charCodeAt(j);
    if (code === 0x07) return { body: input.slice(start, j), end: j };
    if (code === 0x1b && input[j + 1] === "\\") {
      return { body: input.slice(start, j), end: j + 1 };
    }
    j++;
  }
  return null;
}

function parseAnsiLineToSegments(
  text: string,
  baseStyle: Style,
  links: boolean,
  linkStyle: Style,
): readonly TLogStyledSegment[] {
  if (!links) {
    const out: TLogStyledSegment[] = [];

    for (const seg of parseAnsiSgr(text, baseStyle)) {
      const clean = sanitizeAnsiInlineText(seg.text);
      if (!clean) continue;
      out.push({
        text: clean,
        style: mergeAnsiStyle(baseStyle, seg.style),
      });
    }

    return out;
  }

  const out: TLogStyledSegment[] = [];
  let style: Style = {};
  let href: string | undefined;
  let textStart = 0;

  const flush = (until: number): void => {
    if (until <= textStart) return;
    const clean = sanitizeAnsiInlineText(text.slice(textStart, until));
    if (!clean) return;
    const merged = mergeAnsiStyle(baseStyle, style);
    out.push({
      text: clean,
      style: href ? { ...merged, ...linkStyle, href } : merged,
    });
  };

  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== 0x1b) continue;
    const next = text[i + 1];

    if (next === "[") {
      let j = i + 2;
      while (j < text.length) {
        const c = text.charCodeAt(j);
        if ((c >= 48 && c <= 57) || c === 59) {
          j++;
          continue;
        }
        break;
      }
      if (j >= text.length || text[j] !== "m") continue;

      flush(i);
      style = applyAnsiSgrStyle(style, parseSgrCodes(text.slice(i + 2, j)));
      i = j;
      textStart = j + 1;
      continue;
    }

    if (next === "]") {
      const osc = parseOscEnd(text, i + 2);
      if (!osc) continue;

      flush(i);
      const parts = osc.body.split(";");
      if (parts[0] === "8" && parts.length >= 3) {
        href = sanitizeTerminalHref(parts.slice(2).join(";")) ?? undefined;
      }
      i = osc.end;
      textStart = osc.end + 1;
      continue;
    }

    flush(i);
    i += 1;
    textStart = i + 1;
  }

  flush(text.length);
  return out;
}

function styleCacheKey(style: Style): string {
  return JSON.stringify([
    style.fg ?? "",
    style.bg ?? "",
    style.bold ? 1 : 0,
    style.dim ? 1 : 0,
    style.italic ? 1 : 0,
    style.underline ? 1 : 0,
    style.inverse ? 1 : 0,
    style.href ?? "",
  ]);
}

function mergeHighlightStyle(baseStyle: Style, highlightStyle: Style): Style {
  const { href: _href, ...visualHighlightStyle } = highlightStyle;
  const next = { ...baseStyle, ...visualHighlightStyle };
  return baseStyle.href !== undefined ? { ...next, href: baseStyle.href } : next;
}

function mergeLinkOverlayStyle(baseStyle: Style, overlayStyle: Style): Style {
  const next = { ...baseStyle, ...overlayStyle };
  return baseStyle.href !== undefined ? { ...next, href: baseStyle.href } : next;
}

function stringIndexToCell(text: string, index: number): number {
  return textCellWidth(text.slice(0, index));
}

function isAsciiWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

function advanceRegexLastIndex(text: string, lastIndex: number, unicode: boolean): number {
  if (lastIndex >= text.length) return lastIndex + 1;
  if (!unicode) return lastIndex + 1;

  const first = text.charCodeAt(lastIndex);
  if (first >= 0xd800 && first <= 0xdbff && lastIndex + 1 < text.length) {
    const second = text.charCodeAt(lastIndex + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return lastIndex + 2;
  }

  return lastIndex + 1;
}

function findRegexLineMatches(
  text: string,
  regex: RegExp,
  maxMatchesPerLine: number,
): readonly TLogSearchLineMatch[] {
  if (maxMatchesPerLine <= 0) return [];

  regex.lastIndex = 0;
  const out: TLogSearchLineMatch[] = [];
  let attempts = 0;

  while (out.length < maxMatchesPerLine && attempts < maxMatchesPerLine) {
    attempts++;
    const match = regex.exec(text);
    if (!match) break;

    const matchedText = match[0] ?? "";
    const startIndex = match.index;
    const endIndex = startIndex + matchedText.length;

    if (matchedText.length > 0) {
      const startCell = stringIndexToCell(text, startIndex);
      const endCell = stringIndexToCell(text, endIndex);
      if (endCell > startCell) {
        out.push({
          startCell,
          endCell,
          text: matchedText,
        });
      }
    }

    if (matchedText.length === 0) {
      regex.lastIndex = advanceRegexLastIndex(text, regex.lastIndex, regex.unicode);
    }
  }

  return out;
}

function copySearchMatch(match: TLogViewSearchMatch): TLogViewSearchMatch {
  return {
    absoluteLineIndex: match.absoluteLineIndex,
    index: match.index,
    startCell: match.startCell,
    endCell: match.endCell,
    text: match.text,
  };
}

function clipStyledSegmentsByCells(
  segments: readonly TLogStyledSegment[],
  startCell: number,
  endCell: number,
): readonly TLogVisualSegment[] {
  const out: TLogVisualSegment[] = [];
  let cursor = 0;

  for (const seg of segments) {
    const cells = textCellWidth(seg.text);
    const next = cursor + cells;
    if (next > startCell && cursor < endCell) {
      const text = sliceByCellsRange(
        seg.text,
        Math.max(0, startCell - cursor),
        Math.min(cells, endCell - cursor),
      );
      const visibleCells = textCellWidth(text);
      if (text && visibleCells > 0) {
        out.push({
          text,
          cells: visibleCells,
          style: seg.style,
        });
      }
    }
    cursor = next;
    if (cursor >= endCell) break;
  }

  return out;
}

function clipVisualSegmentsByCells(
  segments: readonly TLogVisualSegment[],
  startCell: number,
  endCell: number,
): readonly TLogVisualSegment[] {
  const out: TLogVisualSegment[] = [];
  let cursor = 0;

  for (const seg of segments) {
    const next = cursor + seg.cells;
    if (next > startCell && cursor < endCell) {
      const text = sliceByCellsRange(
        seg.text,
        Math.max(0, startCell - cursor),
        Math.min(seg.cells, endCell - cursor),
      );
      const visibleCells = textCellWidth(text);
      if (text && visibleCells > 0) {
        out.push({
          text,
          cells: visibleCells,
          style: seg.style,
        });
      }
    }
    cursor = next;
    if (cursor >= endCell) break;
  }

  return out;
}

function wrapStyledSegmentsByCells(
  segments: readonly TLogStyledSegment[],
  width: number,
): readonly TLogVisualRow[] {
  width = Math.max(1, Math.floor(width));
  if (!segments.length) return [[]];

  const rows: TLogVisualSegment[][] = [[]];
  let row = rows[0]!;
  let rowCells = 0;

  const openRow = (): void => {
    row = [];
    rows.push(row);
    rowCells = 0;
  };

  const pushWrappedPiece = (text: string, cells: number, style: Style): void => {
    if (cells <= 0) return;
    if (rowCells > 0 && rowCells + cells > width) openRow();
    if (cells > width) {
      let remaining = cells;
      while (remaining > 0) {
        if (rowCells >= width) openRow();
        const take = Math.min(width - rowCells, remaining);
        row.push({ text: spaces(take), cells: take, style });
        rowCells += take;
        remaining -= take;
      }
      return;
    }

    if (rowCells >= width) openRow();
    row.push({ text, cells, style });
    rowCells += cells;
  };

  for (const seg of segments) {
    forEachTextCellSegment(seg.text, (piece) => {
      if (!piece.text || piece.cells <= 0) return;
      pushWrappedPiece(piece.text, piece.cells, seg.style);
    });
  }

  return rows;
}

export const TLogView = defineComponent({
  name: "TLogView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    source: {
      type: Object as PropType<TLogDataSource>,
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    scrollTop: {
      type: Number,
      default: undefined,
    },
    defaultScrollTop: {
      type: Number,
      default: undefined,
    },
    style: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    autoFocus: { type: Boolean, default: false },
    selectable: { type: Boolean, default: true },
    autoStickToBottom: { type: Boolean, default: true },
    overscan: { type: Number, default: 2 },
    wrap: { type: Boolean, default: false },
    visualIndexMode: {
      type: String as PropType<"estimated" | "exact">,
      default: "estimated",
    },
    visualIndexOptions: {
      type: Object as PropType<TLogViewVisualIndexOptions>,
      default: undefined,
    },
    ansi: { type: Boolean, default: false },
    /**
     * Parses OSC8 links only with ansi=true; OSC8 links preserve parsed ANSI style and
     * do not inherit TLink theme defaults.
     */
    links: { type: Boolean, default: false },
    /**
     * Plain-text URL linkification for ansi=false rows; generated links inherit TLink
     * theme defaults before linkStyle.
     */
    linkify: {
      type: [Boolean, Object] as PropType<boolean | TLinkifyOptions>,
      default: false,
    },
    /**
     * Link style override. OSC8 defaults to underline-only over parsed ANSI style;
     * linkify also inherits TLink theme defaults.
     */
    linkStyle: {
      type: Object as PropType<Style>,
      default: undefined,
    },
    keyboardLinks: { type: Boolean, default: false },
    linkFocusStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true }),
    },
    searchQuery: {
      type: String,
      default: "",
    },
    searchOptions: {
      type: Object as PropType<TLogViewSearchOptions>,
      default: undefined,
    },
    highlightMatches: {
      type: Boolean,
      default: true,
    },
    matchStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true }),
    },
    currentMatchStyle: {
      type: Object as PropType<Style>,
      default: () => ({ inverse: true, bold: true }),
    },
    rowScrollMode: {
      type: String as PropType<RowScrollMode>,
      default: "off",
    },
  },
  emits: [
    "scroll",
    "update:scrollTop",
    "update:searchQuery",
    "search",
    "searchMatch",
    "searchMarkers",
    "linkClick",
    "linkFocus",
    "linkActivate",
    "visualIndex",
    "focus",
    "blur",
    "keydown",
  ],
  setup(props, { emit, expose }) {
    const { terminal, scheduler, render, rendererCapabilities, defaultStyle, events, selection } =
      useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const plane = inject(RenderPlaneContextKey, ref<TerminalRenderPlane>("default"));
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const theme = inject(TuiThemeContextKey, ref(tuiDefaultTheme));
    const effectiveAnsiLinkStyle = computed<Style>(() => props.linkStyle ?? DEFAULT_LINK_STYLE);
    const effectiveLinkStyle = computed<Style>(() => ({
      ...(theme.value.components.TLink?.style ?? {}),
      ...(props.linkStyle ?? {}),
    }));

    const focused = ref(false);
    const innerScrollTop = ref(0);
    const stickToBottom = ref(true);
    const frameTaskId = `TLogView:${nextTLogViewTaskId++}`;
    let dirtyRowsHint: readonly number[] | undefined;
    let renderNodeId: string | null = null;
    let alive = true;
    let pendingWheelTop: number | null = null;

    // Under controlled scrollTop, selection auto-scroll only emits a single
    // pending update:scrollTop; the selection focus is remapped only after the
    // parent writes scrollTop back. If the parent never writes back, selection
    // auto-scroll pauses. This is the intended controlled-component semantic.
    let pendingSelectionScrollFocusRemap = false;
    let initializedScrollTop = false;
    let lastLineCount = 0;
    let lastFirstLineIndex = 0;
    let lastPaintedBottom: Readonly<{
      index: number;
      lineKey: TLogLineKey;
    }> | null = null;
    let cacheClock = 0;
    const renderLineCache = new Map<TLogRenderCacheKey, TLogRenderCacheEntry>();
    const wrapLineCache = new Map<TLogRenderCacheKey, TLogWrapCacheEntry>();
    const ansiLineCache = new Map<TLogRenderCacheKey, TLogAnsiLineCacheEntry>();
    const ansiWrapCache = new Map<TLogRenderCacheKey, TLogAnsiWrapCacheEntry>();
    const ansiRowCache = new Map<TLogRenderCacheKey, TLogAnsiRowCacheEntry>();
    const linkifyLineCache = new Map<TLogRenderCacheKey, TLogAnsiLineCacheEntry>();
    const linkifyWrapCache = new Map<TLogRenderCacheKey, TLogAnsiWrapCacheEntry>();
    const searchLineCache = new Map<TLogRenderCacheKey, TLogSearchLineCacheEntry>();
    const visibleLinksByRow = new Map<number, TLogVisibleLinkSegment[]>();
    const focusedVisibleLinkIndex = ref(-1);
    let focusedLinkTarget: Omit<TLogViewVisibleLink, "visibleIndex" | "y"> | null = null;
    let searchGeneration = 0;
    let searchCursor = 0;
    let searchStatus: TLogSearchStatus = "idle";
    let searchError: TLogViewSearchError | null = null;
    let compiledSearch: CompiledSearch = {
      key: '["text","",""]',
      query: "",
      mode: "text",
      error: null,
      findLineMatches: () => [],
    };
    let currentMatchIndex = -1;
    let searchMatches: TLogViewSearchMatch[] = [];
    let searchMarkersGeneration = 0;
    let searchMarkersCacheGeneration = -1;
    let searchMarkersCache: readonly TLogViewSearchMarker[] = [];
    let lastSearchMarkersPayloadKey = "";
    const matchesByLine = new Map<number, number[]>();
    const wheelState = createWheelScrollState();
    // Unknown wrapped lines count as one row until measured, so large bottom mounts avoid full-source wrapping.
    let visualIndexWidth = 0;
    let visualIndexLineCount = 0;
    let visualIndexCapacity = 0;
    let visualCounts: number[] = [];
    let visualKeys: Array<TLogLineKey | undefined> = [];
    let visualTree: number[] = [0];
    let visualIndexStatus: TLogViewVisualIndexStatus = "exact";
    let visualMeasureGeneration = 0;
    let visualMeasureCursor = 0;
    let measuredLineCount = 0;
    let measuredVisualRows = 0;
    let lastVisualIndexPayloadKey = "";

    const fullRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      return translateRect(raw, layout.originX, layout.originY);
    });

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    function normalizedRect(): Rect {
      return normalizeCellRect(absRect.value);
    }

    function normalizedFullRect(): Rect {
      return normalizeCellRect(fullRect.value);
    }

    function clipOffsets(): { x: number; y: number } {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return {
        x: Math.max(0, clip.x - full.x),
        y: Math.max(0, clip.y - full.y),
      };
    }

    function isClipped(): boolean {
      const full = normalizedFullRect();
      const clip = normalizedRect();
      return full.x !== clip.x || full.y !== clip.y || full.w !== clip.w || full.h !== clip.h;
    }

    function hasPaintableViewport(): boolean {
      if (!visible.value) return false;
      const r = normalizedRect();
      return r.w > 0 && r.h > 0;
    }

    function lineCount(): number {
      const n = Math.floor(Number(props.source.lineCount()));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function firstLineIndex(): number {
      const n = Math.floor(Number(props.source.firstLineIndex?.() ?? 0));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function lineKey(index: number): TLogLineKey {
      return props.source.getLineKey?.(index) ?? `v:${props.version}:i:${index}`;
    }

    function renderCacheKey(
      key: TLogLineKey,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): TLogRenderCacheKey {
      return JSON.stringify([key, fullW, clipX, visibleW]);
    }

    function wrapCacheKey(key: TLogLineKey, width: number): TLogRenderCacheKey {
      return JSON.stringify([key, width]);
    }

    function linksEnabled(): boolean {
      return props.ansi && props.links;
    }

    function linkifyEnabled(): boolean {
      return (
        props.ansi !== true &&
        (props.linkify === true || (typeof props.linkify === "object" && props.linkify != null))
      );
    }

    function visualLinksEnabled(): boolean {
      return linksEnabled() || linkifyEnabled();
    }

    function linkifyOptions(): TLinkifyOptions {
      return typeof props.linkify === "object" && props.linkify != null ? props.linkify : {};
    }

    function linkifyOptionsCacheKey(): string {
      const options = linkifyOptions();
      return JSON.stringify([
        options.allowRelative ? 1 : 0,
        options.maxUrlLength ?? "",
        options.protocols ?? [],
      ]);
    }

    const linkifyOptionsKey = computed(() => linkifyOptionsCacheKey());

    function linkStyleCacheKey(): string {
      return linksEnabled() ? styleCacheKey(effectiveAnsiLinkStyle.value) : "";
    }

    function linkifyStyleCacheKey(): string {
      return linkifyEnabled() ? styleCacheKey(effectiveLinkStyle.value) : "";
    }

    function ansiLineCacheKey(
      key: TLogLineKey,
      baseStyleKey: string,
      linkKey: string,
    ): TLogRenderCacheKey {
      return JSON.stringify(["ansi-line", key, baseStyleKey, linksEnabled() ? 1 : 0, linkKey]);
    }

    function linkifyLineCacheKey(
      key: TLogLineKey,
      baseStyleKey: string,
      linkKey: string,
      optionsKey: string,
    ): TLogRenderCacheKey {
      return JSON.stringify(["linkify-line", key, baseStyleKey, linkKey, optionsKey]);
    }

    function linkifyWrapCacheKey(
      key: TLogLineKey,
      width: number,
      baseStyleKey: string,
      linkKey: string,
      optionsKey: string,
    ): TLogRenderCacheKey {
      return JSON.stringify(["linkify-wrap", key, width, baseStyleKey, linkKey, optionsKey]);
    }

    function ansiWrapCacheKey(
      key: TLogLineKey,
      width: number,
      baseStyleKey: string,
      linkKey: string,
    ): TLogRenderCacheKey {
      return JSON.stringify([
        "ansi-wrap",
        key,
        width,
        baseStyleKey,
        linksEnabled() ? 1 : 0,
        linkKey,
      ]);
    }

    function ansiRowCacheKey(
      kind: "fixed" | "wrapped",
      key: TLogLineKey,
      partIndex: number,
      fullW: number,
      clipX: number,
      visibleW: number,
      baseStyleKey: string,
      linkKey: string,
    ): TLogRenderCacheKey {
      return JSON.stringify([
        "ansi-row",
        kind,
        key,
        partIndex,
        fullW,
        clipX,
        visibleW,
        baseStyleKey,
        linksEnabled() ? 1 : 0,
        linkKey,
      ]);
    }

    function visualLineKey(key: TLogLineKey, partIndex: number): TLogRenderCacheKey {
      return JSON.stringify([key, "part", partIndex]);
    }

    function trimRenderCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (renderLineCache.size <= max) return;

      const entries = Array.from(renderLineCache.values()).sort(
        (a, b) => a.touchedAt - b.touchedAt,
      );
      for (const entry of entries.slice(0, renderLineCache.size - max)) {
        renderLineCache.delete(entry.key);
      }
    }

    function trimWrapCache(): void {
      const max = DEFAULT_LOG_WRAP_CACHE_SIZE;
      if (wrapLineCache.size <= max) return;

      const entries = Array.from(wrapLineCache.values()).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const entry of entries.slice(0, wrapLineCache.size - max)) {
        wrapLineCache.delete(entry.key);
      }
    }

    function trimAnsiLineCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (ansiLineCache.size <= max) return;

      const entries = Array.from(ansiLineCache.values()).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const entry of entries.slice(0, ansiLineCache.size - max)) {
        ansiLineCache.delete(entry.key);
      }
    }

    function trimAnsiWrapCache(): void {
      const max = DEFAULT_LOG_WRAP_CACHE_SIZE;
      if (ansiWrapCache.size <= max) return;

      const entries = Array.from(ansiWrapCache.values()).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const entry of entries.slice(0, ansiWrapCache.size - max)) {
        ansiWrapCache.delete(entry.key);
      }
    }

    function trimAnsiRowCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (ansiRowCache.size <= max) return;

      const entries = Array.from(ansiRowCache.values()).sort((a, b) => a.touchedAt - b.touchedAt);
      for (const entry of entries.slice(0, ansiRowCache.size - max)) {
        ansiRowCache.delete(entry.key);
      }
    }

    function trimLinkifyLineCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (linkifyLineCache.size <= max) return;

      const entries = Array.from(linkifyLineCache.values()).sort(
        (a, b) => a.touchedAt - b.touchedAt,
      );
      for (const entry of entries.slice(0, linkifyLineCache.size - max)) {
        linkifyLineCache.delete(entry.key);
      }
    }

    function trimLinkifyWrapCache(): void {
      const max = DEFAULT_LOG_WRAP_CACHE_SIZE;
      if (linkifyWrapCache.size <= max) return;

      const entries = Array.from(linkifyWrapCache.values()).sort(
        (a, b) => a.touchedAt - b.touchedAt,
      );
      for (const entry of entries.slice(0, linkifyWrapCache.size - max)) {
        linkifyWrapCache.delete(entry.key);
      }
    }

    function trimSearchLineCache(): void {
      const max = DEFAULT_LOG_RENDER_CACHE_SIZE;
      if (searchLineCache.size <= max) return;

      const entries = Array.from(searchLineCache.values()).sort(
        (a, b) => a.touchedAt - b.touchedAt,
      );
      for (const entry of entries.slice(0, searchLineCache.size - max)) {
        searchLineCache.delete(entry.key);
      }
    }

    function clearLineCaches(): void {
      renderLineCache.clear();
      wrapLineCache.clear();
      ansiLineCache.clear();
      ansiWrapCache.clear();
      ansiRowCache.clear();
      linkifyLineCache.clear();
      linkifyWrapCache.clear();
      searchLineCache.clear();
      visibleLinksByRow.clear();
    }

    function renderLine(
      index: number,
      count: number,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): string {
      if (index < 0 || index >= count) return spaces(visibleW);

      const rawKey = lineKey(index);
      const key = renderCacheKey(rawKey, fullW, clipX, visibleW);
      const cached = renderLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.value;
      }

      const text = props.source.getLine(index);
      const fullLine = formatInlineCellLine(text, fullW);
      const line = padEndByCells(sliceByCellsRange(fullLine, clipX, clipX + visibleW), visibleW);
      renderLineCache.set(key, {
        key,
        value: line,
        touchedAt: ++cacheClock,
      });
      return line;
    }

    function wrappedRowsForLine(index: number, count: number, width: number): readonly string[] {
      if (index < 0 || index >= count) return [""];

      width = Math.max(1, Math.floor(width));
      const rawKey = lineKey(index);
      const key = wrapCacheKey(rawKey, width);
      const cached = wrapLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualRows;
      }

      const wrapped = wrapByCells(sanitizeInlineText(props.source.getLine(index)), width);
      const rows = wrapped.length ? wrapped : [""];
      wrapLineCache.set(key, {
        key,
        visualRows: rows,
        touchedAt: ++cacheClock,
      });
      return rows;
    }

    function renderVisualLine(
      key: TLogLineKey,
      rawVisual: string,
      fullW: number,
      clipX: number,
      visibleW: number,
    ): string {
      const cacheKey = renderCacheKey(key, fullW, clipX, visibleW);
      const cached = renderLineCache.get(cacheKey);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.value;
      }

      const line = padEndByCells(sliceByCellsRange(rawVisual, clipX, clipX + visibleW), visibleW);
      renderLineCache.set(cacheKey, {
        key: cacheKey,
        value: line,
        touchedAt: ++cacheClock,
      });
      return line;
    }

    function ansiSegmentsForLine(
      index: number,
      count: number,
      baseStyle: Style,
      baseStyleKey: string,
      linkKey = linkStyleCacheKey(),
    ): readonly TLogStyledSegment[] {
      if (index < 0 || index >= count) return [];

      const rawKey = lineKey(index);
      const key = ansiLineCacheKey(rawKey, baseStyleKey, linkKey);
      const cached = ansiLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.segments;
      }

      const segments = parseAnsiLineToSegments(
        props.source.getLine(index),
        baseStyle,
        linksEnabled(),
        effectiveAnsiLinkStyle.value,
      );
      ansiLineCache.set(key, {
        key,
        segments,
        touchedAt: ++cacheClock,
      });
      return segments;
    }

    function ansiWrappedRowsForLine(
      index: number,
      count: number,
      width: number,
      baseStyle: Style,
      baseStyleKey: string,
      linkKey = linkStyleCacheKey(),
    ): readonly TLogVisualRow[] {
      if (index < 0 || index >= count) return [[]];

      width = Math.max(1, Math.floor(width));
      const rawKey = lineKey(index);
      const key = ansiWrapCacheKey(rawKey, width, baseStyleKey, linkKey);
      const cached = ansiWrapCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualRows;
      }

      const segments = ansiSegmentsForLine(index, count, baseStyle, baseStyleKey, linkKey);
      const rows = wrapStyledSegmentsByCells(segments, width);
      ansiWrapCache.set(key, {
        key,
        visualRows: rows,
        touchedAt: ++cacheClock,
      });
      return rows;
    }

    function ansiFixedRowForLine(
      index: number,
      count: number,
      fullW: number,
      clipX: number,
      visibleW: number,
      baseStyle: Style,
      baseStyleKey: string,
      linkKey = linkStyleCacheKey(),
    ): readonly TLogVisualSegment[] {
      if (index < 0 || index >= count) return [];

      const rawKey = lineKey(index);
      const key = ansiRowCacheKey(
        "fixed",
        rawKey,
        0,
        fullW,
        clipX,
        visibleW,
        baseStyleKey,
        linkKey,
      );
      const cached = ansiRowCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualSegments;
      }

      const segments = ansiSegmentsForLine(index, count, baseStyle, baseStyleKey, linkKey);
      const visualSegments = clipStyledSegmentsByCells(segments, clipX, clipX + visibleW);
      ansiRowCache.set(key, {
        key,
        visualSegments,
        touchedAt: ++cacheClock,
      });
      return visualSegments;
    }

    function ansiClippedVisualRow(
      rawKey: TLogLineKey,
      partIndex: number,
      rawRow: TLogVisualRow,
      fullW: number,
      clipX: number,
      visibleW: number,
      baseStyleKey: string,
      linkKey = linkStyleCacheKey(),
    ): readonly TLogVisualSegment[] {
      const key = ansiRowCacheKey(
        "wrapped",
        rawKey,
        partIndex,
        fullW,
        clipX,
        visibleW,
        baseStyleKey,
        linkKey,
      );
      const cached = ansiRowCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualSegments;
      }

      const visualSegments = clipVisualSegmentsByCells(rawRow, clipX, clipX + visibleW);
      ansiRowCache.set(key, {
        key,
        visualSegments,
        touchedAt: ++cacheClock,
      });
      return visualSegments;
    }

    function linkifiedSegmentsForText(
      text: string,
      baseStyle: Style,
      options: TLinkifyOptions,
      linkStyle: Style,
    ): readonly TLogStyledSegment[] {
      const clean = sanitizeInlineText(text);
      if (!clean) return [];
      return linkifyTextSegments(clean, options).map((segment) => ({
        text: segment.text,
        style: segment.href ? { ...baseStyle, ...linkStyle, href: segment.href } : baseStyle,
      }));
    }

    function linkifiedSegmentsForLine(
      index: number,
      count: number,
      baseStyle: Style,
      baseStyleKey: string,
      linkKey = linkifyStyleCacheKey(),
      optionsKey = linkifyOptionsKey.value,
    ): readonly TLogStyledSegment[] {
      if (index < 0 || index >= count) return [];

      const rawKey = lineKey(index);
      const key = linkifyLineCacheKey(rawKey, baseStyleKey, linkKey, optionsKey);
      const cached = linkifyLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.segments;
      }

      const segments = linkifiedSegmentsForText(
        props.source.getLine(index),
        baseStyle,
        linkifyOptions(),
        effectiveLinkStyle.value,
      );
      linkifyLineCache.set(key, {
        key,
        segments,
        touchedAt: ++cacheClock,
      });
      return segments;
    }

    function linkifiedWrappedRowsForLine(
      index: number,
      count: number,
      width: number,
      baseStyle: Style,
      baseStyleKey: string,
      linkKey = linkifyStyleCacheKey(),
      optionsKey = linkifyOptionsKey.value,
    ): readonly TLogVisualRow[] {
      if (index < 0 || index >= count) return [[]];
      width = Math.max(1, Math.floor(width));
      const rawKey = lineKey(index);
      const key = linkifyWrapCacheKey(rawKey, width, baseStyleKey, linkKey, optionsKey);
      const cached = linkifyWrapCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.visualRows;
      }

      const segments = linkifiedSegmentsForLine(
        index,
        count,
        baseStyle,
        baseStyleKey,
        linkKey,
        optionsKey,
      );
      const rows = wrapStyledSegmentsByCells(segments, width);
      linkifyWrapCache.set(key, {
        key,
        visualRows: rows,
        touchedAt: ++cacheClock,
      });
      return rows;
    }

    function linkifiedFixedRowForLine(
      index: number,
      count: number,
      baseStyle: Style,
      baseStyleKey: string,
      clipX: number,
      visibleW: number,
      linkKey = linkifyStyleCacheKey(),
      optionsKey = linkifyOptionsKey.value,
    ): readonly TLogVisualSegment[] {
      if (index < 0 || index >= count) return [];
      const segments = linkifiedSegmentsForLine(
        index,
        count,
        baseStyle,
        baseStyleKey,
        linkKey,
        optionsKey,
      );
      return clipStyledSegmentsByCells(segments, clipX, clipX + visibleW);
    }

    function normalizedSearchQuery(): string {
      const query = props.searchQuery ?? "";
      return query.trim() ? query : "";
    }

    function maxSearchMatches(): number {
      const n = Math.floor(Number(props.searchOptions?.maxMatches ?? DEFAULT_SEARCH_MAX_MATCHES));
      if (!Number.isFinite(n)) return DEFAULT_SEARCH_MAX_MATCHES;
      return Math.max(0, n);
    }

    function searchScanBudgetMs(): number {
      const n = Number(props.searchOptions?.scanBudgetMs ?? DEFAULT_SEARCH_SCAN_BUDGET_MS);
      if (!Number.isFinite(n)) return DEFAULT_SEARCH_SCAN_BUDGET_MS;
      return Math.max(0, n);
    }

    function searchMode(): TLogViewSearchMode {
      return props.searchOptions?.mode === "regex" ? "regex" : "text";
    }

    function normalizedMaxMatchesPerLine(): number {
      const n = Math.floor(
        Number(props.searchOptions?.maxMatchesPerLine ?? DEFAULT_SEARCH_MAX_MATCHES_PER_LINE),
      );
      if (!Number.isFinite(n)) return DEFAULT_SEARCH_MAX_MATCHES_PER_LINE;
      return Math.max(0, n);
    }

    function normalizeRegexFlags(): string {
      const flags = new Set<string>();
      for (const ch of props.searchOptions?.regexFlags ?? "") {
        if (ch === "g" || ch === "y") continue;
        flags.add(ch);
      }
      if (props.searchOptions?.caseSensitive !== true) flags.add("i");
      flags.add("g");
      return Array.from(flags).join("");
    }

    function compileTextSearch(query: string): CompiledSearch {
      const caseSensitive = props.searchOptions?.caseSensitive === true;
      const wholeWord = props.searchOptions?.wholeWord === true;
      const haystackQuery = caseSensitive ? query : query.toLowerCase();
      return {
        key: JSON.stringify(["text", query, caseSensitive ? 1 : 0, wholeWord ? 1 : 0]),
        query,
        mode: "text",
        error: null,
        findLineMatches: (text) => {
          if (!haystackQuery) return [];
          const haystack = caseSensitive ? text : text.toLowerCase();
          const out: TLogSearchLineMatch[] = [];
          let from = 0;
          while (from <= haystack.length) {
            const index = haystack.indexOf(haystackQuery, from);
            if (index < 0) break;
            const endIndex = index + haystackQuery.length;
            if (
              !wholeWord ||
              (!isAsciiWordChar(text[index - 1]) && !isAsciiWordChar(text[endIndex]))
            ) {
              const startCell = stringIndexToCell(text, index);
              const endCell = stringIndexToCell(text, endIndex);
              if (endCell > startCell) {
                out.push({
                  startCell,
                  endCell,
                  text: text.slice(index, endIndex),
                });
              }
            }
            from = index + Math.max(1, haystackQuery.length);
          }
          return out;
        },
      };
    }

    function compileRegexSearch(query: string): CompiledSearch {
      const flags = normalizeRegexFlags();
      try {
        const regex = new RegExp(query, flags);
        const maxMatchesPerLine = normalizedMaxMatchesPerLine();
        return {
          key: JSON.stringify(["regex", query, flags, maxMatchesPerLine]),
          query,
          mode: "regex",
          error: null,
          findLineMatches: (text) => findRegexLineMatches(text, regex, maxMatchesPerLine),
        };
      } catch (error) {
        return {
          key: JSON.stringify(["regex-error", query, flags]),
          query,
          mode: "regex",
          error: {
            kind: "invalid-regex",
            query,
            flags,
            message: error instanceof Error ? error.message : String(error),
          },
          findLineMatches: () => [],
        };
      }
    }

    function compileSearch(query: string): CompiledSearch {
      if (!query) {
        return {
          key: `["${searchMode()}","",""]`,
          query: "",
          mode: searchMode(),
          error: null,
          findLineMatches: () => [],
        };
      }
      return searchMode() === "regex" ? compileRegexSearch(query) : compileTextSearch(query);
    }

    function searchLineCacheKey(rawKey: TLogLineKey, searchKey: string): TLogRenderCacheKey {
      return JSON.stringify(["search-line", rawKey, props.ansi ? 1 : 0, searchKey]);
    }

    function searchPayload(query = normalizedSearchQuery()): TLogViewSearchPayload {
      return {
        query,
        status: searchStatus,
        matchCount: searchMatches.length,
        error: searchError,
      };
    }

    function searchMatchPayload(): TLogViewSearchMatchPayload {
      return {
        match: currentMatchIndex >= 0 ? (searchMatches[currentMatchIndex] ?? null) : null,
        currentMatchIndex,
        matchCount: searchMatches.length,
      };
    }

    function emitSearch(query = normalizedSearchQuery()): void {
      emit("search", searchPayload(query));
    }

    function emitSearchMatch(): void {
      emit("searchMatch", searchMatchPayload());
    }

    function invalidateSearchMarkers(): void {
      searchMarkersGeneration++;
    }

    function isExactVisualMarkerLine(index: number): boolean {
      if (!props.wrap) return true;
      return visualIndexStatus === "exact" || index < measuredLineCount;
    }

    function isMeasuredVisualMarkerLine(index: number): boolean {
      if (!props.wrap) return true;
      return visualKeys[index] === lineKey(index);
    }

    function getSearchMarkers(): readonly TLogViewSearchMarker[] {
      if (searchMarkersCacheGeneration === searchMarkersGeneration) return searchMarkersCache;
      if (!searchMatches.length) {
        searchMarkersCache = [];
        searchMarkersCacheGeneration = searchMarkersGeneration;
        return searchMarkersCache;
      }

      const count = lineCount();
      const width = currentWrapWidth();
      const base = props.style ?? defaultStyle.value;
      const baseStyleKey = styleCacheKey(base);
      const lineStartCache = new Map<number, number>();
      const exactCache = new Map<number, boolean>();
      const plainRowsCache = new Map<number, readonly string[]>();
      const ansiRowsCache = new Map<number, ReturnType<typeof ansiWrappedRowsForLine>>();
      const markers: TLogViewSearchMarker[] = [];

      for (let matchIndex = 0; matchIndex < searchMatches.length; matchIndex++) {
        const match = searchMatches[matchIndex]!;
        let visualRow = match.index;
        let exact = true;

        if (props.wrap) {
          let lineStart = lineStartCache.get(match.index);
          if (lineStart == null) {
            lineStart = visualStartForLine(match.index);
            lineStartCache.set(match.index, lineStart);
          }

          const lineMeasured = isMeasuredVisualMarkerLine(match.index);
          exact =
            exactCache.get(match.index) ?? (lineMeasured && isExactVisualMarkerLine(match.index));
          exactCache.set(match.index, exact);
          if (lineMeasured && props.ansi) {
            let rows = ansiRowsCache.get(match.index);
            if (!rows) {
              rows = ansiWrappedRowsForLine(match.index, count, width, base, baseStyleKey);
              ansiRowsCache.set(match.index, rows);
            }
            visualRow = lineStart + partIndexForCellInAnsiWrappedRow(rows, match.startCell);
          } else if (lineMeasured) {
            let rows = plainRowsCache.get(match.index);
            if (!rows) {
              rows = wrappedRowsForLine(match.index, count, width);
              plainRowsCache.set(match.index, rows);
            }
            visualRow = lineStart + partIndexForCellInPlainWrappedRow(rows, match.startCell);
          } else {
            visualRow = lineStart + Math.max(0, Math.floor(match.startCell / width));
          }
        }

        markers.push({
          matchIndex,
          absoluteLineIndex: match.absoluteLineIndex,
          index: match.index,
          visualRow,
          estimated: !exact,
          current: matchIndex === currentMatchIndex,
        });
      }

      searchMarkersCache = markers;
      searchMarkersCacheGeneration = searchMarkersGeneration;
      return searchMarkersCache;
    }

    function searchMarkersPayload(): TLogViewSearchMarkersPayload {
      return {
        markers: getSearchMarkers(),
        visualIndexStatus,
        matchCount: searchMatches.length,
        currentMatchIndex,
      };
    }

    function emitSearchMarkers(force = false): void {
      const payload = searchMarkersPayload();
      const key = JSON.stringify([
        searchMarkersGeneration,
        visualIndexStatus,
        payload.matchCount,
        payload.currentMatchIndex,
      ]);
      if (!force && key === lastSearchMarkersPayloadKey) return;
      lastSearchMarkersPayloadKey = key;
      emit("searchMarkers", payload);
    }

    function clearSearchMatches(): void {
      searchMatches = [];
      matchesByLine.clear();
      currentMatchIndex = -1;
      invalidateSearchMarkers();
    }

    function addSearchMatch(match: TLogViewSearchMatch): void {
      const matchIndex = searchMatches.length;
      searchMatches.push(match);
      let lineMatches = matchesByLine.get(match.index);
      if (!lineMatches) {
        lineMatches = [];
        matchesByLine.set(match.index, lineMatches);
      }
      lineMatches.push(matchIndex);
      invalidateSearchMarkers();
    }

    function searchableTextForLine(
      index: number,
      count: number,
      baseStyle: Style,
      baseStyleKey: string,
    ): string {
      if (props.ansi) {
        return ansiSegmentsForLine(index, count, baseStyle, baseStyleKey)
          .map((seg) => seg.text)
          .join("");
      }
      return sanitizeInlineText(props.source.getLine(index));
    }

    function normalizeSearchResultPreviewWidth(value: number | undefined): number {
      const n = Math.floor(Number(value ?? DEFAULT_SEARCH_RESULTS_PREVIEW_WIDTH));
      if (!Number.isFinite(n)) return DEFAULT_SEARCH_RESULTS_PREVIEW_WIDTH;
      return Math.max(1, n);
    }

    function normalizeSearchResultContextCells(value: number | undefined): number {
      const n = Math.floor(Number(value ?? DEFAULT_SEARCH_RESULTS_CONTEXT_CELLS));
      if (!Number.isFinite(n)) return DEFAULT_SEARCH_RESULTS_CONTEXT_CELLS;
      return Math.max(0, n);
    }

    function previewForMatch(
      match: TLogViewSearchMatch,
      count: number,
      baseStyle: Style,
      baseStyleKey: string,
      options: Readonly<{
        previewWidth: number;
        contextCells: number;
      }>,
    ): TLogViewSearchResultPreview {
      const text = searchableTextForLine(match.index, count, baseStyle, baseStyleKey);
      const totalCells = textCellWidth(text);
      const matchCells = Math.max(1, match.endCell - match.startCell);
      const previewWidth = Math.max(options.previewWidth, matchCells);
      const maxStart = Math.max(0, totalCells - previewWidth);
      let startCell = Math.max(0, match.startCell - options.contextCells);
      let endCell = Math.min(totalCells, match.endCell + options.contextCells);

      if (endCell - startCell > previewWidth) {
        const minStart = Math.max(0, match.endCell - previewWidth);
        const maxVisibleStart = Math.min(match.startCell, maxStart);
        startCell = clamp(startCell, minStart, maxVisibleStart);
        endCell = Math.min(totalCells, startCell + previewWidth);
      }

      if (endCell - startCell < previewWidth && endCell < totalCells) {
        endCell = Math.min(totalCells, startCell + previewWidth);
      }
      if (endCell - startCell < previewWidth && startCell > 0) {
        startCell = Math.max(0, endCell - previewWidth);
      }

      let previewText = sliceByCellsRange(text, startCell, endCell);
      let matchStartCell = match.startCell - startCell;
      let matchEndCell = match.endCell - startCell;

      if (startCell > 0) {
        previewText = `…${previewText}`;
        matchStartCell += 1;
        matchEndCell += 1;
      }
      if (endCell < totalCells) previewText = `${previewText}…`;

      return {
        text: previewText,
        matchStartCell,
        matchEndCell,
      };
    }

    function cachedLineSearchMatches(
      index: number,
      count: number,
      search: CompiledSearch,
      baseStyle: Style,
      baseStyleKey: string,
    ): readonly TLogSearchLineMatch[] {
      const rawKey = lineKey(index);
      const key = searchLineCacheKey(rawKey, search.key);
      const cached = searchLineCache.get(key);
      if (cached) {
        cached.touchedAt = ++cacheClock;
        return cached.matches;
      }

      const matches = search.findLineMatches(
        searchableTextForLine(index, count, baseStyle, baseStyleKey),
      );
      searchLineCache.set(key, {
        key,
        matches,
        touchedAt: ++cacheClock,
      });
      return matches;
    }

    function scanSearchLine(
      index: number,
      count: number,
      search: CompiledSearch,
      baseStyle: Style,
      baseStyleKey: string,
      maxMatches: number,
      absoluteBase: number,
    ): void {
      if (searchMatches.length >= maxMatches) return;
      const lineMatches = cachedLineSearchMatches(index, count, search, baseStyle, baseStyleKey);
      for (const match of lineMatches) {
        if (searchMatches.length >= maxMatches) return;
        addSearchMatch({
          absoluteLineIndex: absoluteBase + index,
          index,
          startCell: match.startCell,
          endCell: match.endCell,
          text: match.text,
        });
      }
    }

    function scanSearchChunk(generation: number, ctx: TerminalFrameContext): void {
      if (generation !== searchGeneration || !alive) return;

      if (!compiledSearch.query) {
        searchStatus = "idle";
        searchError = null;
        clearSearchMatches();
        emitSearch("");
        emitSearchMatch();
        emitSearchMarkers(true);
        return;
      }

      const started = ctx.now();
      const budget = searchScanBudgetMs();
      const count = lineCount();
      const maxMatches = maxSearchMatches();
      const absoluteBase = firstLineIndex();
      const base = props.style ?? defaultStyle.value;
      const baseStyleKey = styleCacheKey(base);
      let scanned = 0;

      while (
        searchCursor < count &&
        searchMatches.length < maxMatches &&
        (scanned === 0 || ctx.now() - started < budget)
      ) {
        scanSearchLine(
          searchCursor,
          count,
          compiledSearch,
          base,
          baseStyleKey,
          maxMatches,
          absoluteBase,
        );
        searchCursor++;
        scanned++;
      }

      if (searchCursor < count && searchMatches.length < maxMatches) {
        ctx.requestMore();
        scheduler.queueFrameTask({
          id: `${frameTaskId}:search`,
          reason: "data",
          priority: "low",
          sync: false,
          run: (nextCtx) => scanSearchChunk(generation, nextCtx),
        });
        return;
      }

      searchStatus = "done";
      searchError = null;
      emitSearch(compiledSearch.query);
      emitSearchMarkers(true);
      markViewportDirty();
      ctx.invalidate({ priority: "low", plane: plane.value, reason: "data" });
      trimSearchLineCache();
    }

    function requestSearchScan(): void {
      const query = normalizedSearchQuery();
      const hadSearchState =
        searchStatus !== "idle" || searchMatches.length > 0 || currentMatchIndex >= 0;
      const generation = ++searchGeneration;
      searchCursor = 0;

      if (!query) {
        compiledSearch = compileSearch("");
        searchStatus = "idle";
        searchError = null;
        if (hadSearchState) {
          clearSearchMatches();
          emitSearch("");
          emitSearchMatch();
          emitSearchMarkers(true);
          markViewportDirty();
          invalidateSelf("normal", "data");
        }
        return;
      }

      compiledSearch = compileSearch(query);
      clearSearchMatches();
      searchError = compiledSearch.error;
      if (compiledSearch.error) {
        searchStatus = "error";
        emitSearch(query);
        emitSearchMatch();
        emitSearchMarkers(true);
        markViewportDirty();
        invalidateSelf("normal", "data");
        return;
      }

      searchStatus = "scanning";
      emitSearch(query);
      emitSearchMatch();
      emitSearchMarkers(true);
      markViewportDirty();
      invalidateSelf("normal", "data");
      scheduler.queueFrameTask({
        id: `${frameTaskId}:search`,
        reason: "data",
        priority: "low",
        sync: false,
        run: (ctx) => scanSearchChunk(generation, ctx),
      });
    }

    function searchHighlightStyle(matchIndex: number): Style {
      return matchIndex === currentMatchIndex ? props.currentMatchStyle : props.matchStyle;
    }

    function applySearchHighlightsToSegments(
      segments: readonly TLogVisualSegment[],
      lineIndex: number,
      visibleStartCell: number,
    ): readonly TLogVisualSegment[] {
      if (!props.highlightMatches || !searchMatches.length) return segments;
      const lineMatches = matchesByLine.get(lineIndex);
      if (!lineMatches?.length) return segments;

      const out: TLogVisualSegment[] = [];
      let cursor = visibleStartCell;
      for (const seg of segments) {
        let localStart = 0;
        while (localStart < seg.cells) {
          const absoluteCell = cursor + localStart;
          let matchIndex = -1;
          let nextLocalEnd = seg.cells;

          for (const candidateIndex of lineMatches) {
            const match = searchMatches[candidateIndex]!;
            if (match.endCell <= absoluteCell) continue;
            if (match.startCell > absoluteCell) {
              nextLocalEnd = Math.min(nextLocalEnd, match.startCell - cursor);
              break;
            }
            matchIndex = candidateIndex;
            nextLocalEnd = Math.min(nextLocalEnd, match.endCell - cursor);
            break;
          }

          nextLocalEnd = clamp(nextLocalEnd, localStart + 1, seg.cells);
          const text = sliceByCellsRange(seg.text, localStart, nextLocalEnd);
          const cells = textCellWidth(text);
          if (text && cells > 0) {
            out.push({
              text,
              cells,
              style:
                matchIndex >= 0
                  ? mergeHighlightStyle(seg.style, searchHighlightStyle(matchIndex))
                  : seg.style,
            });
          }
          localStart = nextLocalEnd;
        }
        cursor += seg.cells;
      }
      return out;
    }

    function plainVisualSegments(text: string, style: Style): readonly TLogVisualSegment[] {
      const cells = textCellWidth(text);
      return text && cells > 0 ? [{ text, cells, style }] : [];
    }

    function wrappedPlainRowStartCell(rows: readonly string[], partIndex: number): number {
      let start = 0;
      for (let i = 0; i < partIndex; i++) start += textCellWidth(rows[i] ?? "");
      return start;
    }

    function wrappedAnsiRowStartCell(rows: readonly TLogVisualRow[], partIndex: number): number {
      let start = 0;
      for (let i = 0; i < partIndex; i++) {
        for (const seg of rows[i] ?? []) start += seg.cells;
      }
      return start;
    }

    function partIndexForCellInPlainWrappedRow(rows: readonly string[], cell: number): number {
      let start = 0;
      for (let i = 0; i < rows.length; i++) {
        const width = textCellWidth(rows[i] ?? "");
        const end = start + width;
        if (cell >= start && cell < end) return i;
        start = end;
      }
      return Math.max(0, rows.length - 1);
    }

    function partIndexForCellInAnsiWrappedRow(
      rows: readonly TLogVisualRow[],
      cell: number,
    ): number {
      let start = 0;
      for (let i = 0; i < rows.length; i++) {
        let width = 0;
        for (const seg of rows[i] ?? []) width += seg.cells;
        const end = start + width;
        if (cell >= start && cell < end) return i;
        start = end;
      }
      return Math.max(0, rows.length - 1);
    }

    function currentWrapWidth(): number {
      return Math.max(1, normalizedFullRect().w);
    }

    function visualIndexMeasureBudgetMs(): number {
      const raw = Number(props.visualIndexOptions?.measureBudgetMs);
      if (!Number.isFinite(raw)) return DEFAULT_VISUAL_INDEX_MEASURE_BUDGET_MS;
      return Math.max(0, raw);
    }

    function visualIndexMaxMeasuredLines(count = lineCount()): number {
      const raw = props.visualIndexOptions?.maxMeasuredLines;
      if (raw == null) return count;
      const n = Math.floor(Number(raw));
      if (!Number.isFinite(n)) return count;
      return clamp(n, 0, count);
    }

    function visualRowCount(): number {
      return estimatedVisualRowCount();
    }

    function measuredVisualRowCount(): number {
      return props.wrap ? measuredVisualRows : lineCount();
    }

    function visualMeasurementTargetLineCount(count = lineCount()): number {
      return Math.min(count, visualIndexMaxMeasuredLines(count));
    }

    function shouldAutoMeasureVisualIndex(): boolean {
      return props.wrap && (props.visualIndexMode === "exact" || visualIndexStatus === "measuring");
    }

    function recomputeMeasuredVisualRows(): void {
      if (!props.wrap) {
        measuredVisualRows = lineCount();
        return;
      }
      measuredVisualRows = fenwickSum(measuredLineCount);
    }

    function syncNonWrappedVisualIndexState(): void {
      const count = lineCount();
      measuredLineCount = count;
      measuredVisualRows = count;
      visualMeasureCursor = count;
      visualIndexStatus = "exact";
    }

    function visualIndexPayload(): TLogViewVisualIndexPayload {
      return {
        status: visualIndexStatus,
        lineCount: lineCount(),
        measuredLineCount,
        estimatedVisualRowCount: estimatedVisualRowCount(),
        visualRowCount: visualRowCount(),
      };
    }

    function emitVisualIndex(force = false): void {
      const payload = visualIndexPayload();
      const key = JSON.stringify(payload);
      if (!force && key === lastVisualIndexPayloadKey) return;
      lastVisualIndexPayloadKey = key;
      if (props.wrap) invalidateSearchMarkers();
      emit("visualIndex", payload);
      if (!props.wrap || visualIndexStatus !== "measuring") emitSearchMarkers(true);
    }

    function fenwickAdd(index: number, delta: number): void {
      for (let i = index + 1; i <= visualIndexCapacity; i += i & -i) {
        visualTree[i] = (visualTree[i] ?? 0) + delta;
      }
    }

    function fenwickSum(lineEnd: number): number {
      let sum = 0;
      for (let i = clamp(lineEnd, 0, visualIndexLineCount); i > 0; i -= i & -i) {
        sum += visualTree[i] ?? 0;
      }
      return sum;
    }

    function rebuildFenwick(): void {
      visualTree = Array.from({ length: visualIndexCapacity + 1 }, (_, index) =>
        index > 0 && index <= visualIndexLineCount ? (visualCounts[index - 1] ?? 1) : 0,
      );
      for (let i = 1; i <= visualIndexCapacity; i++) {
        const next = i + (i & -i);
        if (next <= visualIndexCapacity) visualTree[next] += visualTree[i] ?? 0;
      }
    }

    function resetVisualIndex(count = lineCount(), width = currentWrapWidth()): void {
      visualIndexWidth = width;
      visualIndexLineCount = count;
      visualIndexCapacity = nextPowerOfTwo(Math.max(DEFAULT_VISUAL_INDEX_CAPACITY, count));
      visualCounts = Array.from({ length: count }, () => 1);
      visualKeys = Array.from({ length: count }, () => undefined);
      rebuildFenwick();
      measuredLineCount = 0;
      measuredVisualRows = 0;
      visualMeasureCursor = 0;
      visualMeasureGeneration++;
      visualIndexStatus = props.wrap ? "estimated" : "exact";
      if (!props.wrap) syncNonWrappedVisualIndexState();
      emitVisualIndex();
    }

    function ensureVisualCapacity(count: number): void {
      if (count <= visualIndexCapacity) return;
      visualIndexCapacity = nextPowerOfTwo(Math.max(count, visualIndexCapacity * 2));
      rebuildFenwick();
    }

    function appendEstimatedVisualLines(prevCount: number, nextCount: number): void {
      if (nextCount <= prevCount) return;
      ensureVisualCapacity(nextCount);
      visualCounts.length = nextCount;
      visualKeys.length = nextCount;
      for (let i = prevCount; i < nextCount; i++) {
        visualCounts[i] = 1;
        visualKeys[i] = undefined;
        fenwickAdd(i, 1);
      }
      visualIndexLineCount = nextCount;
    }

    function ensureVisualIndex(): void {
      if (!props.wrap) {
        syncNonWrappedVisualIndexState();
        return;
      }
      const count = lineCount();
      const width = currentWrapWidth();
      if (visualIndexCapacity <= 0 || visualIndexWidth !== width || count < visualIndexLineCount) {
        resetVisualIndex(count, width);
        return;
      }
      if (count > visualIndexLineCount) appendEstimatedVisualLines(visualIndexLineCount, count);
    }

    function measureVisualLine(index: number): number {
      ensureVisualIndex();
      if (index < 0 || index >= visualIndexLineCount) return 0;

      const key = lineKey(index);
      if (visualKeys[index] === key) return 0;

      const base = props.style ?? defaultStyle.value;
      const rows = props.ansi
        ? ansiWrappedRowsForLine(
            index,
            visualIndexLineCount,
            visualIndexWidth,
            base,
            styleCacheKey(base),
          )
        : wrappedRowsForLine(index, visualIndexLineCount, visualIndexWidth);
      const nextCount = Math.max(1, rows.length);
      const prevCount = visualCounts[index] ?? 1;
      if (nextCount !== prevCount) {
        visualCounts[index] = nextCount;
        fenwickAdd(index, nextCount - prevCount);
      }
      visualKeys[index] = key;
      return nextCount - prevCount;
    }

    function syncVisualIndexStatus(): void {
      if (!props.wrap) {
        syncNonWrappedVisualIndexState();
        return;
      }

      const count = lineCount();
      const target = visualMeasurementTargetLineCount(count);
      if (measuredLineCount >= target) {
        visualIndexStatus = target >= count ? "exact" : "estimated";
        return;
      }
      if (visualIndexStatus !== "measuring") visualIndexStatus = "estimated";
    }

    function resetMeasuredPrefixFrom(index: number): void {
      if (!props.wrap) {
        syncNonWrappedVisualIndexState();
        return;
      }

      const nextMeasured = clamp(index, 0, visualIndexLineCount);
      if (nextMeasured === measuredLineCount && visualMeasureCursor === nextMeasured) return;
      measuredLineCount = nextMeasured;
      visualMeasureCursor = nextMeasured;
      recomputeMeasuredVisualRows();
      syncVisualIndexStatus();
      emitVisualIndex();
    }

    function measureVisualIndexChunk(generation: number, ctx: TerminalFrameContext): void {
      if (generation !== visualMeasureGeneration || !alive || !props.wrap) return;

      ensureVisualIndex();
      const count = lineCount();
      const target = visualMeasurementTargetLineCount(count);
      if (visualMeasureCursor >= target) {
        syncVisualIndexStatus();
        emitVisualIndex();
        return;
      }

      const started = ctx.now();
      const budget = visualIndexMeasureBudgetMs();
      let scanned = 0;
      let topAdjustment = 0;

      while (visualMeasureCursor < target && (scanned === 0 || ctx.now() - started < budget)) {
        const index = visualMeasureCursor;
        const effectiveTop = currentScrollTop() + topAdjustment;
        const start = visualStartForLine(index);
        const prevCount = visualCounts[index] ?? 1;
        const delta = measureVisualLine(index);
        if (delta !== 0 && effectiveTop >= start + prevCount) topAdjustment += delta;
        visualMeasureCursor++;
        measuredLineCount = visualMeasureCursor;
        measuredVisualRows += visualCounts[index] ?? 1;
        scanned++;
      }

      if (topAdjustment !== 0) {
        const prevTop = rawScrollTop();
        const nextTop = normalizeScrollTop(prevTop + topAdjustment);
        if (nextTop !== prevTop) {
          if (isScrollControlled()) {
            emit("update:scrollTop", nextTop);
            emitScroll(nextTop);
          } else {
            innerScrollTop.value = nextTop;
            stickToBottom.value = stickToBottom.value && nextTop >= maxScrollTop();
            emitScroll(nextTop);
          }
        }
      }

      if (visualMeasureCursor < target) {
        emitVisualIndex();
        ctx.requestMore();
        scheduler.queueFrameTask({
          id: `${frameTaskId}:visual-index`,
          reason: "data",
          priority: "low",
          sync: false,
          run: (nextCtx) => measureVisualIndexChunk(generation, nextCtx),
        });
        return;
      }

      syncVisualIndexStatus();
      emitVisualIndex();
    }

    function requestVisualIndexMeasurement(restartFrom = measuredLineCount): void {
      if (!props.wrap) {
        syncNonWrappedVisualIndexState();
        emitVisualIndex();
        return;
      }

      ensureVisualIndex();
      resetMeasuredPrefixFrom(restartFrom);
      const target = visualMeasurementTargetLineCount();
      if (measuredLineCount >= target) {
        syncVisualIndexStatus();
        emitVisualIndex();
        return;
      }

      const generation = ++visualMeasureGeneration;
      visualMeasureCursor = measuredLineCount;
      visualIndexStatus = "measuring";
      emitVisualIndex();
      scheduler.queueFrameTask({
        id: `${frameTaskId}:visual-index`,
        reason: "data",
        priority: "low",
        sync: false,
        run: (ctx) => measureVisualIndexChunk(generation, ctx),
      });
    }

    function ensureBottomMeasured(): void {
      if (!props.wrap) return;
      ensureVisualIndex();
      const count = visualIndexLineCount;
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const needed = Math.max(0, clipY + r.h + Math.max(0, Math.floor(props.overscan)));
      let rows = 0;
      for (let i = count - 1; i >= 0 && rows < needed; i--) {
        measureVisualLine(i);
        rows += visualCounts[i] ?? 1;
      }
    }

    function estimatedVisualRowCount(): number {
      if (!props.wrap) return lineCount();
      ensureVisualIndex();
      return fenwickSum(visualIndexLineCount);
    }

    function bottomScrollTop(): number {
      if (props.wrap) ensureBottomMeasured();
      return maxScrollTop();
    }

    function visualStartForLine(index: number): number {
      ensureVisualIndex();
      return fenwickSum(index);
    }

    function findLineForVisualRow(visualRow: number): number {
      let index = 0;
      let bit = 1;
      while (bit << 1 <= visualIndexCapacity) bit <<= 1;

      let target = visualRow + 1;
      for (; bit > 0; bit >>= 1) {
        const next = index + bit;
        if (next <= visualIndexCapacity && (visualTree[next] ?? 0) < target) {
          index = next;
          target -= visualTree[next] ?? 0;
        }
      }
      return clamp(index, 0, Math.max(0, visualIndexLineCount - 1));
    }

    function locateVisualRow(visualRow: number): LocatedVisualRow | null {
      ensureVisualIndex();
      if (visualRow < 0 || visualRow >= estimatedVisualRowCount()) return null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const lineIndex = findLineForVisualRow(visualRow);
        measureVisualLine(lineIndex);
        const start = visualStartForLine(lineIndex);
        const count = visualCounts[lineIndex] ?? 1;
        if (visualRow >= start && visualRow < start + count) {
          return { lineIndex, partIndex: visualRow - start };
        }
      }

      const lineIndex = findLineForVisualRow(visualRow);
      const start = visualStartForLine(lineIndex);
      return { lineIndex, partIndex: Math.max(0, visualRow - start) };
    }

    function prepareWrapIndexForSourceChange(prevCount: number, nextCount: number): boolean {
      if (!props.wrap) return false;

      ensureVisualIndex();
      if (nextCount < prevCount) {
        resetVisualIndex(nextCount, currentWrapWidth());
        return false;
      }

      if (nextCount > visualIndexLineCount) {
        appendEstimatedVisualLines(visualIndexLineCount, nextCount);
      }

      const maybeChanged = nextCount > prevCount ? prevCount - 1 : nextCount - 1;
      const restartFrom =
        nextCount > prevCount ? Math.max(0, prevCount - 1) : Math.max(0, nextCount - 1);
      if (nextCount > prevCount) resetMeasuredPrefixFrom(Math.min(measuredLineCount, restartFrom));
      if (maybeChanged < 0) return false;

      const oldKey = visualKeys[maybeChanged];
      const nextKey = lineKey(maybeChanged);
      if (oldKey === undefined || oldKey === nextKey) return false;

      resetMeasuredPrefixFrom(Math.min(measuredLineCount, maybeChanged));
      visualKeys[maybeChanged] = undefined;
      measureVisualLine(maybeChanged);
      return true;
    }

    function visualRowsForTrimmedHead(count: number): number {
      if (count <= 0) return 0;
      if (!props.wrap) return count;

      let rows = 0;
      const measuredCount = Math.min(count, visualIndexLineCount);
      for (let i = 0; i < measuredCount; i++) rows += visualCounts[i] ?? 1;
      return rows + Math.max(0, count - measuredCount);
    }

    function trimVisualIndexHead(droppedHeadLines: number, nextCount: number): void {
      if (!props.wrap) return;

      const width = currentWrapWidth();
      if (visualIndexCapacity <= 0 || visualIndexWidth !== width) {
        resetVisualIndex(nextCount, width);
        return;
      }

      if (nextCount > visualIndexCapacity) {
        visualIndexCapacity = nextPowerOfTwo(Math.max(nextCount, visualIndexCapacity * 2));
      }

      const drop = clamp(droppedHeadLines, 0, visualIndexLineCount);
      const shiftedCount = Math.min(Math.max(0, visualIndexLineCount - drop), nextCount);
      for (let i = 0; i < shiftedCount; i++) {
        visualCounts[i] = visualCounts[i + drop] ?? 1;
        visualKeys[i] = visualKeys[i + drop];
      }
      for (let i = shiftedCount; i < nextCount; i++) {
        visualCounts[i] = 1;
        visualKeys[i] = undefined;
      }

      visualCounts.length = nextCount;
      visualKeys.length = nextCount;
      visualIndexLineCount = nextCount;
      rebuildFenwick();
      measuredLineCount = Math.min(Math.max(0, measuredLineCount - drop), nextCount);
      visualMeasureCursor = measuredLineCount;
      recomputeMeasuredVisualRows();
      syncVisualIndexStatus();
      emitVisualIndex();
    }

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, estimatedVisualRowCount() - (clipY + clip.h));
    }

    function viewportHeight(): number {
      return normalizedRect().h;
    }

    function normalizeScrollNumber(value: unknown): number {
      const n = Math.floor(Number(value));
      if (!Number.isFinite(n)) return 0;
      return n;
    }

    function normalizeScrollTop(value: unknown): number {
      const n = normalizeScrollNumber(value);
      return clamp(n, 0, maxScrollTop());
    }

    function isScrollControlled(): boolean {
      return props.scrollTop != null;
    }

    function currentScrollTop(): number {
      return isScrollControlled()
        ? normalizeScrollTop(props.scrollTop)
        : normalizeScrollTop(innerScrollTop.value);
    }

    function rawScrollTop(): number {
      return isScrollControlled()
        ? normalizeScrollNumber(props.scrollTop)
        : normalizeScrollNumber(innerScrollTop.value);
    }

    function isAtBottom(top = currentScrollTop()): boolean {
      return top >= maxScrollTop();
    }

    function shouldStickForAppend(): boolean {
      return props.autoStickToBottom && stickToBottom.value;
    }

    function syncStickFromCurrentScrollTop(): void {
      stickToBottom.value = isAtBottom();
    }

    function getScrollMetrics(top = currentScrollTop()): TLogViewScrollMetrics {
      return {
        scrollTop: top,
        maxScrollTop: maxScrollTop(),
        viewportRows: viewportHeight(),
        lineCount: lineCount(),
        firstLineIndex: firstLineIndex(),
        estimatedVisualRowCount: estimatedVisualRowCount(),
        visualRowCount: visualRowCount(),
        measuredVisualRowCount: measuredVisualRowCount(),
        measuredLineCount,
        visualIndexStatus,
        atTop: top <= 0,
        atBottom: isAtBottom(top),
      };
    }

    function scrollPayload(top = currentScrollTop()): TLogViewScrollPayload {
      const metrics = getScrollMetrics(top);
      return {
        scrollTop: top,
        atBottom: metrics.atBottom,
        lineCount: metrics.lineCount,
        estimatedVisualRowCount: metrics.estimatedVisualRowCount,
        visualRowCount: metrics.visualRowCount,
        measuredVisualRowCount: metrics.measuredVisualRowCount,
        measuredLineCount: metrics.measuredLineCount,
        visualIndexStatus: metrics.visualIndexStatus,
        firstLineIndex: metrics.firstLineIndex,
      };
    }

    function emitScroll(top = currentScrollTop()): void {
      emit("scroll", scrollPayload(top));
    }

    function recordVisibleLinks(
      y: number,
      segments: readonly TLogVisualSegment[],
      lineIndex: number,
      visibleStartCell: number,
    ): void {
      visibleLinksByRow.delete(y);
      if (!visualLinksEnabled()) return;

      const rowLinks: TLogVisibleLinkSegment[] = [];
      let x = normalizedRect().x;
      let cell = visibleStartCell;
      for (const seg of segments) {
        const href = seg.style.href;
        if (href) {
          const previous = rowLinks[rowLinks.length - 1];
          if (
            previous?.href === href &&
            previous.endX === x &&
            previous.endCell === cell &&
            previous.index === lineIndex
          ) {
            rowLinks[rowLinks.length - 1] = {
              ...previous,
              endX: x + seg.cells,
              text: previous.text + seg.text,
              endCell: cell + seg.cells,
            };
          } else {
            rowLinks.push({
              startX: x,
              endX: x + seg.cells,
              href,
              text: seg.text,
              index: lineIndex,
              absoluteLineIndex: firstLineIndex() + lineIndex,
              startCell: cell,
              endCell: cell + seg.cells,
            });
          }
        }
        x += seg.cells;
        cell += seg.cells;
      }

      if (rowLinks.length) visibleLinksByRow.set(y, rowLinks);
    }

    function getVisibleLinks(): readonly TLogViewVisibleLink[] {
      const rows = Array.from(visibleLinksByRow.keys()).sort((a, b) => a - b);
      const out: TLogViewVisibleLink[] = [];
      for (const y of rows) {
        const rowLinks = (visibleLinksByRow.get(y) ?? [])
          .slice()
          .sort((a, b) => a.startX - b.startX);
        for (const link of rowLinks) {
          const focused = focusedLinkMatches(link);
          out.push({
            visibleIndex: out.length,
            href: link.href,
            text: link.text,
            absoluteLineIndex: link.absoluteLineIndex,
            index: link.index,
            startCell: link.startCell,
            endCell: link.endCell,
            startX: link.startX,
            endX: link.endX,
            y,
            ...(focused ? { focused: true } : {}),
          });
        }
      }
      return out;
    }

    function focusedLinkMatches(
      link: Pick<
        TLogViewVisibleLink,
        "href" | "absoluteLineIndex" | "index" | "startCell" | "endCell"
      >,
    ): boolean {
      return (
        focusedLinkTarget?.href === link.href &&
        focusedLinkTarget.absoluteLineIndex === link.absoluteLineIndex &&
        focusedLinkTarget.index === link.index &&
        focusedLinkTarget.startCell === link.startCell &&
        focusedLinkTarget.endCell === link.endCell
      );
    }

    function emitLinkFocusPayload(
      link: TLogViewVisibleLink | null,
      focusedLinkIndex: number,
    ): void {
      emit("linkFocus", {
        link,
        focusedLinkIndex,
      } satisfies TLogViewLinkFocusPayload);
    }

    function setFocusedLink(link: TLogViewVisibleLink, emitEvent = true): void {
      focusedVisibleLinkIndex.value = link.visibleIndex;
      focusedLinkTarget = {
        href: link.href,
        text: link.text,
        absoluteLineIndex: link.absoluteLineIndex,
        index: link.index,
        startCell: link.startCell,
        endCell: link.endCell,
        startX: link.startX,
        endX: link.endX,
      };
      if (emitEvent) emitLinkFocusPayload(link, link.visibleIndex);
    }

    function focusVisibleLink(visibleIndex: number): boolean {
      const links = getVisibleLinks();
      const index = Math.floor(Number(visibleIndex));
      if (!Number.isFinite(index) || index < 0 || index >= links.length) return false;
      const link = links[index]!;
      setFocusedLink(link);
      markViewportDirty();
      invalidateSelf("normal", "data");
      return true;
    }

    function focusNextLink(): boolean {
      const links = getVisibleLinks();
      if (!links.length) return false;
      const next =
        focusedVisibleLinkIndex.value < 0 ? 0 : (focusedVisibleLinkIndex.value + 1) % links.length;
      return focusVisibleLink(next);
    }

    function focusPreviousLink(): boolean {
      const links = getVisibleLinks();
      if (!links.length) return false;
      const previous =
        focusedVisibleLinkIndex.value < 0
          ? links.length - 1
          : (focusedVisibleLinkIndex.value - 1 + links.length) % links.length;
      return focusVisibleLink(previous);
    }

    function clearLinkFocus(emitEvent = true): void {
      if (focusedVisibleLinkIndex.value < 0 && !focusedLinkTarget) return;
      focusedVisibleLinkIndex.value = -1;
      focusedLinkTarget = null;
      if (emitEvent) emitLinkFocusPayload(null, -1);
      markViewportDirty();
      invalidateSelf("normal", "data");
    }

    function activateFocusedLink(source: "keyboard" | "programmatic" = "programmatic"): boolean {
      const links = getVisibleLinks();
      const link = links[focusedVisibleLinkIndex.value];
      if (!link) return false;
      emit("linkActivate", {
        link,
        source,
      } satisfies TLogViewLinkActivatePayload);
      return true;
    }

    function syncFocusedVisibleLinkFromViewport(): void {
      if (!focusedLinkTarget) {
        focusedVisibleLinkIndex.value = -1;
        return;
      }
      const links = getVisibleLinks();
      const index = links.findIndex((link) => focusedLinkMatches(link));
      if (index >= 0) {
        focusedVisibleLinkIndex.value = index;
        focusedLinkTarget = {
          href: links[index]!.href,
          text: links[index]!.text,
          absoluteLineIndex: links[index]!.absoluteLineIndex,
          index: links[index]!.index,
          startCell: links[index]!.startCell,
          endCell: links[index]!.endCell,
          startX: links[index]!.startX,
          endX: links[index]!.endX,
        };
        return;
      }
      clearLinkFocus();
    }

    function emitLinkClick(e: TerminalPointerEvent): void {
      const link = visibleLinksByRow
        .get(e.cellY)
        ?.find((candidate) => e.cellX >= candidate.startX && e.cellX < candidate.endX);
      if (!link) return;

      e.preventDefault?.();
      emit("linkClick", {
        href: link.href,
        text: link.text,
        absoluteLineIndex: link.absoluteLineIndex,
        index: link.index,
        startCell: link.startCell,
        endCell: link.endCell,
        cellX: e.cellX,
        cellY: e.cellY,
      } satisfies TLogViewLinkClickPayload);
    }

    function invalidateSelf(
      priority: "low" | "normal" | "high" = "normal",
      reason?: FramePerfReason,
    ): void {
      scheduler.invalidate({ priority, plane: plane.value, reason });
    }

    const wheelMailbox = createFrameMailbox<number>({
      scheduler,
      id: `${frameTaskId}:wheel`,
      reason: "scroll",
      priority: "high",
      sync: true,
      apply(nextTop, ctx) {
        pendingWheelTop = null;
        if (!alive || !hasPaintableViewport()) {
          resetWheelScrollState(wheelState);
          return;
        }
        const changed = applyScrollTop(nextTop, "auto", { emitScroll: true });
        if (!changed) {
          resetWheelScrollState(wheelState);
          return;
        }
        selection.refresh();
        ctx.invalidate({ priority: "high", plane: plane.value, reason: "scroll" });
      },
    });

    function cancelWheelScrollFrame(): void {
      pendingWheelTop = null;
      wheelMailbox.cancel();
      resetWheelScrollState(wheelState);
    }

    function shiftVisibleLinksForScrollRegion(y0: number, y1: number, delta: number): void {
      if (!visibleLinksByRow.size || delta === 0) return;

      const h = y1 - y0;
      if (h <= 0) return;
      if (Math.abs(delta) >= h) {
        for (let y = y0; y < y1; y++) visibleLinksByRow.delete(y);
        return;
      }

      const next = new Map<number, TLogVisibleLinkSegment[]>();
      for (const [y, links] of visibleLinksByRow) {
        if (y < y0 || y >= y1) next.set(y, links);
      }

      if (delta > 0) {
        for (let y = y0; y < y1 - delta; y++) {
          const links = visibleLinksByRow.get(y + delta);
          if (links?.length) next.set(y, links);
        }
      } else {
        const n = -delta;
        for (let y = y0 + n; y < y1; y++) {
          const links = visibleLinksByRow.get(y + delta);
          if (links?.length) next.set(y, links);
        }
      }

      visibleLinksByRow.clear();
      for (const [y, links] of next) visibleLinksByRow.set(y, links);
    }

    function viewportRows(): number[] {
      const r = normalizedRect();
      const rows: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) rows.push(y);
      return rows;
    }

    function unionDirtyRows(nextRows: readonly number[]): readonly number[] {
      if (!dirtyRowsHint?.length) return nextRows.slice().sort((a, b) => a - b);
      const rows = new Set(dirtyRowsHint);
      for (const y of nextRows) rows.add(y);
      return Array.from(rows).sort((a, b) => a - b);
    }

    function markRowsDirty(nextRows: readonly number[]): boolean {
      if (!hasPaintableViewport()) return false;
      dirtyRowsHint = unionDirtyRows(nextRows);
      if (!renderNodeId) return false;
      if (render.markDirtyRows(renderNodeId, dirtyRowsHint)) return true;
      dirtyRowsHint = undefined;
      return false;
    }

    function markViewportDirty(): boolean {
      return markRowsDirty(viewportRows());
    }

    type TailVisualSnapshot = Readonly<{
      start: number;
      rows: number;
    }>;

    function visualRangeDirtyRows(start: number, end: number): readonly number[] {
      if (end <= start) return [];
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const visibleStart = currentScrollTop() + clipY;
      const rows: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) {
        const visualRow = visibleStart + (y - r.y);
        if (visualRow >= start && visualRow < end) rows.push(y);
      }
      return rows;
    }

    function tailVisualSnapshot(index: number): TailVisualSnapshot {
      if (!props.wrap) return { start: index, rows: 1 };
      ensureVisualIndex();
      return {
        start: visualStartForLine(index),
        rows: Math.max(1, visualCounts[index] ?? 1),
      };
    }

    function tailMutationDirtyRows(
      index: number,
      previous: TailVisualSnapshot | null,
    ): readonly number[] {
      if (index < 0) return [];
      const next = tailVisualSnapshot(index);
      const prev = previous ?? next;
      const start = Math.min(prev.start, next.start);
      const end = Math.max(prev.start + prev.rows, next.start + next.rows);
      return visualRangeDirtyRows(start, end);
    }

    function applyLinkFocusToSegments(
      segments: readonly TLogVisualSegment[],
      lineIndex: number,
      visibleStartCell: number,
    ): readonly TLogVisualSegment[] {
      const target = focusedLinkTarget;
      if (!target) return segments;
      if (target.absoluteLineIndex !== firstLineIndex() + lineIndex) return segments;
      if (target.index !== lineIndex) return segments;
      if (target.endCell <= visibleStartCell) return segments;

      const visibleEndCell = visibleStartCell + segments.reduce((sum, seg) => sum + seg.cells, 0);
      if (target.startCell >= visibleEndCell) return segments;

      const out: TLogVisualSegment[] = [];
      let cursor = visibleStartCell;
      for (const seg of segments) {
        let localStart = 0;
        while (localStart < seg.cells) {
          const absoluteCell = cursor + localStart;
          let nextLocalEnd = seg.cells;
          const withinFocus =
            seg.style.href === target.href &&
            absoluteCell >= target.startCell &&
            absoluteCell < target.endCell;
          if (!withinFocus && target.startCell > absoluteCell) {
            nextLocalEnd = Math.min(nextLocalEnd, target.startCell - cursor);
          } else if (withinFocus) {
            nextLocalEnd = Math.min(nextLocalEnd, target.endCell - cursor);
          }

          nextLocalEnd = clamp(nextLocalEnd, localStart + 1, seg.cells);
          const text = sliceByCellsRange(seg.text, localStart, nextLocalEnd);
          const cells = textCellWidth(text);
          if (text && cells > 0) {
            out.push({
              text,
              cells,
              style: withinFocus
                ? mergeLinkOverlayStyle(seg.style, props.linkFocusStyle)
                : seg.style,
            });
          }
          localStart = nextLocalEnd;
        }
        cursor += seg.cells;
      }
      return out;
    }

    function tailMutationDirtyRow(
      prevCount: number,
      nextCount: number,
      delta: number,
      r: Rect,
    ): number | null {
      if (props.wrap) return null;
      if (delta <= 0 || delta >= r.h) return null;
      if (prevCount <= 0 || nextCount <= prevCount) return null;
      if (lastPaintedBottom?.index !== prevCount - 1) return null;
      if (lineKey(prevCount - 1) === lastPaintedBottom.lineKey) return null;
      return r.y + r.h - delta - 1;
    }

    function applyScrollTop(
      nextTop: number,
      strategy: ScrollStrategy = "auto",
      options?: Readonly<{
        emitScroll?: boolean;
        emitUpdate?: boolean;
        stickToBottom?: boolean;
        extraDirtyRows?: readonly number[];
      }>,
    ): boolean {
      const r = normalizedRect();
      const full = normalizedFullRect();
      const h = r.h;
      if (h <= 0 || full.h <= 0) return false;
      if (options?.stickToBottom === true && props.wrap) ensureBottomMeasured();
      const prevTop = rawScrollTop();
      const clampedTop = normalizeScrollTop(nextTop);
      const delta = clampedTop - prevTop;
      if (!delta) {
        if (options?.stickToBottom != null) stickToBottom.value = options.stickToBottom;
        return false;
      }
      const uncontrolled = !isScrollControlled();
      if (uncontrolled) {
        innerScrollTop.value = clampedTop;
        stickToBottom.value = options?.stickToBottom ?? isAtBottom(clampedTop);
      }
      if (options?.emitUpdate !== false) emit("update:scrollTop", clampedTop);

      if (!uncontrolled) {
        markViewportDirty();
        if (options?.emitScroll) emitScroll(clampedTop);
        return true;
      }

      const exposedRows = !props.wrap
        ? tryUnsafeFullRowScroll({
            render,
            plane: plane.value,
            rect: r,
            terminalSize: terminal.size(),
            delta,
            rowScrollMode: props.rowScrollMode,
            rendererCapabilities: rendererCapabilities.value,
            isClipped: isClipped(),
            hasPendingDirtyRows: Boolean(dirtyRowsHint?.length),
            strategy,
          })
        : null;

      if (exposedRows) {
        shiftVisibleLinksForScrollRegion(r.y, r.y + h, delta);
        markRowsDirty(
          options?.extraDirtyRows?.length
            ? [...exposedRows, ...options.extraDirtyRows]
            : exposedRows,
        );
        if (options?.emitScroll) emitScroll(clampedTop);
        return true;
      }

      markViewportDirty();
      if (options?.emitScroll) emitScroll(clampedTop);
      return true;
    }

    function visibleLineRange(): { start: number; end: number } {
      const r = normalizedRect();
      const { y: clipY } = clipOffsets();
      const top = currentScrollTop();
      const start = top + clipY;
      return { start, end: start + r.h };
    }

    function viewportIntersectsLines(startIndex: number, endIndex: number): boolean {
      if (props.wrap) {
        if (startIndex >= endIndex) return false;
        const visible = visibleLineRange();
        const start = visualStartForLine(startIndex);
        const end =
          endIndex >= lineCount() ? estimatedVisualRowCount() : visualStartForLine(endIndex);
        return start < visible.end && end > visible.start;
      }

      const visible = visibleLineRange();
      return startIndex < visible.end && endIndex > visible.start;
    }

    function handleSourceVersionChanged(payload?: TLogDataUpdatePayload): boolean {
      const prevCount = lastLineCount;
      const nextCount = payload?.lineCount ?? lineCount();
      const prevFirst = lastFirstLineIndex;
      const nextFirst = firstLineIndex();
      const droppedHeadLines = Math.max(0, nextFirst - prevFirst);
      const droppedVisualRows = visualRowsForTrimmedHead(droppedHeadLines);
      const shouldStick = shouldStickForAppend();
      const resumeVisualMeasurement = (): void => {
        if (shouldAutoMeasureVisualIndex()) requestVisualIndexMeasurement(measuredLineCount);
        else emitVisualIndex();
      };
      const sameCountTailIndex =
        droppedHeadLines === 0 && nextCount === prevCount && nextCount > 0 ? nextCount - 1 : -1;
      const previousTailSnapshot =
        sameCountTailIndex >= 0 ? tailVisualSnapshot(sameCountTailIndex) : null;
      let wrapExistingMutation = false;

      if (props.wrap && droppedHeadLines > 0) {
        trimVisualIndexHead(droppedHeadLines, nextCount);
      } else {
        wrapExistingMutation = prepareWrapIndexForSourceChange(prevCount, nextCount);
      }

      const sameCountTailDirtyRows =
        sameCountTailIndex >= 0
          ? tailMutationDirtyRows(sameCountTailIndex, previousTailSnapshot)
          : [];

      lastLineCount = nextCount;
      lastFirstLineIndex = nextFirst;

      if (droppedHeadLines > 0 && !shouldStick) {
        const nextTop = Math.max(0, currentScrollTop() - droppedVisualRows);

        if (isScrollControlled()) {
          const clampedTop = normalizeScrollTop(nextTop);
          if (clampedTop !== rawScrollTop()) {
            emit("update:scrollTop", clampedTop);
            emitScroll(clampedTop);
            resumeVisualMeasurement();
            return false;
          }

          markViewportDirty();
          resumeVisualMeasurement();
          return true;
        }

        const changed = applyScrollTop(nextTop, "viewport-repaint", {
          emitScroll: true,
          stickToBottom: false,
        });
        if (changed) selection.refresh();
        if (!changed) markViewportDirty();
        resumeVisualMeasurement();
        return true;
      }

      if (nextCount < prevCount) {
        const nextTop = stickToBottom.value ? bottomScrollTop() : currentScrollTop();
        const changed = applyScrollTop(nextTop, "viewport-repaint", {
          emitScroll: true,
          stickToBottom: stickToBottom.value && nextTop >= maxScrollTop(),
        });
        if (changed) selection.refresh();
        if (!changed) markViewportDirty();
        resumeVisualMeasurement();
        return true;
      }

      if (shouldStick) {
        const r = normalizedRect();
        const prevTop = currentScrollTop();
        const nextTop = bottomScrollTop();
        const delta = nextTop - prevTop;
        const extraDirtyRow = tailMutationDirtyRow(prevCount, nextCount, delta, r);
        const changed = applyScrollTop(
          nextTop,
          wrapExistingMutation || droppedHeadLines > 0 ? "viewport-repaint" : "auto",
          {
            emitScroll: true,
            stickToBottom: true,
            extraDirtyRows: extraDirtyRow == null ? undefined : [extraDirtyRow],
          },
        );
        if (changed) selection.refresh();
        if (!changed) {
          if (sameCountTailDirtyRows.length) markRowsDirty(sameCountTailDirtyRows);
          else markViewportDirty();
        }
        resumeVisualMeasurement();
        return true;
      }

      if (nextCount > prevCount) {
        const changedStart = Math.max(0, prevCount - 1);
        if (viewportIntersectsLines(changedStart, nextCount)) {
          markViewportDirty();
          resumeVisualMeasurement();
          return true;
        }
      }

      if (rawScrollTop() > maxScrollTop()) {
        const changed = applyScrollTop(maxScrollTop(), "viewport-repaint", {
          emitScroll: true,
          stickToBottom: isAtBottom(),
        });
        if (changed) selection.refresh();
        if (!changed) markViewportDirty();
        resumeVisualMeasurement();
        return true;
      }

      if (
        nextCount === prevCount &&
        nextCount > 0 &&
        viewportIntersectsLines(nextCount - 1, nextCount)
      ) {
        if (sameCountTailDirtyRows.length) markRowsDirty(sameCountTailDirtyRows);
        else markViewportDirty();
        resumeVisualMeasurement();
        return true;
      }

      resumeVisualMeasurement();
      return false;
    }

    function applyDataUpdate(payload: TLogDataUpdatePayload, ctx: TerminalFrameContext): void {
      if (!alive) return;
      const invalidated = handleSourceVersionChanged(payload);
      if (!invalidated || !hasPaintableViewport()) return;
      const nextShouldStick = shouldStickForAppend();
      ctx.invalidate({
        priority: nextShouldStick ? "high" : "normal",
        plane: plane.value,
        reason: "data",
      });
    }

    const dataHighMailbox = createFrameMailbox<TLogDataUpdatePayload>({
      scheduler,
      id: `${frameTaskId}:data-high`,
      reason: "data",
      priority: "high",
      sync: true,
      apply: applyDataUpdate,
    });

    const dataNormalMailbox = createFrameMailbox<TLogDataUpdatePayload>({
      scheduler,
      id: `${frameTaskId}:data-normal`,
      reason: "data",
      priority: "normal",
      apply: applyDataUpdate,
    });

    function requestDataFrame(): void {
      const payload = { version: props.version, lineCount: lineCount() };
      if (shouldStickForAppend()) {
        dataNormalMailbox.cancel();
        if (!dataHighMailbox.queue(payload)) return;
        return;
      }
      if (dataHighMailbox.hasPending()) {
        if (!dataHighMailbox.queue(payload)) return;
        return;
      }
      if (!dataNormalMailbox.queue(payload)) return;
    }

    function requestWheelScroll(nextTop: number): boolean {
      pendingWheelTop = nextTop;
      try {
        if (wheelMailbox.queue(nextTop)) return true;
      } catch (error) {
        pendingWheelTop = null;
        resetWheelScrollState(wheelState);
        throw error;
      }
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      return false;
    }

    function replacePendingWheelTop(nextTop: number): boolean {
      pendingWheelTop = nextTop;
      if (wheelMailbox.replacePending(nextTop)) return true;
      pendingWheelTop = null;
      resetWheelScrollState(wheelState);
      return false;
    }

    function keyboardScroll(nextTop: number, nextStick?: boolean): void {
      cancelWheelScrollFrame();
      const changed = applyScrollTop(nextTop, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: nextStick,
      });
      if (!changed && nextStick != null) stickToBottom.value = nextStick;
      if (changed) {
        selection.refresh();
        invalidateSelf("high", "input");
      }
    }

    function scrollToBottom(): void {
      cancelWheelScrollFrame();
      const changed = applyScrollTop(bottomScrollTop(), "viewport-repaint", {
        emitScroll: true,
        stickToBottom: true,
      });
      if (changed) {
        selection.refresh();
        invalidateSelf("high", "scroll");
      }
    }

    function scrollToTop(): void {
      cancelWheelScrollFrame();
      const changed = applyScrollTop(0, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: false,
      });
      if (changed) {
        selection.refresh();
        invalidateSelf("high", "scroll");
      }
    }

    function scrollToVisualRow(row: number): void {
      cancelWheelScrollFrame();
      const target = normalizeScrollNumber(row);
      const changed = applyScrollTop(target, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: target >= maxScrollTop(),
      });
      if (changed) {
        selection.refresh();
        invalidateSelf("high", "scroll");
      }
    }

    function scrollBy(delta: number): void {
      const n = Math.trunc(Number(delta));
      scrollToVisualRow(currentScrollTop() + (Number.isFinite(n) ? n : 0));
    }

    function scrollSelectionBy(delta: number): boolean {
      const n = Math.trunc(Number(delta));
      if (!Number.isFinite(n) || n === 0) return false;
      cancelWheelScrollFrame();

      if (isScrollControlled()) {
        const target = currentScrollTop() + n;
        const clampedTop = normalizeScrollTop(target);
        if (clampedTop === currentScrollTop()) return false;

        // Do not spam update:scrollTop while waiting for parent-controlled prop.
        if (pendingSelectionScrollFocusRemap) return false;

        pendingSelectionScrollFocusRemap = true;
        emit("update:scrollTop", clampedTop);
        emit("scroll", scrollPayload(clampedTop));
        invalidateSelf("high", "scroll");
        return true;
      }

      const target = currentScrollTop() + n;
      const changed = applyScrollTop(target, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: target >= maxScrollTop(),
      });
      if (!changed) return false;

      selection.refresh({ remapFocus: true });
      invalidateSelf("high", "scroll");
      return true;
    }

    function selectionPointForCell(point: TerminalSelectionPoint): TerminalSelectionPoint | null {
      const r = normalizedRect();
      if (point.x < r.x || point.y < r.y || point.x >= r.x + r.w || point.y >= r.y + r.h) {
        return null;
      }
      const { x: clipX, y: clipY } = clipOffsets();
      const visualY = currentScrollTop() + clipY + (point.y - r.y);
      if (visualY < 0 || visualY >= estimatedVisualRowCount()) return null;
      return {
        x: clamp(clipX + (point.x - r.x), 0, Math.max(0, currentWrapWidth() - 1)),
        y: visualY,
      };
    }

    function canHandleSelectionRange(range: TerminalSelectionRange): boolean {
      return Boolean(selectionPointForCell(range.anchor) && selectionPointForCell(range.focus));
    }

    function textForVisualRow(visualRow: number): string {
      const count = lineCount();
      if (!props.wrap) {
        if (visualRow < 0 || visualRow >= count) return "";
        if (!props.ansi) return sanitizeInlineText(props.source.getLine(visualRow));
        const base = props.style ?? defaultStyle.value;
        return ansiSegmentsForLine(visualRow, count, base, styleCacheKey(base))
          .map((segment) => segment.text)
          .join("");
      }

      const located = locateVisualRow(visualRow);
      if (!located) return "";
      if (!props.ansi) {
        return (
          wrappedRowsForLine(located.lineIndex, count, currentWrapWidth())[located.partIndex] ?? ""
        );
      }

      const base = props.style ?? defaultStyle.value;
      const rows = ansiWrappedRowsForLine(
        located.lineIndex,
        count,
        currentWrapWidth(),
        base,
        styleCacheKey(base),
      );
      return (rows[located.partIndex] ?? []).map((segment) => segment.text).join("");
    }

    function textForSelectionRange(range: TerminalSelectionRange): string {
      const cols = currentWrapWidth();
      const rows = estimatedVisualRowCount();
      return terminalSelectionRowSpans(range, cols, rows)
        .map((span) => {
          const text = sliceByCellsRange(textForVisualRow(span.y), span.x0, span.x1);
          return span.x1 >= cols ? text.trimEnd() : text;
        })
        .join("\n");
    }

    function visibleSpansForSelectionRange(
      providerRange: TerminalSelectionRange,
      _screenRange: TerminalSelectionRange,
    ): readonly SelectedRowSpan[] {
      const r = normalizedRect();
      const { x: clipX, y: clipY } = clipOffsets();
      const cols = currentWrapWidth();
      const totalRows = Math.max(
        estimatedVisualRowCount(),
        providerRange.anchor.y + 1,
        providerRange.focus.y + 1,
      );

      const top = currentScrollTop() + clipY;
      const bottom = top + r.h;

      const providerSpans = terminalSelectionVisibleRowSpans(
        providerRange,
        cols,
        totalRows,
        top,
        bottom,
      );

      const result: SelectedRowSpan[] = [];
      for (const span of providerSpans) {
        const screenY = r.y + (span.y - top);
        const screenX0 = r.x + span.x0 - clipX;
        const screenX1 = r.x + span.x1 - clipX;

        const x0 = Math.max(r.x, screenX0);
        const x1 = Math.min(r.x + r.w, screenX1);
        if (screenY >= r.y && screenY < r.y + r.h && x1 > x0) {
          result.push({ y: screenY, x0, x1 });
        }
      }
      return result;
    }

    function scrollToLine(
      index: number,
      options?: Readonly<{
        align?: "start" | "center" | "end";
      }>,
    ): void {
      const count = lineCount();
      if (count <= 0) return;

      const lineIndex = clamp(normalizeScrollNumber(index), 0, count - 1);
      let target = lineIndex;
      let visualCount = 1;

      if (props.wrap) {
        ensureVisualIndex();
        measureVisualLine(lineIndex);
        target = visualStartForLine(lineIndex);
        visualCount = visualCounts[lineIndex] ?? 1;
      }

      const h = viewportHeight();
      if (options?.align === "center") {
        target -= Math.floor((h - visualCount) / 2);
      } else if (options?.align === "end") {
        target += visualCount - h;
      }

      scrollToVisualRow(target);
    }

    function repaintInvalidatedViewport(): void {
      const nextTop = stickToBottom.value ? bottomScrollTop() : currentScrollTop();
      const changed = applyScrollTop(nextTop, "viewport-repaint", {
        emitScroll: true,
        stickToBottom: stickToBottom.value && nextTop >= maxScrollTop(),
      });
      if (changed) selection.refresh();
      if (!changed) markViewportDirty();
      invalidateSelf("normal", "data");
    }

    function refreshViewport(): void {
      clearLineCaches();
      lastPaintedBottom = null;
      resetVisualIndex(lineCount(), currentWrapWidth());
      lastLineCount = lineCount();
      lastFirstLineIndex = firstLineIndex();
      if (props.wrap && props.visualIndexMode === "exact") requestVisualIndexMeasurement(0);
      requestSearchScan();
      repaintInvalidatedViewport();
    }

    function invalidateRange(start: number, end: number): void {
      const count = lineCount();
      const rawStart = Math.floor(Number(start));
      const rawEnd = Math.ceil(Number(end));
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return;

      const safeStart = clamp(rawStart, 0, count);
      const safeEnd = clamp(rawEnd, 0, count);
      if (safeEnd <= safeStart) return;

      clearLineCaches();
      lastPaintedBottom = null;
      if (props.wrap) {
        ensureVisualIndex();
        for (let index = safeStart; index < safeEnd; index++) visualKeys[index] = undefined;
        for (let index = safeStart; index < safeEnd; index++) measureVisualLine(index);
        syncVisualIndexStatus();
      } else {
        syncNonWrappedVisualIndexState();
      }
      emitVisualIndex();
      requestSearchScan();
      repaintInvalidatedViewport();
    }

    function invalidateLine(index: number): void {
      const lineIndex = Math.floor(Number(index));
      if (!Number.isFinite(lineIndex)) return;
      invalidateRange(lineIndex, lineIndex + 1);
    }

    function visualRowForMatch(match: TLogViewSearchMatch): number {
      if (!props.wrap) return match.index;
      ensureVisualIndex();
      measureVisualLine(match.index);
      const lineStart = visualStartForLine(match.index);
      const count = lineCount();
      const width = currentWrapWidth();
      if (props.ansi) {
        const base = props.style ?? defaultStyle.value;
        const rows = ansiWrappedRowsForLine(match.index, count, width, base, styleCacheKey(base));
        return lineStart + partIndexForCellInAnsiWrappedRow(rows, match.startCell);
      }

      const rows = wrappedRowsForLine(match.index, count, width);
      return lineStart + partIndexForCellInPlainWrappedRow(rows, match.startCell);
    }

    function firstMatchAtOrAfterViewport(): number {
      if (!searchMatches.length) return -1;
      if (!props.wrap) {
        const firstVisibleLine = visibleLineRange().start;
        const index = searchMatches.findIndex((match) => match.index >= firstVisibleLine);
        return index >= 0 ? index : 0;
      }

      const located = locateVisualRow(visibleLineRange().start);
      const firstVisibleLine = located?.lineIndex ?? 0;
      const index = searchMatches.findIndex((match) => match.index >= firstVisibleLine);
      return index >= 0 ? index : 0;
    }

    function lastMatchAtOrBeforeViewport(): number {
      if (!searchMatches.length) return -1;
      if (!props.wrap) {
        const lastVisibleLine = Math.max(0, visibleLineRange().end - 1);
        for (let i = searchMatches.length - 1; i >= 0; i--) {
          if (searchMatches[i]!.index <= lastVisibleLine) return i;
        }
        return searchMatches.length - 1;
      }

      const located = locateVisualRow(Math.max(0, visibleLineRange().end - 1));
      const lastVisibleLine = located?.lineIndex ?? lineCount() - 1;
      for (let i = searchMatches.length - 1; i >= 0; i--) {
        if (searchMatches[i]!.index <= lastVisibleLine) return i;
      }
      return searchMatches.length - 1;
    }

    function scrollToMatch(
      match: TLogViewSearchMatch,
      align: "start" | "center" | "end" = "center",
    ): void {
      if (!props.wrap) {
        scrollToLine(match.index, { align });
        return;
      }

      const row = visualRowForMatch(match);
      const height = viewportHeight();
      let target = row;
      if (align === "center") target = row - Math.floor(height / 2);
      else if (align === "end") target = row - height + 1;
      scrollToVisualRow(target);
    }

    function setCurrentMatch(index: number, options?: TLogViewSelectSearchMatchOptions): boolean {
      if (index < 0 || index >= searchMatches.length) return false;
      currentMatchIndex = index;
      emitSearchMatch();
      invalidateSearchMarkers();
      emitSearchMarkers(true);
      if (options?.scroll !== false) {
        scrollToMatch(searchMatches[index]!, options?.align ?? "center");
      }
      markViewportDirty();
      invalidateSelf("high", "data");
      return true;
    }

    function normalizeSearchMatchIndex(matchIndex: number): number | null {
      const index = Math.floor(Number(matchIndex));
      return Number.isFinite(index) ? index : null;
    }

    function selectSearchMatch(
      matchIndex: number,
      options?: TLogViewSelectSearchMatchOptions,
    ): boolean {
      const index = normalizeSearchMatchIndex(matchIndex);
      if (index == null) return false;
      return setCurrentMatch(index, options);
    }

    function getSearchMatch(matchIndex: number): TLogViewSearchMatch | null {
      const index = normalizeSearchMatchIndex(matchIndex);
      if (index == null) return null;
      const match = searchMatches[index];
      return match ? copySearchMatch(match) : null;
    }

    function getSearchResults(
      options?: TLogViewSearchResultsOptions,
    ): readonly TLogViewSearchResult[] {
      const rawOffset = Number(options?.offset ?? 0);
      const rawLimit = Number(options?.limit ?? searchMatches.length);
      const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
      const limit = Number.isFinite(rawLimit)
        ? Math.max(0, Math.floor(rawLimit))
        : searchMatches.length;
      const includePreview = options?.includePreview === true;

      if (!includePreview) {
        return searchMatches.slice(offset, offset + limit).map((match, index) => ({
          matchIndex: offset + index,
          match: copySearchMatch(match),
        }));
      }

      const count = lineCount();
      const base = props.style ?? defaultStyle.value;
      const baseStyleKey = styleCacheKey(base);
      const previewWidth = normalizeSearchResultPreviewWidth(options?.previewWidth);
      const contextCells = normalizeSearchResultContextCells(options?.contextCells);

      return searchMatches.slice(offset, offset + limit).map((match, index) => ({
        matchIndex: offset + index,
        match: copySearchMatch(match),
        preview: previewForMatch(match, count, base, baseStyleKey, {
          previewWidth,
          contextCells,
        }),
      }));
    }

    function findNext(): void {
      if (!searchMatches.length) return;
      const next =
        currentMatchIndex < 0
          ? firstMatchAtOrAfterViewport()
          : (currentMatchIndex + 1) % searchMatches.length;
      selectSearchMatch(next);
    }

    function findPrevious(): void {
      if (!searchMatches.length) return;
      const previous =
        currentMatchIndex < 0
          ? lastMatchAtOrBeforeViewport()
          : (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
      selectSearchMatch(previous);
    }

    function clearSearch(): void {
      emit("update:searchQuery", "");
      if (normalizedSearchQuery()) return;

      searchGeneration++;
      searchCursor = 0;
      compiledSearch = compileSearch("");
      searchStatus = "idle";
      searchError = null;
      clearSearchMatches();
      emitSearch("");
      emitSearchMatch();
      emitSearchMarkers(true);
      markViewportDirty();
      invalidateSelf("normal", "data");
    }

    function getSearchState(): TLogViewSearchState {
      return {
        query: normalizedSearchQuery(),
        status: searchStatus,
        matchCount: searchMatches.length,
        currentMatchIndex,
        error: searchError,
      };
    }

    function measureVisualIndex(): void {
      requestVisualIndexMeasurement(0);
    }

    const handle: TLogViewHandle = {
      scrollToBottom,
      scrollToTop,
      scrollToVisualRow,
      scrollBy,
      scrollToLine,
      refreshViewport,
      invalidateLine,
      invalidateRange,
      findNext,
      findPrevious,
      clearSearch,
      getSearchState,
      selectSearchMatch,
      getSearchMatch,
      getSearchResults,
      measureVisualIndex,
      getScrollMetrics,
      getSearchMarkers,
      getVisibleLinks,
      focusVisibleLink,
      focusNextLink,
      focusPreviousLink,
      clearLinkFocus: () => clearLinkFocus(),
      activateFocusedLink: () => activateFocusedLink("programmatic"),
    };
    expose(handle);

    function onKeydown(e: TerminalKeyboardEvent): void {
      emit("keydown", e);
      if (props.keyboardLinks && e.key === "Tab") {
        const handled = e.shiftKey ? focusPreviousLink() : focusNextLink();
        if (handled) e.preventDefault();
        if (handled) return;
      }
      if (props.keyboardLinks && e.key === "Enter" && focusedVisibleLinkIndex.value >= 0) {
        e.preventDefault();
        activateFocusedLink("keyboard");
        return;
      }
      if (props.keyboardLinks && e.key === "Escape" && focusedVisibleLinkIndex.value >= 0) {
        e.preventDefault();
        clearLinkFocus();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardScroll(currentScrollTop() - 1, false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardScroll(currentScrollTop() + 1);
        return;
      }
      if (e.key === "PageUp") {
        e.preventDefault();
        keyboardScroll(currentScrollTop() - viewportHeight(), false);
        return;
      }
      if (e.key === "PageDown") {
        e.preventDefault();
        keyboardScroll(currentScrollTop() + viewportHeight());
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        keyboardScroll(0, false);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        keyboardScroll(bottomScrollTop(), true);
      }
    }

    const selectionTextProvider: SelectionTextProvider = {
      id: `${frameTaskId}:selection-text`,
      get rect() {
        return normalizedRect();
      },
      canHandle: canHandleSelectionRange,
      pointForCell: selectionPointForCell,
      getText: textForSelectionRange,
      getVisibleSpans: visibleSpansForSelectionRange,
    };
    const unregisterSelectionTextProvider = selection.registerTextProvider(selectionTextProvider);
    onBeforeUnmount(unregisterSelectionTextProvider);

    const eventNode = useTerminalNode(() => ({
      rect: normalizedRect(),
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      selectable: props.selectable,
      selectionScrollBy: scrollSelectionBy,
      handlers: {
        wheel: (e: any) => {
          const { deltaY, mode } = getWheelScrollInput(e);
          if (!deltaY) return;
          const maxTop = maxScrollTop();
          const baseTop = pendingWheelTop ?? currentScrollTop();
          const now =
            typeof e.time === "number"
              ? e.time
              : typeof e.timeStamp === "number"
                ? e.timeStamp
                : Date.now();
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            deltaY,
            baseTop,
            maxTop,
            now,
            mode,
            {
              disableAcceleration: mode === "pixel",
            },
          );
          if (!dir || nextTop === baseTop) return;

          if (!requestWheelScroll(nextTop)) return;
          e.preventDefault?.();
        },
        focus: () => {
          focused.value = true;
          emit("focus");
          invalidateSelf();
        },
        blur: () => {
          focused.value = false;
          emit("blur");
          invalidateSelf();
        },
        click: emitLinkClick,
        keydown: onKeydown,
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus) return;
      if (!visible.value) return;
      const manager = events.value;
      const nodeId = eventNode.id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    watch(
      [
        () => visible.value,
        () => absRect.value.x,
        () => absRect.value.y,
        () => absRect.value.w,
        () => absRect.value.h,
        () => fullRect.value.w,
        () => fullRect.value.h,
      ],
      () => {
        if (pendingWheelTop === null) return;
        if (!hasPaintableViewport()) {
          cancelWheelScrollFrame();
          return;
        }
        const nextPendingTop = normalizeScrollTop(pendingWheelTop);
        if (nextPendingTop === currentScrollTop()) {
          cancelWheelScrollFrame();
        } else if (nextPendingTop !== pendingWheelTop) {
          replacePendingWheelTop(nextPendingTop);
        }
      },
    );

    watch(
      () => props.version,
      () => {
        resetWheelScrollState(wheelState);
        requestDataFrame();
        requestSearchScan();
      },
    );

    watch(
      () => [props.ansi, props.links, props.linkify],
      () => {
        if (visualLinksEnabled()) return;
        clearLinkFocus();
      },
    );

    watch(
      () => props.scrollTop,
      () => {
        cancelWheelScrollFrame();
        syncStickFromCurrentScrollTop();

        const remap = pendingSelectionScrollFocusRemap;
        pendingSelectionScrollFocusRemap = false;

        selection.refresh(remap ? { remapFocus: true } : undefined);

        markViewportDirty();
        invalidateSelf("high", "scroll");
      },
    );

    watch(
      [
        () => props.source,
        () => props.wrap,
        () => props.visualIndexMode,
        () => props.visualIndexOptions?.measureBudgetMs,
        () => props.visualIndexOptions?.maxMeasuredLines,
        () => props.ansi,
        () => props.links,
        () => props.linkify,
        () => linkifyOptionsKey.value,
        () => props.linkStyle,
        () => effectiveLinkStyle.value,
        () => fullRect.value.w,
      ],
      () => {
        dataHighMailbox.cancel();
        dataNormalMailbox.cancel();
        clearLineCaches();
        resetVisualIndex(lineCount(), currentWrapWidth());
        if (props.wrap && props.visualIndexMode === "exact") {
          requestVisualIndexMeasurement(0);
          return;
        }
        emitVisualIndex(true);
      },
      { immediate: true },
    );

    watch(
      [
        () => props.searchQuery,
        () => props.searchOptions?.mode,
        () => props.searchOptions?.caseSensitive,
        () => props.searchOptions?.wholeWord,
        () => props.searchOptions?.regexFlags,
        () => props.searchOptions?.maxMatchesPerLine,
        () => props.searchOptions?.maxMatches,
        () => props.ansi,
        () => props.links,
        () => props.source,
      ],
      () => {
        requestSearchScan();
      },
      { immediate: true },
    );

    watch(
      [() => props.highlightMatches, () => props.matchStyle, () => props.currentMatchStyle],
      () => {
        markViewportDirty();
        invalidateSelf("normal", "data");
      },
    );

    watch(
      [
        () => props.source,
        () => props.wrap,
        () => props.ansi,
        () => props.links,
        () => props.linkStyle,
        () => fullRect.value.w,
        () => fullRect.value.y,
        () => fullRect.value.h,
        () => absRect.value.y,
        () => absRect.value.h,
      ],
      () => {
        const wasInitialized = initializedScrollTop;
        initializedScrollTop = true;
        resetWheelScrollState(wheelState);
        lastLineCount = lineCount();
        lastFirstLineIndex = firstLineIndex();
        if (isScrollControlled()) {
          syncStickFromCurrentScrollTop();
          markViewportDirty();
          invalidateSelf("normal", "data");
          return;
        }

        const useDefaultScrollTop = !wasInitialized && props.defaultScrollTop != null;
        const nextTop = useDefaultScrollTop
          ? normalizeScrollTop(props.defaultScrollTop)
          : stickToBottom.value
            ? bottomScrollTop()
            : currentScrollTop();
        const nextStick = useDefaultScrollTop
          ? nextTop >= maxScrollTop()
          : stickToBottom.value && nextTop >= maxScrollTop();
        const changed = applyScrollTop(nextTop, "viewport-repaint", {
          emitUpdate: wasInitialized,
          stickToBottom: nextStick,
        });
        if (changed) selection.refresh();
        if (!changed) markViewportDirty();
        invalidateSelf("normal", "data");
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      searchGeneration++;
      visualMeasureGeneration++;
      cancelWheelScrollFrame();
      wheelMailbox.dispose();
      dataHighMailbox.dispose();
      dataNormalMailbox.dispose();
    });

    const renderNode = useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.source,
        props.wrap,
        props.ansi,
        props.links,
        props.linkify,
        linkifyOptionsKey.value,
        effectiveAnsiLinkStyle.value,
        effectiveLinkStyle.value,
        props.keyboardLinks,
        props.linkFocusStyle,
        props.highlightMatches,
        props.matchStyle,
        props.currentMatchStyle,
        focused.value,
        props.style,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        dirtyRowsHint = undefined;
        lastPaintedBottom = null;
        if (!visible.value) return;
        const r = normalizedRect();
        const full = normalizedFullRect();
        if (r.w <= 0 || r.h <= 0) return;
        const base = props.style ?? defaultStyle.value;
        const baseStyleKey = styleCacheKey(base);
        const count = lineCount();
        const top = currentScrollTop();
        const { x: clipX, y: clipY } = clipOffsets();

        const writeStyledRow = (segments: readonly TLogVisualSegment[], y: number): void => {
          let cx = r.x;
          let used = 0;
          for (const seg of segments) {
            if (!seg.text) continue;
            terminal.write(seg.text, { x: cx, y, style: seg.style });
            cx += seg.cells;
            used += seg.cells;
          }
          if (used < r.w) terminal.write(spaces(r.w - used), { x: cx, y, style: base });
        };

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          visibleLinksByRow.delete(y);
          const visualIndex = top + clipY + (y - r.y);
          if (props.wrap) {
            const located = locateVisualRow(visualIndex);
            if (!located) {
              terminal.write(spaces(r.w), { x: r.x, y, style: base });
              return;
            }

            const rawKey = lineKey(located.lineIndex);
            if (props.ansi) {
              const wrappedRows = ansiWrappedRowsForLine(
                located.lineIndex,
                count,
                full.w,
                base,
                baseStyleKey,
              );
              if (
                located.lineIndex === count - 1 &&
                located.partIndex === wrappedRows.length - 1 &&
                y === r.y + r.h - 1
              ) {
                lastPaintedBottom = { index: located.lineIndex, lineKey: rawKey };
              }
              const visualSegments = ansiClippedVisualRow(
                rawKey,
                located.partIndex,
                wrappedRows[located.partIndex] ?? [],
                full.w,
                clipX,
                r.w,
                baseStyleKey,
              );
              const visibleStartCell =
                wrappedAnsiRowStartCell(wrappedRows, located.partIndex) + clipX;
              const highlighted = applySearchHighlightsToSegments(
                visualSegments,
                located.lineIndex,
                visibleStartCell,
              );
              recordVisibleLinks(y, highlighted, located.lineIndex, visibleStartCell);
              writeStyledRow(
                applyLinkFocusToSegments(highlighted, located.lineIndex, visibleStartCell),
                y,
              );
              return;
            }

            if (linkifyEnabled()) {
              const linkifiedRows = linkifiedWrappedRowsForLine(
                located.lineIndex,
                count,
                full.w,
                base,
                baseStyleKey,
              );
              if (
                located.lineIndex === count - 1 &&
                located.partIndex === linkifiedRows.length - 1 &&
                y === r.y + r.h - 1
              ) {
                lastPaintedBottom = { index: located.lineIndex, lineKey: rawKey };
              }
              const visualSegments = clipVisualSegmentsByCells(
                linkifiedRows[located.partIndex] ?? [],
                clipX,
                clipX + r.w,
              );
              const visibleStartCell =
                wrappedAnsiRowStartCell(linkifiedRows, located.partIndex) + clipX;
              const highlighted = applySearchHighlightsToSegments(
                visualSegments,
                located.lineIndex,
                visibleStartCell,
              );
              recordVisibleLinks(y, highlighted, located.lineIndex, visibleStartCell);
              writeStyledRow(
                applyLinkFocusToSegments(highlighted, located.lineIndex, visibleStartCell),
                y,
              );
              return;
            }
            const wrappedRows = wrappedRowsForLine(located.lineIndex, count, full.w);
            if (
              located.lineIndex === count - 1 &&
              located.partIndex === wrappedRows.length - 1 &&
              y === r.y + r.h - 1
            ) {
              lastPaintedBottom = { index: located.lineIndex, lineKey: rawKey };
            }
            if (props.highlightMatches && matchesByLine.has(located.lineIndex)) {
              const rawRow = wrappedRows[located.partIndex] ?? "";
              const clipped = sliceByCellsRange(rawRow, clipX, clipX + r.w);
              writeStyledRow(
                applySearchHighlightsToSegments(
                  plainVisualSegments(clipped, base),
                  located.lineIndex,
                  wrappedPlainRowStartCell(wrappedRows, located.partIndex) + clipX,
                ),
                y,
              );
              return;
            }
            const line = renderVisualLine(
              visualLineKey(rawKey, located.partIndex),
              wrappedRows[located.partIndex] ?? "",
              full.w,
              clipX,
              r.w,
            );
            terminal.write(line, { x: r.x, y, style: base });
            return;
          }

          const idx = visualIndex;
          if (idx === count - 1 && y === r.y + r.h - 1) {
            lastPaintedBottom = { index: idx, lineKey: lineKey(idx) };
          }
          if (props.ansi) {
            const visualSegments = ansiFixedRowForLine(
              idx,
              count,
              full.w,
              clipX,
              r.w,
              base,
              baseStyleKey,
            );
            const highlighted = applySearchHighlightsToSegments(visualSegments, idx, clipX);
            recordVisibleLinks(y, highlighted, idx, clipX);
            writeStyledRow(applyLinkFocusToSegments(highlighted, idx, clipX), y);
            return;
          }
          if (props.highlightMatches && matchesByLine.has(idx)) {
            if (linkifyEnabled()) {
              const visualSegments = linkifiedFixedRowForLine(
                idx,
                count,
                base,
                baseStyleKey,
                clipX,
                r.w,
              );
              const highlighted = applySearchHighlightsToSegments(visualSegments, idx, clipX);
              recordVisibleLinks(y, highlighted, idx, clipX);
              writeStyledRow(applyLinkFocusToSegments(highlighted, idx, clipX), y);
              return;
            }
            const text = sanitizeInlineText(props.source.getLine(idx));
            const clipped = sliceByCellsRange(text, clipX, clipX + r.w);
            writeStyledRow(
              applySearchHighlightsToSegments(plainVisualSegments(clipped, base), idx, clipX),
              y,
            );
            return;
          }
          if (linkifyEnabled()) {
            const visualSegments = linkifiedFixedRowForLine(
              idx,
              count,
              base,
              baseStyleKey,
              clipX,
              r.w,
            );
            recordVisibleLinks(y, visualSegments, idx, clipX);
            writeStyledRow(applyLinkFocusToSegments(visualSegments, idx, clipX), y);
            return;
          }
          const line = renderLine(idx, count, full.w, clipX, r.w);
          terminal.write(line, { x: r.x, y, style: base });
        };

        const rows = dirtyRows;
        if (rows?.length) {
          for (const y of rows) paintRow(y);
          syncFocusedVisibleLinkFromViewport();
          trimRenderCache();
          trimWrapCache();
          trimAnsiLineCache();
          trimAnsiWrapCache();
          trimAnsiRowCache();
          trimLinkifyLineCache();
          trimLinkifyWrapCache();
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        syncFocusedVisibleLinkFromViewport();
        trimRenderCache();
        trimWrapCache();
        trimAnsiLineCache();
        trimAnsiWrapCache();
        trimAnsiRowCache();
        trimLinkifyLineCache();
        trimLinkifyWrapCache();
      },
    }));

    watchEffect(() => {
      renderNodeId = renderNode.id.value;
    });

    lastLineCount = lineCount();
    lastFirstLineIndex = firstLineIndex();

    return () => h("span", rootProps);
  },
});
