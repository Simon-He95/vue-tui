import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalPointerEvent } from "../../events/manager/types.js";
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
const SCROLLBAR_WIDTH = 1;
const TRACK_CHAR = "│";
const EXACT_THUMB_CHAR = "█";
const MEASURING_THUMB_CHAR = "▒";
const ESTIMATED_THUMB_CHAR = "░";
const MARKER_CHAR = "•";
const ESTIMATED_MARKER_CHAR = "·";
const CURRENT_MARKER_CHAR = "◆";
const UP_ARROW_CHAR = "▲";
const DOWN_ARROW_CHAR = "▼";

type TLogScrollbarThumb = Readonly<{
  top: number;
  size: number;
}>;

export type TLogScrollbarMetrics = TLogViewScrollMetrics;
export type TLogScrollbarScrollToPayload = number;
export type TLogScrollbarScrollByPayload = number;
export type TLogScrollbarMarker = Readonly<{
  id?: string | number;
  visualRow: number;
  current?: boolean;
  estimated?: boolean;
  payload?: unknown;
}>;
export type TLogScrollbarMarkerClickPayload = Readonly<{
  marker: TLogScrollbarMarker;
  markerIndex: number;
  visualRow: number;
  cellX: number;
  cellY: number;
}>;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeInt(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function arrowInset(height: number, showArrows: boolean): number {
  return showArrows && height >= 2 ? 1 : 0;
}

function trackGeometry(
  height: number,
  showArrows: boolean,
): Readonly<{
  arrowRows: number;
  trackTop: number;
  trackHeight: number;
}> {
  const arrowRows = arrowInset(height, showArrows);
  return {
    arrowRows,
    trackTop: arrowRows,
    trackHeight: Math.max(0, height - arrowRows * 2),
  };
}

function computeThumb(
  metrics: TLogScrollbarMetrics | null | undefined,
  height: number,
  showArrows: boolean,
): TLogScrollbarThumb | null {
  if (!metrics) return null;
  const { trackTop, trackHeight } = trackGeometry(height, showArrows);
  if (trackHeight <= 0) return null;

  const viewport = Math.max(0, normalizeInt(metrics.viewportRows));
  const total = Math.max(normalizeInt(metrics.visualRowCount), viewport, 1);
  const maxTop = Math.max(0, normalizeInt(metrics.maxScrollTop));
  const top = clamp(normalizeInt(metrics.scrollTop), 0, maxTop);
  const size = clamp(Math.round((viewport / total) * trackHeight), 1, trackHeight);
  const maxThumbTop = Math.max(0, trackHeight - size);
  const thumbTop = maxTop <= 0 ? 0 : Math.round((top / maxTop) * maxThumbTop);

  return {
    top: trackTop + thumbTop,
    size,
  };
}

function markerRow(
  marker: TLogScrollbarMarker,
  metrics: TLogScrollbarMetrics,
  height: number,
  showArrows: boolean,
): number | null {
  const { trackTop, trackHeight } = trackGeometry(height, showArrows);
  if (trackHeight <= 0) return null;

  const total = Math.max(
    normalizeInt(metrics.visualRowCount),
    normalizeInt(metrics.viewportRows),
    1,
  );
  const maxVisual = Math.max(1, total - 1);
  const visualRow = clamp(normalizeInt(marker.visualRow), 0, maxVisual);
  return trackTop + Math.round((visualRow / maxVisual) * (trackHeight - 1));
}

type TLogScrollbarMarkerHit = Readonly<{
  marker: TLogScrollbarMarker;
  index: number;
}>;

function markerPriority(marker: TLogScrollbarMarker): number {
  if (marker.current) return 2;
  if (!marker.estimated) return 1;
  return 0;
}

function collectMarkersByRow(
  markers: readonly TLogScrollbarMarker[],
  metrics: TLogScrollbarMetrics | null | undefined,
  height: number,
  showArrows: boolean,
): ReadonlyMap<number, TLogScrollbarMarkerHit> {
  if (!metrics || !markers.length) return new Map();

  const rows = new Map<number, TLogScrollbarMarkerHit>();
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]!;
    const row = markerRow(marker, metrics, height, showArrows);
    if (row == null) continue;

    const previous = rows.get(row);
    if (!previous || markerPriority(marker) >= markerPriority(previous.marker)) {
      rows.set(row, { marker, index: i });
    }
  }

  return rows;
}

function mergeStyle(base: Style, overlay?: Style): Style {
  return overlay ? { ...base, ...overlay } : base;
}

export const TLogScrollbar = defineComponent({
  name: "TLogScrollbar",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    h: { type: Number, required: true },
    eventX: { type: Number, default: undefined },
    eventW: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    metrics: {
      type: Object as PropType<TLogScrollbarMetrics | null>,
      default: null,
    },
    style: { type: Object as PropType<Style>, default: undefined },
    thumbStyle: { type: Object as PropType<Style>, default: undefined },
    trackStyle: { type: Object as PropType<Style>, default: undefined },
    measuringStyle: { type: Object as PropType<Style>, default: undefined },
    markers: {
      type: Array as PropType<readonly TLogScrollbarMarker[]>,
      default: () => [],
    },
    markerStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "yellowBright" }),
    },
    currentMarkerStyle: {
      type: Object as PropType<Style>,
      default: () => ({ fg: "redBright", bold: true }),
    },
    showMarkers: { type: Boolean, default: true },
    showArrows: { type: Boolean, default: false },
    paint: { type: Boolean, default: true },
    trackChar: { type: String, default: TRACK_CHAR },
    thumbChar: { type: String, default: EXACT_THUMB_CHAR },
    measuringThumbChar: { type: String, default: MEASURING_THUMB_CHAR },
    estimatedThumbChar: { type: String, default: ESTIMATED_THUMB_CHAR },
  },
  emits: ["scrollTo", "scrollBy", "markerClick", "dragStart", "dragEnd"],
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
          w: SCROLLBAR_WIDTH,
          h: Math.max(0, normalizeInt(props.h)),
        },
        parent.originX,
        parent.originY,
      ),
    );
    const fullEventRect = computed<Rect>(() =>
      translateRect(
        {
          x: normalizeInt(props.eventX ?? props.x),
          y: normalizeInt(props.y),
          w: Math.max(1, normalizeInt(props.eventW ?? SCROLLBAR_WIDTH)),
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
    const eventRect = computed<Rect>(() => {
      const translated = fullEventRect.value;
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
    });

    let dragging = false;
    let dragMoved = false;
    let suppressNextClick = false;

    function emitTrackScroll(
      e: TerminalPointerEvent,
      opts?: Readonly<{ clampY?: boolean; markerClick?: boolean }>,
    ): void {
      const metrics = props.metrics;
      if (!metrics) return;
      const full = fullEventRect.value;
      const rawLocalY = e.cellY - full.y;
      const localY = opts?.clampY ? clamp(rawLocalY, 0, full.h - 1) : rawLocalY;
      if (localY < 0 || localY >= full.h) return;

      const { arrowRows, trackTop, trackHeight } = trackGeometry(full.h, props.showArrows);
      if (arrowRows) {
        if (localY === 0) {
          emit("scrollBy", -Math.max(1, normalizeInt(metrics.viewportRows)));
          e.preventDefault?.();
          return;
        }
        if (localY === full.h - 1) {
          emit("scrollBy", Math.max(1, normalizeInt(metrics.viewportRows)));
          e.preventDefault?.();
          return;
        }
      }
      if (trackHeight <= 0) return;

      const thumb = computeThumb(metrics, full.h, props.showArrows);
      const isThumbRow = thumb != null && localY >= thumb.top && localY < thumb.top + thumb.size;
      const markerHit =
        opts?.markerClick !== false && !isThumbRow && props.showMarkers
          ? collectMarkersByRow(props.markers, metrics, full.h, props.showArrows).get(localY)
          : undefined;
      if (markerHit != null) {
        emit("markerClick", {
          marker: markerHit.marker,
          markerIndex: markerHit.index,
          visualRow: markerHit.marker.visualRow,
          cellX: e.cellX,
          cellY: e.cellY,
        } satisfies TLogScrollbarMarkerClickPayload);
        e.preventDefault?.();
        return;
      }

      const pos = clamp(localY - trackTop, 0, trackHeight - 1);
      const ratio = trackHeight <= 1 ? 0 : pos / (trackHeight - 1);
      const target = Math.round(ratio * Math.max(0, normalizeInt(metrics.maxScrollTop)));
      emit("scrollTo", target);
      e.preventDefault?.();
    }

    function onPointerdown(e: TerminalPointerEvent): void {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      dragMoved = false;
      emit("dragStart");
      e.stopPropagation?.();
    }

    function onPointermove(e: TerminalPointerEvent): void {
      if (!dragging) return;
      dragMoved = true;
      emitTrackScroll(e, { clampY: true, markerClick: false });
      e.stopPropagation?.();
    }

    function onPointerup(e: TerminalPointerEvent): void {
      if (!dragging) return;
      if (dragMoved) {
        emitTrackScroll(e, { clampY: true, markerClick: false });
        suppressNextClick = true;
      }
      dragging = false;
      emit("dragEnd");
      e.stopPropagation?.();
    }

    function onClick(e: TerminalPointerEvent): void {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.preventDefault?.();
        return;
      }
      emitTrackScroll(e);
    }

    useTerminalNode(() => ({
      rect: eventRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: false,
      handlers: {
        click: onClick,
        pointerdown: onPointerdown,
        pointermove: onPointermove,
        pointerup: onPointerup,
        wheel: (e) => {
          const dir = Math.sign(Number(e.deltaY ?? 0));
          if (!dir) return;
          emit("scrollBy", dir);
          e.preventDefault?.();
        },
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value && props.paint ? rect.value : EMPTY_RECT,
      deps: [
        visible.value,
        props.paint,
        rect.value,
        fullRect.value,
        props.metrics,
        props.style,
        props.trackStyle,
        props.thumbStyle,
        props.measuringStyle,
        props.markers,
        props.markerStyle,
        props.currentMarkerStyle,
        props.showMarkers,
        props.showArrows,
        props.trackChar,
        props.thumbChar,
        props.measuringThumbChar,
        props.estimatedThumbChar,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value || !props.paint) return;
        const r = rect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const full = fullRect.value;
        const baseStyle = props.style ?? defaultStyle.value;
        const trackStyle = mergeStyle(baseStyle, props.trackStyle ?? { dim: true });
        const thumbStyle = mergeStyle(baseStyle, props.thumbStyle ?? { inverse: true });
        const estimatedThumbStyle = mergeStyle(thumbStyle, { dim: true });
        const markerStyle = mergeStyle(baseStyle, props.markerStyle);
        const currentMarkerStyle = mergeStyle(baseStyle, props.currentMarkerStyle);
        const measuringThumbStyle = mergeStyle(
          baseStyle,
          props.measuringStyle ?? { ...thumbStyle, dim: true },
        );
        const thumb = computeThumb(props.metrics, full.h, props.showArrows);
        const markersByRow = props.showMarkers
          ? collectMarkersByRow(props.markers, props.metrics, full.h, props.showArrows)
          : new Map<number, TLogScrollbarMarkerHit>();
        const { arrowRows } = trackGeometry(full.h, props.showArrows);

        const paintRow = (y: number): void => {
          if (y < r.y || y >= r.y + r.h) return;
          const localY = y - full.y;
          if (localY < 0 || localY >= full.h) return;

          let char = props.trackChar || TRACK_CHAR;
          let style = trackStyle;
          if (arrowRows && localY === 0) {
            char = UP_ARROW_CHAR;
          } else if (arrowRows && localY === full.h - 1) {
            char = DOWN_ARROW_CHAR;
          } else {
            const markerHit = markersByRow.get(localY);
            if (markerHit) {
              char = markerHit.marker.current
                ? CURRENT_MARKER_CHAR
                : markerHit.marker.estimated
                  ? ESTIMATED_MARKER_CHAR
                  : MARKER_CHAR;
              style = markerHit.marker.current ? currentMarkerStyle : markerStyle;
            }
          }
          if (thumb && localY >= thumb.top && localY < thumb.top + thumb.size) {
            if (props.metrics?.visualIndexStatus === "measuring") {
              char = props.measuringThumbChar || MEASURING_THUMB_CHAR;
              style = measuringThumbStyle;
            } else if (props.metrics?.visualIndexStatus === "estimated") {
              char = props.estimatedThumbChar || ESTIMATED_THUMB_CHAR;
              style = estimatedThumbStyle;
            } else {
              char = props.thumbChar || EXACT_THUMB_CHAR;
              style = thumbStyle;
            }
          }

          terminal.put(r.x, y, char, style);
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
