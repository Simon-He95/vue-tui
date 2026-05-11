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
  hasRange: boolean;
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

export type SelectedRowSpan = Readonly<{
  y: number;
  x0: number;
  x1: number;
}>;

export type SelectionTextProvider = Readonly<{
  id: string;

  /**
   * Current provider viewport rect in terminal screen coordinates.
   */
  rect: Rect;

  /**
   * Receives a terminal screen-space range. Return true when this provider
   * can resolve the range without relying on the terminal buffer fallback.
   */
  canHandle: (screenRange: TerminalSelectionRange) => boolean;

  /**
   * Maps a terminal screen-space point to provider-space point.
   */
  pointForCell?: (screenPoint: TerminalSelectionPoint) => TerminalSelectionPoint | null;

  /**
   * Receives a provider-space range (i.e. after `pointForCell` mapping).
   */
  getText: (providerRange: TerminalSelectionRange) => string;
  /**
   * Return overlay highlight spans for the portion of the selection that is
   * currently visible in the viewport. Coordinates are terminal screen cells.
   *
   * When a virtual-scrolling provider scrolls during a drag-selection, the
   * selection range may span content that has already scrolled out of view.
   * The default `terminalSelectionRowSpans()` uses screen coordinates and
   * cannot account for this, so the highlight becomes stale after each scroll
   * tick. Providers that support cross-viewport selection should implement
   * this method to return only the spans that intersect the current viewport,
   * mapped back to screen cell coordinates.
   *
   * @param providerRange - The selection range in provider-space coordinates
   *   (i.e. after `pointForCell` mapping).
   * @param screenRange - The same selection range in terminal screen
   *   coordinates (before `pointForCell` mapping).
   */
  getVisibleSpans?: (
    providerRange: TerminalSelectionRange,
    screenRange: TerminalSelectionRange,
  ) => readonly SelectedRowSpan[];
}>;

export type TerminalSelectionRefreshOptions = Readonly<{
  /**
   * Re-map the current screen-space focus point through the active provider.
   * Use this for selection-driven auto-scroll after the viewport has moved.
   */
  remapFocus?: boolean;
}>;

export type TerminalSelectionController = Readonly<{
  state: Ref<TerminalSelectionState>;
  start: (point: TerminalSelectionPoint, options?: { extend?: boolean }) => void;
  update: (point: TerminalSelectionPoint) => void;
  finish: () => Promise<void>;
  clear: () => void;
  copy: () => Promise<boolean>;
  paint: (dirtyRows?: readonly number[]) => void;
  refresh: (options?: TerminalSelectionRefreshOptions) => void;
  clearProvider: (providerId: string) => void;
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
  hasRange: false,
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

function providerPointsDiffer(
  a: ProviderSelectionPoint | null,
  b: ProviderSelectionPoint | null,
): boolean {
  return Boolean(
    a && b && a.providerId === b.providerId && pointKey(a.point) !== pointKey(b.point),
  );
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

export function terminalSelectionVisibleRowSpans(
  range: TerminalSelectionRange,
  cols: number,
  rows: number,
  visibleStartY: number,
  visibleEndY: number,
): SelectedRowSpan[] {
  if (cols <= 0 || rows <= 0) return [];

  const anchor = clampPoint(range.anchor, cols, rows);
  const focus = clampPoint(range.focus, cols, rows);
  if (pointKey(anchor) === pointKey(focus)) return [];

  const start = comparePoints(anchor, focus) <= 0 ? anchor : focus;
  const end = start === anchor ? focus : anchor;

  const fromY = Math.max(start.y, Math.floor(visibleStartY), 0);
  const toY = Math.min(end.y, Math.ceil(visibleEndY) - 1, rows - 1);

  if (toY < fromY) return [];

  const spans: SelectedRowSpan[] = [];
  for (let y = fromY; y <= toY; y++) {
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

function clampPointToRect(point: TerminalSelectionPoint, rect: Rect): TerminalSelectionPoint {
  return {
    x: Math.max(rect.x, Math.min(rect.x + Math.max(0, rect.w - 1), Math.floor(point.x))),
    y: Math.max(rect.y, Math.min(rect.y + Math.max(0, rect.h - 1), Math.floor(point.y))),
  };
}

export function createTerminalSelectionController(
  options: CreateTerminalSelectionControllerOptions,
): TerminalSelectionController {
  const state = shallowRef<TerminalSelectionState>(EMPTY_STATE);
  let range: TerminalSelectionRange | null = null;
  let providerAnchor: ProviderSelectionPoint | null = null;
  let providerFocus: ProviderSelectionPoint | null = null;
  let overlaySpans = new Map<number, SelectedRowSpan[]>();
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
    options?: { clampToRect?: boolean },
  ): ProviderSelectionPoint | null => {
    const inputPoint = options?.clampToRect ? clampPointToRect(point, provider.rect) : point;
    const providerPoint = provider.pointForCell?.(inputPoint) ?? inputPoint;
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

  const providerRangeFor = (
    provider: SelectionTextProvider,
    screenRange: TerminalSelectionRange,
    anchorOverride?: ProviderSelectionPoint | null,
    focusOverride?: ProviderSelectionPoint | null,
  ): TerminalSelectionRange | null => {
    if (
      anchorOverride &&
      focusOverride &&
      anchorOverride.providerId === provider.id &&
      focusOverride.providerId === provider.id
    ) {
      return {
        anchor: anchorOverride.point,
        focus: focusOverride.point,
        mode: screenRange.mode,
      };
    }

    const anchor = providerPointForCell(provider, screenRange.anchor, { clampToRect: true });
    const focus = providerPointForCell(provider, screenRange.focus, { clampToRect: true });

    if (!anchor || !focus) return null;
    if (anchor.providerId !== provider.id || focus.providerId !== provider.id) return null;

    return {
      anchor: anchor.point,
      focus: focus.point,
      mode: screenRange.mode,
    };
  };

  const selectedText = (): string => {
    if (!range) return "";

    if (providerAnchor && providerFocus && providerAnchor.providerId === providerFocus.providerId) {
      const provider = providerById(providerAnchor.providerId);
      if (provider) {
        const providerRange = providerRangeFor(provider, range, providerAnchor, providerFocus);
        if (providerRange) return provider.getText(providerRange);
      }
    }

    const provider = providers().find((candidate) => candidate.canHandle(range));
    if (provider) {
      const providerRange = providerRangeFor(provider, range);
      if (providerRange) return provider.getText(providerRange);
    }

    return textFromTerminalBuffer(range);
  };

  const setResolvedText = (text: string): void => {
    if (!range || !state.value.active || state.value.text === text) return;
    state.value = { ...state.value, text };
  };

  const resolveProvider = (
    nextRange: TerminalSelectionRange | null,
    nextProviderAnchor: ProviderSelectionPoint | null,
  ): SelectionTextProvider | null => {
    if (!nextRange) return null;
    if (nextProviderAnchor) {
      const provider = providerById(nextProviderAnchor.providerId);
      if (provider) return provider;
    }
    return providers().find((candidate) => candidate.canHandle(nextRange)) ?? null;
  };

  const rebuild = (
    nextRange: TerminalSelectionRange | null,
    nextProviderAnchor: ProviderSelectionPoint | null,
    nextProviderFocus: ProviderSelectionPoint | null,
  ): void => {
    const previousRows = dirtyRows;
    const size = options.terminal.size();
    const nextOverlaySpans = new Map<number, SelectedRowSpan[]>();
    const nextDirtyRows = new Set<number>();
    let hasRange = false;

    if (nextRange) {
      const activeProvider = resolveProvider(nextRange, nextProviderAnchor);
      let spans: readonly SelectedRowSpan[];

      const providerRange =
        activeProvider != null
          ? providerRangeFor(activeProvider, nextRange, nextProviderAnchor, nextProviderFocus)
          : null;

      if (activeProvider?.getVisibleSpans && providerRange) {
        spans = activeProvider.getVisibleSpans(providerRange, nextRange);
      } else {
        spans = terminalSelectionRowSpans(nextRange, size.cols, size.rows);
      }

      hasRange = spans.length > 0 || providerPointsDiffer(nextProviderAnchor, nextProviderFocus);

      for (const span of spans) {
        const x0 = Math.max(0, Math.min(size.cols, Math.floor(span.x0)));
        const x1 = Math.max(0, Math.min(size.cols, Math.floor(span.x1)));
        const y = Math.floor(span.y);
        if (y < 0 || y >= size.rows || x1 <= x0) continue;

        let list = nextOverlaySpans.get(y);
        if (!list) {
          list = [];
          nextOverlaySpans.set(y, list);
        }
        list.push({ y, x0, x1 });
        nextDirtyRows.add(y);
      }
    }

    range = nextRange;
    providerAnchor = nextProviderAnchor;
    providerFocus = nextProviderFocus;
    overlaySpans = nextOverlaySpans;
    dirtyRows = nextDirtyRows;
    state.value = nextRange
      ? {
          active: true,
          anchor: nextRange.anchor,
          focus: nextRange.focus,
          text: "",
          hasRange,
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
      const activeProvider =
        startOptions?.extend && providerAnchor ? providerById(providerAnchor.providerId) : null;
      const nextProviderAnchor =
        startOptions?.extend && providerAnchor
          ? providerAnchor
          : anchorProvider
            ? providerPointForCell(anchorProvider, anchor)
            : null;
      const nextProviderFocus = activeProvider
        ? providerPointForCell(activeProvider, focus, { clampToRect: true })
        : nextProviderAnchor && focusProvider?.id === nextProviderAnchor.providerId
          ? providerPointForCell(focusProvider, focus)
          : null;
      rebuild({ anchor, focus, mode: "linear" }, nextProviderAnchor, nextProviderFocus);
    },
    update(point) {
      if (!range) return;

      const size = options.terminal.size();
      const focus = clampPoint(point, size.cols, size.rows);

      const activeProvider = providerAnchor ? providerById(providerAnchor.providerId) : null;
      const nextProviderFocus = activeProvider
        ? providerPointForCell(activeProvider, focus, { clampToRect: true })
        : null;

      rebuild(
        {
          ...range,
          focus,
        },
        providerAnchor,
        nextProviderFocus,
      );
    },
    async finish() {
      if (!range) return;
      const text = selectedText();
      if (!text) {
        controller.clear();
        return;
      }
      setResolvedText(text);
      const current = readOptions();
      if (current.autoCopy && current.copyOnMouseUp) await controller.copy();
    },
    clear() {
      if (!range && !dirtyRows.size) return;
      rebuild(null, null, null);
    },
    async copy() {
      const text = state.value.text || selectedText();
      if (!text) return false;
      setResolvedText(text);
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
      const rows = dirtyRowsHint ?? Array.from(overlaySpans.keys());
      const selectionStyle = readOptions().style;

      for (const y of rows) {
        const spans = overlaySpans.get(y);
        if (!spans?.length) continue;

        const row = options.terminal.getRow(y);

        for (const span of spans) {
          for (let x = span.x0; x < span.x1; x++) {
            const cell = row[x];
            if (!cell || cell.continuation) continue;

            const { href: _href, ...baseStyle } = cell.style;
            options.overlayTerminal.put(x, y, cell.ch || " ", {
              ...baseStyle,
              ...selectionStyle,
            });
          }
        }
      }
    },
    refresh(refreshOptions) {
      if (!range) return;

      if (refreshOptions?.remapFocus) {
        const activeProvider = providerAnchor
          ? providerById(providerAnchor.providerId)
          : resolveProvider(range, null);

        const nextProviderFocus = activeProvider
          ? providerPointForCell(activeProvider, range.focus, { clampToRect: true })
          : providerFocus;

        rebuild(range, providerAnchor, nextProviderFocus);
        return;
      }

      rebuild(range, providerAnchor, providerFocus);
    },
    clearProvider(providerId) {
      if (
        providerAnchor?.providerId === providerId ||
        providerFocus?.providerId === providerId
      ) {
        controller.clear();
      }
    },
  };

  return controller;
}
