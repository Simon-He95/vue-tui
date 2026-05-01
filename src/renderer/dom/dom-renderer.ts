import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { Cell, Style, Terminal } from "../../core/types.js";
import { ansiColorHex, ansiCssVar, installAnsiPaletteCssVars } from "../../core/ansi-palette.js";
import { TERMINAL_RENDER_PLANES } from "../../core/render-plane.js";
import { getPlaneTerminal } from "../../core/terminal/create-terminal.js";

export type CellMetrics = Readonly<{ cellWidth: number; cellHeight: number }>;

export interface DomRenderer {
  readonly container: HTMLElement;
  readonly metrics: CellMetrics;
  dispose: () => void;
  refresh: () => void;
  setPlaneOffset: (plane: TerminalRenderPlane, offsetPx: number) => void;
  setPlaneViewport: (
    plane: TerminalRenderPlane,
    viewport: Readonly<{ topPx: number; heightPx: number }> | null,
  ) => void;
}

interface PlaneLayer {
  el: HTMLElement;
  contentEl: HTMLElement;
  lines: HTMLElement[];
  offsetPx: number;
  terminal: Terminal;
  viewportTopPx: number;
  viewportHeightPx: number | null;
}

const DEFAULT_FONT_FAMILY = [
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "Monaco",
  "Consolas",
  '"Sarasa Mono SC"',
  '"Noto Sans Mono CJK SC"',
  '"Source Han Mono SC"',
  '"Liberation Mono"',
  '"Courier New"',
  "monospace",
].join(", ");
const SYNC_FLUSH_WARN_ROWS = 32;
const SYNC_FLUSH_CELL_BUDGET = 4096;

const styleKeyCache = new WeakMap<object, string>();

function styleKey(style: Style): string {
  const cached = styleKeyCache.get(style as any);
  if (cached) return cached;
  const key = [
    style.fg ?? "",
    style.bg ?? "",
    style.bold ? "1" : "0",
    style.dim ? "1" : "0",
    style.italic ? "1" : "0",
    style.underline ? "1" : "0",
    style.inverse ? "1" : "0",
  ].join("|");
  styleKeyCache.set(style as any, key);
  return key;
}

function resolveColorHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color === "transparent") return undefined;
  if (color.startsWith("#")) return color;
  return ansiColorHex(color as any);
}

function resolveColorCss(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color === "transparent") return undefined;
  if (color.startsWith("#")) return color;
  return ansiCssVar(color as any);
}

function applyStyle(span: HTMLSpanElement, style: Style): void {
  const fgHex = resolveColorHex(style.fg);
  const bgHex = resolveColorHex(style.bg);
  const fgCss = resolveColorCss(style.fg);
  const bgCss = resolveColorCss(style.bg);

  const effectiveFg = style.inverse ? bgCss : fgCss;
  const effectiveBg = style.inverse ? fgCss : bgCss;
  const effectiveFgHex = style.inverse ? bgHex : fgHex;
  const effectiveBgHex = style.inverse ? fgHex : bgHex;

  function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        const r = Number.parseInt(hex[0] + hex[0], 16);
        const g = Number.parseInt(hex[1] + hex[1], 16);
        const b = Number.parseInt(hex[2] + hex[2], 16);
        return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
      }
      if (hex.length === 6) {
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? { r, g, b } : null;
      }
    }
    const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) {
      const r = Number.parseInt(m[1]!, 10);
      const g = Number.parseInt(m[2]!, 10);
      const b = Number.parseInt(m[3]!, 10);
      return { r, g, b };
    }
    return null;
  }

  function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const srgb = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
  }

  function contrastText(bgColor: string): string {
    const rgb = parseColorToRgb(bgColor);
    if (!rgb) return "#111827";
    return luminance(rgb) > 0.6 ? "#111827" : "#e5e7eb";
  }

  if (effectiveFg) {
    span.style.color = effectiveFg;
    // JSDOM (tests) does not support CSS variables for color values; fall back to hex.
    if (!span.style.color && effectiveFgHex) span.style.color = effectiveFgHex;
  }
  if (effectiveBg) {
    span.style.backgroundColor = effectiveBg;
    if (!span.style.backgroundColor && effectiveBgHex) span.style.backgroundColor = effectiveBgHex;
  }
  if (!effectiveFg && style.inverse && effectiveBg && effectiveBgHex)
    span.style.color = contrastText(effectiveBgHex);
  if (style.bold) span.style.fontWeight = "700";
  if (style.italic) span.style.fontStyle = "italic";
  if (style.dim) span.style.opacity = "0.75";
  if (style.underline) span.style.textDecoration = "underline";
}

function measureCell(container: HTMLElement): CellMetrics {
  const probe = document.createElement("span");
  probe.textContent = "M";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  container.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return {
    cellWidth: Math.max(1, rect.width),
    cellHeight: Math.max(1, rect.height),
  };
}

function measureCharWidth(container: HTMLElement, ch: string): number {
  const probe = document.createElement("span");
  probe.textContent = ch;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  container.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return Math.max(0, rect.width);
}

interface RowSegment {
  text: string;
  cols: number;
  wide: boolean;
  style: Style;
  key: string;
}

function computeRowSegments(terminal: Terminal, y: number): RowSegment[] {
  const cells = terminal.getRow(y);
  let currentKey: string | null = null;
  let currentStyle: Style | null = null;
  let currentParts: string[] = [];
  let currentCols = 0;
  let currentWide = false;
  const spans: RowSegment[] = [];

  for (const cell of cells as Cell[]) {
    if (cell.continuation) continue;
    const ch = cell.ch || " ";
    const cols = cell.width || 1;
    const wide = cols === 2;
    const nextStyle = cell.style;
    const key: string =
      nextStyle === currentStyle && currentKey != null ? currentKey : styleKey(nextStyle);
    if (currentKey == null) {
      currentKey = key;
      currentStyle = nextStyle;
      currentParts = [ch];
      currentCols = cols;
      currentWide = wide;
      continue;
    }
    if (key === currentKey && wide === currentWide) {
      currentParts.push(ch);
      currentCols += cols;
      continue;
    }
    spans.push({
      text: currentParts.join(""),
      cols: currentCols,
      wide: currentWide,
      style: currentStyle!,
      key: currentKey,
    });
    currentKey = key;
    currentStyle = nextStyle;
    currentParts = [ch];
    currentCols = cols;
    currentWide = wide;
  }
  if (currentKey != null) {
    spans.push({
      text: currentParts.join(""),
      cols: currentCols,
      wide: currentWide,
      style: currentStyle!,
      key: currentKey,
    });
  }

  return spans;
}

// Cache for row content comparison - avoids unnecessary DOM updates
const rowCache = new WeakMap<HTMLElement, string>();

function segmentsToKey(segments: RowSegment[]): string {
  return segments.map((s) => `${s.key}:${s.text}:${s.cols}:${s.wide}`).join("|");
}

function isPlainStyle(style: Style): boolean {
  return (
    !style.fg &&
    !style.bg &&
    !style.bold &&
    !style.dim &&
    !style.italic &&
    !style.underline &&
    !style.inverse &&
    !style.href
  );
}

function isTransparentBlankRow(segments: readonly RowSegment[]): boolean {
  return (
    segments.length === 1 &&
    isPlainStyle(segments[0]!.style) &&
    segments[0]!.text.trim().length === 0
  );
}

function renderRow(
  terminal: Terminal,
  metrics: CellMetrics,
  wideScaleX: number,
  y: number,
  lineEl: HTMLElement,
): void {
  const segments = computeRowSegments(terminal, y);
  const newKey = segmentsToKey(segments);

  // Skip DOM update if content hasn't changed
  const cachedKey = rowCache.get(lineEl);
  if (cachedKey === newKey) return;

  rowCache.set(lineEl, newKey);

  if (isTransparentBlankRow(segments)) {
    lineEl.replaceChildren();
    return;
  }

  // Use DocumentFragment to batch DOM operations and avoid layout thrashing
  const fragment = document.createDocumentFragment();

  for (const seg of segments) {
    const span = document.createElement("span");
    if (seg.wide && wideScaleX > 1.01) {
      const inner = document.createElement("span");
      inner.textContent = seg.text;
      inner.style.cssText = `display:inline-block;white-space:pre;transform:scaleX(${wideScaleX});transform-origin:left`;
      span.appendChild(inner);
    } else {
      span.textContent = seg.text;
    }
    span.style.cssText = `display:inline-block;width:${seg.cols * metrics.cellWidth}px;height:${metrics.cellHeight}px;overflow:hidden;white-space:pre;vertical-align:top`;
    applyStyle(span, seg.style);
    fragment.appendChild(span);
  }

  // Single DOM operation - replaces all children at once
  lineEl.replaceChildren(fragment);
}

export function createDomRenderer(terminal: Terminal, container: HTMLElement): DomRenderer {
  container.style.fontFamily = DEFAULT_FONT_FAMILY;
  container.style.whiteSpace = "pre";
  container.style.display = "inline-block";
  container.style.overflow = "hidden";
  container.style.position = "relative";
  // Default to native selection; EventManager may temporarily disable selection
  // for focusable interactive regions (e.g. TInput) to mimic browser behavior.
  container.style.userSelect = "text";
  container.style.outline = "none";
  // Prevent layout shifts during updates
  container.style.contain = "layout style";
  container.tabIndex = 0;
  installAnsiPaletteCssVars(container);

  let metrics = measureCell(container);
  let wideScaleX = 1;
  const planeLayers = new Map<TerminalRenderPlane, PlaneLayer>();
  let raf = 0;
  const pending = new Map<TerminalRenderPlane, Set<number>>();
  let disposed = false;

  function applyPlaneOffset(plane: TerminalRenderPlane, offsetPx: number): void {
    const layer = planeLayers.get(plane);
    if (!layer) return;
    const next = Number.isFinite(offsetPx) ? offsetPx : 0;
    if (layer.offsetPx === next) return;
    layer.offsetPx = next;
    layer.contentEl.style.transform = next ? `translateY(${next}px)` : "translateY(0px)";
  }

  function applyPlaneViewport(
    plane: TerminalRenderPlane,
    viewport: Readonly<{ topPx: number; heightPx: number }> | null,
  ): void {
    const layer = planeLayers.get(plane);
    if (!layer) return;

    const totalHeight = terminal.size().rows * metrics.cellHeight;
    if (!viewport) {
      layer.viewportTopPx = 0;
      layer.viewportHeightPx = null;
      layer.el.style.clipPath = "none";
      return;
    }

    const topPx = Math.max(0, Math.min(totalHeight, Math.floor(viewport.topPx)));
    const heightPx = Math.max(0, Math.min(totalHeight - topPx, Math.floor(viewport.heightPx)));
    layer.viewportTopPx = topPx;
    layer.viewportHeightPx = heightPx;

    if (topPx === 0 && heightPx >= totalHeight) {
      layer.el.style.clipPath = "none";
      return;
    }

    const bottomPx = Math.max(0, totalHeight - topPx - heightPx);
    layer.el.style.clipPath = `inset(${topPx}px 0px ${bottomPx}px 0px)`;
  }

  function rebuildLines(): void {
    const { rows, cols } = terminal.size();
    container.style.width = `${cols * metrics.cellWidth}px`;
    container.style.height = `${rows * metrics.cellHeight}px`;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < TERMINAL_RENDER_PLANES.length; i++) {
      const plane = TERMINAL_RENDER_PLANES[i]!;
      const planeTerminal = getPlaneTerminal(terminal, plane);
      let layer = planeLayers.get(plane);
      if (!layer) {
        const el = document.createElement("div");
        const contentEl = document.createElement("div");
        el.dataset.vtPlane = plane;
        el.style.pointerEvents = "none";
        contentEl.style.position = "absolute";
        contentEl.style.left = "0";
        contentEl.style.top = "0";
        layer = {
          el,
          contentEl,
          lines: [],
          offsetPx: 0,
          terminal: planeTerminal,
          viewportTopPx: 0,
          viewportHeightPx: null,
        };
        planeLayers.set(plane, layer);
      }
      layer.terminal = planeTerminal;
      layer.el.style.position = "absolute";
      layer.el.style.left = "0";
      layer.el.style.top = "0";
      layer.el.style.width = `${cols * metrics.cellWidth}px`;
      layer.el.style.height = `${rows * metrics.cellHeight}px`;
      layer.el.style.overflow = "hidden";
      layer.el.style.zIndex = String(i);
      layer.contentEl.style.width = `${cols * metrics.cellWidth}px`;
      layer.contentEl.style.height = `${rows * metrics.cellHeight}px`;
      applyPlaneOffset(plane, layer.offsetPx);
      applyPlaneViewport(
        plane,
        layer.viewportHeightPx == null
          ? null
          : {
              topPx: layer.viewportTopPx,
              heightPx: layer.viewportHeightPx,
            },
      );

      const lineFragment = document.createDocumentFragment();
      layer.lines = Array.from({ length: rows }, () => {
        const line = document.createElement("div");
        line.style.cssText = `height:${metrics.cellHeight}px;width:${cols * metrics.cellWidth}px;overflow:hidden;contain:layout style`;
        lineFragment.appendChild(line);
        return line;
      });
      layer.contentEl.replaceChildren(lineFragment);
      layer.el.replaceChildren(layer.contentEl);
      fragment.appendChild(layer.el);
    }
    container.replaceChildren(fragment);
  }

  function refresh(): void {
    metrics = measureCell(container);
    const wideW = measureCharWidth(container, "中");
    wideScaleX = wideW > 0 ? Math.max(1, Math.min(2, (metrics.cellWidth * 2) / wideW)) : 1;
    rebuildLines();
    const size = terminal.size();
    for (const plane of TERMINAL_RENDER_PLANES) {
      const layer = planeLayers.get(plane);
      if (!layer) continue;
      for (let y = 0; y < size.rows; y++)
        renderRow(layer.terminal, metrics, wideScaleX, y, layer.lines[y]!);
    }
  }

  interface FlushScope {
    planes: readonly TerminalRenderPlane[];
    rows: readonly number[] | null;
  }

  function recordLargeSyncFlush(scope: Readonly<FlushScope>): void {
    if (!(globalThis as any).__VT_DEBUG_PERF__) return;
    const size = terminal.size();
    const rowCount = scope.rows == null ? size.rows : scope.rows.length;
    const planeCount = scope.planes.length || TERMINAL_RENDER_PLANES.length;
    const cellWork = rowCount * size.cols * planeCount;
    if (rowCount <= SYNC_FLUSH_WARN_ROWS && cellWork <= SYNC_FLUSH_CELL_BUDGET) return;
    console.warn(
      `[vue-tui] large sync DOM flush deferred: rows=${rowCount} cols=${size.cols} planes=${planeCount} cells=${cellWork}`,
    );
  }

  function shouldSyncFlush(scope: Readonly<FlushScope>): boolean {
    const size = terminal.size();
    const rowCount = scope.rows == null ? size.rows : scope.rows.length;
    const planeCount = scope.planes.length || TERMINAL_RENDER_PLANES.length;
    return (
      rowCount <= SYNC_FLUSH_WARN_ROWS &&
      rowCount * size.cols * planeCount <= SYNC_FLUSH_CELL_BUDGET
    );
  }

  function flushPending(scope?: Readonly<FlushScope>): void {
    raf = 0;
    if (disposed) return;
    const planesToFlush = scope?.planes ?? TERMINAL_RENDER_PLANES;

    for (const plane of planesToFlush) {
      const layer = planeLayers.get(plane);
      const rows = pending.get(plane);
      if (!layer || !rows?.size) continue;

      const targetRows =
        scope?.rows == null ? Array.from(rows) : scope.rows.filter((y) => rows.has(y));

      for (const y of targetRows) {
        const line = layer.lines[y];
        if (line) renderRow(layer.terminal, metrics, wideScaleX, y, line);
        rows.delete(y);
      }

      if (rows.size === 0) pending.delete(plane);
    }

    if (pending.size > 0) scheduleRafIfNeeded();
  }

  function scheduleRafIfNeeded(): void {
    if (raf || disposed) return;
    // Support test environments that stub rAF synchronously by avoiding the
    // `raf = requestAnimationFrame(...)` assignment trap (cb runs before the assignment).
    raf = -1;
    const id = requestAnimationFrame(() => {
      flushPending();
    });
    if (raf === -1) raf = id;
  }

  const offCommit = terminal.on("commit", ({ dirtyRows, planes, sync }) => {
    const activePlanes = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    // Track which rows this specific commit adds to pending, so scoped sync
    // flush can limit DOM work to just the high-priority update.
    const commitRows: number[] | null = dirtyRows === null ? null : [...dirtyRows];

    if (dirtyRows === null) {
      const size = terminal.size();
      for (const plane of activePlanes) {
        let rows = pending.get(plane);
        if (!rows) {
          rows = new Set<number>();
          pending.set(plane, rows);
        }
        for (let y = 0; y < size.rows; y++) rows.add(y);
      }
    } else {
      for (const plane of activePlanes) {
        let rows = pending.get(plane);
        if (!rows) {
          rows = new Set<number>();
          pending.set(plane, rows);
        }
        for (const y of dirtyRows) rows.add(y);
      }
    }
    if (sync) {
      const scope = { planes: activePlanes, rows: commitRows };
      recordLargeSyncFlush(scope);
      if (!shouldSyncFlush(scope)) {
        scheduleRafIfNeeded();
        return;
      }
      if (raf > 0) cancelAnimationFrame(raf);
      raf = 0;
      flushPending(scope);
    } else if (!raf) {
      scheduleRafIfNeeded();
    }
  });

  const offResize = terminal.on("resize", () => {
    refresh();
  });

  refresh();
  // Clear initial dirty flags.
  terminal.commit();

  return {
    container,
    get metrics() {
      return metrics;
    },
    refresh,
    dispose() {
      disposed = true;
      offCommit();
      offResize();
      if (raf > 0) cancelAnimationFrame(raf);
      pending.clear();
      planeLayers.clear();
      container.replaceChildren();
    },
    setPlaneOffset(plane, offsetPx) {
      applyPlaneOffset(plane, offsetPx);
    },
    setPlaneViewport(plane, viewport) {
      applyPlaneViewport(plane, viewport);
    },
  };
}
