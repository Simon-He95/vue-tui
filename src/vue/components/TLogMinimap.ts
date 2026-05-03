import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalPointerEvent } from "../../events/index.js";
import type { TLogViewScrollMetrics } from "./TLogView.js";
import { computed, defineComponent, h, inject } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
const CURRENT_MARKER_CHAR = "◆";
const MARKER_CHAR = "•";
const ESTIMATED_MARKER_CHAR = "·";
const VIEWPORT_CHAR = "█";
const DENSITY_HIGH_CHAR = "▓";
const DENSITY_MEDIUM_CHAR = "▒";
const DENSITY_LOW_CHAR = "░";

export type TLogMinimapMetrics = TLogViewScrollMetrics;
export type TLogMinimapMarker = Readonly<{
  id?: string | number;
  visualRow: number;
  current?: boolean;
  estimated?: boolean;
  payload?: unknown;
}>;
export type TLogMinimapDensityBucket = Readonly<{
  startVisualRow: number;
  endVisualRow: number;
  value: number;
}>;
export type TLogMinimapClickPayload = Readonly<{
  visualRow: number;
  cellX: number;
  cellY: number;
}>;
export type TLogMinimapMarkerClickPayload = Readonly<{
  marker: TLogMinimapMarker;
  markerIndex: number;
  visualRow: number;
  cellX: number;
  cellY: number;
}>;

type TLogMinimapMarkerHit = Readonly<{
  marker: TLogMinimapMarker;
  index: number;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function normalizeDensity(value: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, 0, 1) : 0;
}

function mergeStyle(base: Style, overlay?: Style): Style {
  return overlay ? { ...base, ...overlay } : base;
}

function totalVisualRows(metrics: TLogMinimapMetrics): number {
  return Math.max(normalizeInt(metrics.visualRowCount), normalizeInt(metrics.viewportRows), 1);
}

function visualToLocalY(
  visualRow: number,
  metrics: TLogMinimapMetrics,
  height: number,
): number | null {
  const normalizedHeight = normalizeInt(height);
  if (normalizedHeight <= 0) return null;

  const total = totalVisualRows(metrics);
  const maxVisual = Math.max(1, total - 1);
  const row = clamp(normalizeInt(visualRow), 0, maxVisual);
  return Math.round((row / maxVisual) * (normalizedHeight - 1));
}

function localYToVisualRow(localY: number, metrics: TLogMinimapMetrics, height: number): number {
  const normalizedHeight = normalizeInt(height);
  if (normalizedHeight <= 1) return 0;

  const total = totalVisualRows(metrics);
  const ratio = clamp(normalizeInt(localY), 0, normalizedHeight - 1) / (normalizedHeight - 1);
  return Math.round(ratio * Math.max(0, total - 1));
}

function visualRangeToLocalRange(
  startVisualRow: number,
  endVisualRow: number,
  metrics: TLogMinimapMetrics,
  height: number,
): Readonly<{
  top: number;
  bottom: number;
}> | null {
  const start = visualToLocalY(startVisualRow, metrics, height);
  const end = visualToLocalY(endVisualRow, metrics, height);
  if (start == null || end == null) return null;
  return {
    top: Math.min(start, end),
    bottom: Math.max(start, end),
  };
}

function viewportRange(
  metrics: TLogMinimapMetrics | null | undefined,
  height: number,
): Readonly<{
  top: number;
  bottom: number;
}> | null {
  if (!metrics) return null;
  const scrollTop = clamp(
    normalizeInt(metrics.scrollTop),
    0,
    Math.max(0, totalVisualRows(metrics) - 1),
  );
  const viewportRows = Math.max(1, normalizeInt(metrics.viewportRows));
  return visualRangeToLocalRange(scrollTop, scrollTop + viewportRows - 1, metrics, height);
}

function markerPriority(marker: TLogMinimapMarker): number {
  if (marker.current) return 2;
  if (!marker.estimated) return 1;
  return 0;
}

function collectMarkersByRow(
  markers: readonly TLogMinimapMarker[],
  metrics: TLogMinimapMetrics | null | undefined,
  height: number,
): ReadonlyMap<number, TLogMinimapMarkerHit> {
  if (!metrics || !markers.length || normalizeInt(height) <= 0) return new Map();

  const rows = new Map<number, TLogMinimapMarkerHit>();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]!;
    const row = visualToLocalY(marker.visualRow, metrics, height);
    if (row == null) continue;

    const previous = rows.get(row);
    if (!previous || markerPriority(marker) > markerPriority(previous.marker)) {
      rows.set(row, { marker, index: i });
    }
  }

  return rows;
}

function collectDensityByRow(
  density: readonly TLogMinimapDensityBucket[],
  metrics: TLogMinimapMetrics | null | undefined,
  height: number,
): readonly number[] {
  const normalizedHeight = normalizeInt(height);
  if (!metrics || !density.length || normalizedHeight <= 0) return [];

  const rows = Array.from({ length: normalizedHeight }, () => 0);
  for (const bucket of density) {
    const range = visualRangeToLocalRange(
      bucket.startVisualRow,
      bucket.endVisualRow,
      metrics,
      normalizedHeight,
    );
    if (!range) continue;
    const value = normalizeDensity(bucket.value);
    for (let row = range.top; row <= range.bottom; row++) {
      rows[row] = Math.max(rows[row] ?? 0, value);
    }
  }

  return rows;
}

function densityChar(value: number): string {
  if (value >= 0.66) return DENSITY_HIGH_CHAR;
  if (value >= 0.33) return DENSITY_MEDIUM_CHAR;
  if (value > 0) return DENSITY_LOW_CHAR;
  return " ";
}

export const TLogMinimap = defineComponent({
  name: "TLogMinimap",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    metrics: {
      type: Object as PropType<TLogMinimapMetrics | null>,
      default: null,
    },
    markers: {
      type: Array as PropType<readonly TLogMinimapMarker[]>,
      default: () => [],
    },
    density: {
      type: Array as PropType<readonly TLogMinimapDensityBucket[]>,
      default: () => [],
    },
    style: { type: Object as PropType<Style>, default: undefined },
    densityStyle: { type: Object as PropType<Style>, default: undefined },
    markerStyle: { type: Object as PropType<Style>, default: undefined },
    currentMarkerStyle: { type: Object as PropType<Style>, default: undefined },
    viewportStyle: { type: Object as PropType<Style>, default: undefined },
    estimatedStyle: { type: Object as PropType<Style>, default: undefined },
    showMarkers: { type: Boolean, default: true },
    showDensity: { type: Boolean, default: true },
    showViewport: { type: Boolean, default: true },
  },
  emits: ["scrollTo", "markerClick"],
  setup(props, { emit }) {
    const { terminal, defaultStyle } = useTerminal();
    const parent = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const fullRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.x),
          y: normalizeInt(props.y),
          w: Math.max(0, normalizeInt(props.w)),
          h: Math.max(0, normalizeInt(props.h)),
        },
        parent.originX,
        parent.originY,
      ),
    );

    const rect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
    });

    function onClick(e: TerminalPointerEvent): void {
      const metrics = props.metrics;
      if (!metrics) return;

      const full = fullRect.value;
      const localY = e.cellY - full.y;
      if (localY < 0 || localY >= full.h) return;

      const markerHit = props.showMarkers
        ? collectMarkersByRow(props.markers, metrics, full.h).get(localY)
        : undefined;
      if (markerHit) {
        emit("markerClick", {
          marker: markerHit.marker,
          markerIndex: markerHit.index,
          visualRow: markerHit.marker.visualRow,
          cellX: e.cellX,
          cellY: e.cellY,
        } satisfies TLogMinimapMarkerClickPayload);
        e.preventDefault?.();
        return;
      }

      emit("scrollTo", {
        visualRow: localYToVisualRow(localY, metrics, full.h),
        cellX: e.cellX,
        cellY: e.cellY,
      } satisfies TLogMinimapClickPayload);
      e.preventDefault?.();
    }

    useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: false,
      handlers: {
        click: onClick,
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? rect.value : EMPTY_RECT,
      deps: [
        visible.value,
        rect.value,
        fullRect.value,
        props.metrics,
        props.markers,
        props.density,
        props.style,
        props.densityStyle,
        props.markerStyle,
        props.currentMarkerStyle,
        props.viewportStyle,
        props.estimatedStyle,
        props.showMarkers,
        props.showDensity,
        props.showViewport,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;

        const full = fullRect.value;
        const baseStyle = props.style ?? defaultStyle.value;
        const densityStyle = mergeStyle(baseStyle, props.densityStyle ?? { dim: true });
        const viewportStyle = mergeStyle(baseStyle, props.viewportStyle ?? { inverse: true });
        const markerStyle = mergeStyle(baseStyle, props.markerStyle ?? { fg: "yellowBright" });
        const currentMarkerStyle = mergeStyle(
          baseStyle,
          props.currentMarkerStyle ?? { fg: "redBright", bold: true },
        );
        const estimatedMarkerStyle = mergeStyle(markerStyle, props.estimatedStyle ?? { dim: true });
        const viewport = props.showViewport ? viewportRange(props.metrics, full.h) : null;
        const markersByRow = props.showMarkers
          ? collectMarkersByRow(props.markers, props.metrics, full.h)
          : new Map<number, TLogMinimapMarkerHit>();
        const densityByRow = props.showDensity
          ? collectDensityByRow(props.density, props.metrics, full.h)
          : [];
        const overviewColumn = full.w <= 0 ? -1 : full.w - 1;

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          const localY = y - full.y;
          if (localY < 0 || localY >= full.h) return;

          const markerHit = markersByRow.get(localY);
          const densityValue = densityByRow[localY] ?? 0;
          const inViewport =
            viewport != null && localY >= viewport.top && localY <= viewport.bottom;

          for (let x = r.x; x < r.x + r.w; x++) {
            const localX = x - full.x;
            if (localX < 0 || localX >= full.w) continue;

            let char = " ";
            let style = baseStyle;
            if (full.w <= 1) {
              if (densityValue > 0) {
                char = densityChar(densityValue);
                style = mergeStyle(style, densityStyle);
              }
              if (inViewport) {
                char = VIEWPORT_CHAR;
                style = mergeStyle(style, viewportStyle);
              }
              if (markerHit) {
                char = markerHit.marker.current
                  ? CURRENT_MARKER_CHAR
                  : markerHit.marker.estimated
                    ? ESTIMATED_MARKER_CHAR
                    : MARKER_CHAR;
                style = mergeStyle(
                  style,
                  markerHit.marker.current
                    ? currentMarkerStyle
                    : markerHit.marker.estimated
                      ? estimatedMarkerStyle
                      : markerStyle,
                );
              }
            } else {
              if (inViewport) style = mergeStyle(style, viewportStyle);
              if (localX === overviewColumn) {
                if (markerHit) {
                  char = markerHit.marker.current
                    ? CURRENT_MARKER_CHAR
                    : markerHit.marker.estimated
                      ? ESTIMATED_MARKER_CHAR
                      : MARKER_CHAR;
                  style = mergeStyle(
                    style,
                    markerHit.marker.current
                      ? currentMarkerStyle
                      : markerHit.marker.estimated
                        ? estimatedMarkerStyle
                        : markerStyle,
                  );
                } else if (inViewport) {
                  char = VIEWPORT_CHAR;
                }
              } else if (densityValue > 0) {
                char = densityChar(densityValue);
                style = mergeStyle(style, densityStyle);
              }
            }

            terminal.put(x, y, char, style);
          }
        };

        if (!dirtyRows) {
          for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
          return;
        }
        for (const y of dirtyRows) paintRow(y);
      },
    }));

    return () => h("span", rootProps);
  },
});
