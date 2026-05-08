import type { Ref } from "vue";
import type { Rect } from "../events/index.js";
import type { ClipboardApi } from "../runtime/index.js";
import type { Cell, Style, Terminal } from "../core/types.js";
import { shallowRef } from "vue";

export type TerminalSelectionPoint = Readonly<{
  x: number;
  y: number;
}>;

export type TerminalSelectionRange = Readonly<{
  anchor: TerminalSelectionPoint;
  focus: TerminalSelectionPoint;
  mode: "linear" | "block";
}>;

export type TerminalSelectionState = Readonly<{
  active: boolean;
  anchor: TerminalSelectionPoint | null;
  focus: TerminalSelectionPoint | null;
  text: string;
}>;

export type TerminalSelectionCopyPayload = Readonly<{
  text: string;
  rows: number;
  chars: number;
  ok: boolean;
  error?: unknown;
}>;

export type TerminalSelectionOptions = Readonly<{
  autoCopy?: boolean;
  copyOnMouseUp?: boolean;
  style?: Style;
}>;

export type TerminalSelectionConfig = boolean | TerminalSelectionOptions;

export type SelectionTextProvider = Readonly<{
  id: string;
  rect: Rect;
  canHandle: (range: TerminalSelectionRange) => boolean;
  pointForCell?: (point: TerminalSelectionPoint) => TerminalSelectionPoint | null;
  getText: (range: TerminalSelectionRange) => string;
  scrollBy?: (deltaRows: number) => void;
}>;

export type TerminalSelectionController = Readonly<{
  state: Ref<TerminalSelectionState>;
  start: (point: TerminalSelectionPoint, options?: { extend?: boolean }) => void;
  update: (point: TerminalSelectionPoint) => void;
  finish: () => Promise<void>;
  clear: () => void;
  copy: () => Promise<boolean>;
  paint: (dirtyRows?: readonly number[]) => void;
}>;

type SelectionCell = Readonly<{
  x: number;
  ch: string;
  style: Style;
}>;

type SelectedRowSpan = Readonly<{
  y: number;
  x0: number;
  x1: number;
}>;

type ProviderSelectionPoint = Readonly<{
  providerId: string;
  point: TerminalSelectionPoint;
}>;

type ResolvedSelectionOptions = Readonly<{
  autoCopy: boolean;
  copyOnMouseUp: boolean;
  style: Style;
}>;

export type CreateTerminalSelectionControllerOptions = Readonly<{
  terminal: Terminal;
  overlayTerminal: Terminal;
  clipboard: ClipboardApi;
  getOptions?: () => Partial<ResolvedSelectionOptions>;
  getTextProviders?: () => readonly SelectionTextProvider[];
  onDirtyRows?: (rows: readonly number[]) => void;
  onCopy?: (payload: TerminalSelectionCopyPayload) => void;
}>;

const EMPTY_STATE: TerminalSelectionState = Object.freeze({
  active: false,
  anchor: null,
  focus: null,
  text: "",
});

function clampPoint(
  point: TerminalSelectionPoint,
  cols: number,
  rows: number,
): TerminalSelectionPoint {
  return {
    x: Math.max(0, Math.min(Math.max(0, cols - 1), Math.floor(point.x))),
    y: Math.max(0, Math.min(Math.max(0, rows - 1), Math.floor(point.y))),
  };
}

function comparePoints(a: TerminalSelectionPoint, b: TerminalSelectionPoint): number {
  return a.y - b.y || a.x - b.x;
}

function pointKey(point: TerminalSelectionPoint): string {
  return `${point.x}:${point.y}`;
}

export function terminalSelectionRowSpans(
  range: TerminalSelectionRange,
  cols: number,
  rows: number,
): SelectedRowSpan[] {
  if (cols <= 0 || rows <= 0) return [];
  const anchor = clampPoint(range.anchor, cols, rows);
  const focus = clampPoint(range.focus, cols, rows);
  if (pointKey(anchor) === pointKey(focus)) return [];

  const start = comparePoints(anchor, focus) <= 0 ? anchor : focus;
  const end = start === anchor ? focus : anchor;
  const spans: SelectedRowSpan[] = [];

  for (let y = start.y; y <= end.y; y++) {
    const x0 = y === start.y ? start.x : 0;
    const x1 = y === end.y ? end.x + 1 : cols;
    if (x1 > x0) spans.push({ y, x0, x1 });
  }

  return spans;
}

function selectedRowText(row: readonly Cell[], x0: number, x1: number, cols: number): string {
  let out = "";
  for (let x = x0; x < x1; x++) {
    const cell = row[x];
    if (!cell || cell.continuation) continue;
    out += cell.ch || " ";
  }
  return x1 >= cols ? out.trimEnd() : out;
}

function copyPayload(text: string, ok: boolean, error?: unknown): TerminalSelectionCopyPayload {
  return {
    text,
    rows: text ? text.split("\n").length : 0,
    chars: text.length,
    ok,
    ...(error === undefined ? {} : { error }),
  };
}

export function createTerminalSelectionController(
  options: CreateTerminalSelectionControllerOptions,
): TerminalSelectionController {
  const state = shallowRef<TerminalSelectionState>(EMPTY_STATE);
  let range: TerminalSelectionRange | null = null;
  let providerAnchor: ProviderSelectionPoint | null = null;
  let overlayRows = new Map<number, readonly SelectionCell[]>();
  let dirtyRows = new Set<number>();

  const readOptions = (): ResolvedSelectionOptions => ({
    autoCopy: true,
    copyOnMouseUp: true,
    style: { inverse: true },
    ...(options.getOptions?.() ?? {}),
  });

  const markDirty = (prev: ReadonlySet<number>, next: ReadonlySet<number>): void => {
    const rows = new Set<number>();
    for (const y of prev) rows.add(y);
    for (const y of next) rows.add(y);
    if (rows.size) options.onDirtyRows?.(Array.from(rows).sort((a, b) => a - b));
  };

  const providers = (): readonly SelectionTextProvider[] => options.getTextProviders?.() ?? [];

  const providerById = (id: string): SelectionTextProvider | null =>
    providers().find((provider) => provider.id === id) ?? null;

  const providerForCell = (point: TerminalSelectionPoint): SelectionTextProvider | null => {
    let best: SelectionTextProvider | null = null;
    let bestArea = Infinity;
    for (const provider of providers()) {
      const rect = provider.rect;
      if (
        point.x < rect.x ||
        point.y < rect.y ||
        point.x >= rect.x + rect.w ||
        point.y >= rect.y + rect.h
      ) {
        continue;
      }
      const area = Math.max(0, rect.w) * Math.max(0, rect.h);
      if (area < bestArea) {
        best = provider;
        bestArea = area;
      }
    }
    return best;
  };

  const providerPointForCell = (
    provider: SelectionTextProvider,
    point: TerminalSelectionPoint,
  ): ProviderSelectionPoint | null => {
    const providerPoint = provider.pointForCell?.(point) ?? point;
    return providerPoint ? { providerId: provider.id, point: providerPoint } : null;
  };

  const textFromTerminalBuffer = (nextRange: TerminalSelectionRange): string => {
    const size = options.terminal.size();
    const spans = terminalSelectionRowSpans(nextRange, size.cols, size.rows);
    const lines: string[] = [];
    for (const span of spans) {
      lines.push(selectedRowText(options.terminal.getRow(span.y), span.x0, span.x1, size.cols));
    }
    return lines.join("\n");
  };

  const selectedText = (
    nextRange: TerminalSelectionRange,
    nextProviderAnchor: ProviderSelectionPoint | null,
    nextProviderFocus: ProviderSelectionPoint | null,
  ): string => {
    if (
      nextProviderAnchor &&
      nextProviderFocus &&
      nextProviderAnchor.providerId === nextProviderFocus.providerId
    ) {
      const provider = providerById(nextProviderAnchor.providerId);
      if (provider) {
        return provider.getText({
          anchor: nextProviderAnchor.point,
          focus: nextProviderFocus.point,
          mode: nextRange.mode,
        });
      }
    }

    const provider = providers().find((candidate) => candidate.canHandle(nextRange));
    if (provider) return provider.getText(nextRange);
    return textFromTerminalBuffer(nextRange);
  };

  const rebuild = (
    nextRange: TerminalSelectionRange | null,
    nextProviderAnchor: ProviderSelectionPoint | null,
    nextProviderFocus: ProviderSelectionPoint | null,
  ): void => {
    const previousRows = dirtyRows;
    const size = options.terminal.size();
    const nextOverlayRows = new Map<number, readonly SelectionCell[]>();
    const nextDirtyRows = new Set<number>();
    let text = "";

    if (nextRange) {
      const selectionStyle = readOptions().style;
      const spans = terminalSelectionRowSpans(nextRange, size.cols, size.rows);
      for (const span of spans) {
        const row = options.terminal.getRow(span.y);
        const cells: SelectionCell[] = [];
        for (let x = span.x0; x < span.x1; x++) {
          const cell = row[x];
          if (!cell || cell.continuation) continue;
          const { href: _href, ...baseStyle } = cell.style;
          cells.push({
            x,
            ch: cell.ch || " ",
            style: { ...baseStyle, ...selectionStyle },
          });
        }
        nextOverlayRows.set(span.y, cells);
        nextDirtyRows.add(span.y);
      }
      text = selectedText(nextRange, nextProviderAnchor, nextProviderFocus);
    }

    range = nextRange;
    providerAnchor = nextProviderAnchor;
    overlayRows = nextOverlayRows;
    dirtyRows = nextDirtyRows;
    state.value = nextRange
      ? {
          active: true,
          anchor: nextRange.anchor,
          focus: nextRange.focus,
          text,
        }
      : EMPTY_STATE;
    markDirty(previousRows, nextDirtyRows);
  };

  const controller: TerminalSelectionController = {
    state,
    start(point, startOptions) {
      const size = options.terminal.size();
      const focus = clampPoint(point, size.cols, size.rows);
      const anchor =
        startOptions?.extend && range?.anchor
          ? clampPoint(range.anchor, size.cols, size.rows)
          : focus;
      const anchorProvider = providerForCell(anchor);
      const focusProvider = providerForCell(focus);
      const nextProviderAnchor =
        startOptions?.extend && providerAnchor
          ? providerAnchor
          : anchorProvider
            ? providerPointForCell(anchorProvider, anchor)
            : null;
      const nextProviderFocus =
        nextProviderAnchor && focusProvider?.id === nextProviderAnchor.providerId
          ? providerPointForCell(focusProvider, focus)
          : null;
      rebuild({ anchor, focus, mode: "linear" }, nextProviderAnchor, nextProviderFocus);
    },
    update(point) {
      if (!range) return;
      const size = options.terminal.size();
      const focus = clampPoint(point, size.cols, size.rows);
      const focusProvider = providerAnchor ? providerById(providerAnchor.providerId) : null;
      rebuild(
        {
          ...range,
          focus,
        },
        providerAnchor,
        focusProvider ? providerPointForCell(focusProvider, focus) : null,
      );
    },
    async finish() {
      if (!range) return;
      if (!state.value.text) {
        controller.clear();
        return;
      }
      const current = readOptions();
      if (current.autoCopy && current.copyOnMouseUp) await controller.copy();
    },
    clear() {
      if (!range && !dirtyRows.size) return;
      rebuild(null, null, null);
    },
    async copy() {
      const text = state.value.text;
      if (!text) return false;
      if (!options.clipboard.supported) {
        options.onCopy?.(copyPayload(text, false, new Error("Clipboard unavailable")));
        return false;
      }
      try {
        await options.clipboard.writeText(text);
        options.onCopy?.(copyPayload(text, true));
        return true;
      } catch (error) {
        options.onCopy?.(copyPayload(text, false, error));
        return false;
      }
    },
    paint(dirtyRowsHint) {
      const rows = dirtyRowsHint ?? Array.from(overlayRows.keys());
      for (const y of rows) {
        const cells = overlayRows.get(y);
        if (!cells) continue;
        for (const cell of cells) options.overlayTerminal.put(cell.x, y, cell.ch, cell.style);
      }
    },
  };

  return controller;
}
