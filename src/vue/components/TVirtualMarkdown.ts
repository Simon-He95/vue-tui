import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { TuiMarkdownGraphicSegment } from "../markdown/types.js";
import type {
  Rect,
  TerminalKeyboardEvent,
  TerminalPointerEvent,
} from "../../events/manager/types.js";
import type {
  SelectedRowSpan,
  SelectionTextProvider,
  TerminalSelectionPoint,
  TerminalSelectionRange,
} from "../../selection/terminal-selection.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  watchEffect,
} from "vue";
import { buildMarkdownBlocks } from "../markdown/document.js";
import { findMarkdownImageActionAt } from "../markdown/image-actions.js";
import {
  terminalSelectionRowSpans,
  terminalSelectionVisibleRowSpans,
} from "../../selection/terminal-selection.js";
import {
  getTerminalGraphicsOutputVersion,
  subscribeTerminalGraphicsOutput,
} from "../../renderer/terminal-graphics.js";
import { layoutMarkdownBlocksCached, type TuiMarkdownLayoutCache } from "../markdown/layout.js";
import { createTuiMarkdownParser } from "../markdown/parser.js";
import {
  clearMarkdownImageGraphics,
  collectVisibleMarkdownImageGraphicIds,
  paintMarkdownVisualRow,
} from "../markdown/render.js";
import { markdownThemeSignature, type TuiMarkdownThemeOverrides } from "../markdown/theme.js";
import type {
  TuiMarkdownBlock,
  TuiMarkdownImageActionPayload,
  TuiMarkdownVisualRow,
} from "../markdown/types.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, normalizeCellRect, translateRect } from "../utils/rect.js";
import { sliceByCellsRange, withTextWidthProvider } from "../utils/text.js";
import {
  applyWheelScroll,
  createWheelScrollState,
  resetWheelScrollState,
} from "../utils/wheel-scroll.js";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function markdownStyleSignature(style?: Style): string {
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

function markdownRowSignature(row: TuiMarkdownVisualRow | undefined): string {
  if (!row) return "";
  return [
    row.key,
    row.plainText,
    row.segments
      .map(
        (segment) =>
          `${segment.text}\u0001${segment.cells}\u0001${markdownStyleSignature(segment.style)}\u0001${segment.graphic?.src ?? ""}\u0001${segment.graphic?.base64 ?? ""}\u0001${segment.fallbackText ?? ""}`,
      )
      .join("\u0002"),
  ].join("\u0003");
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

function rowGraphicSignature(row: TuiMarkdownVisualRow | undefined): string {
  if (!row) return "";
  return row.segments
    .map((segment) =>
      segment.graphic
        ? `${segment.graphic.kind}\u0001${segment.graphic.src}\u0001${segment.graphic.base64 ?? ""}`
        : "",
    )
    .join("\u0002");
}

export const TVirtualMarkdown = defineComponent({
  name: "TVirtualMarkdown",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    content: { type: String, default: "" },
    blocks: {
      type: Array as PropType<readonly TuiMarkdownBlock[]>,
      default: undefined,
    },
    scrollTop: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    final: { type: Boolean, default: true },
    streaming: { type: Boolean, default: false },
    autoFocus: { type: Boolean, default: false },
    selectable: { type: Boolean, default: true },
    customHtmlTags: {
      type: Array as PropType<readonly string[]>,
      default: undefined,
    },
    theme: {
      type: Object as PropType<TuiMarkdownThemeOverrides>,
      default: undefined,
    },
    imageRenderer: {
      type: Function as PropType<
        ((image: TuiMarkdownGraphicSegment) => string | null | undefined)
      >,
      default: undefined,
    },
    imageMinWidth: { type: Number, default: undefined },
    imageMaxWidth: { type: Number, default: undefined },
    imageMinHeight: { type: Number, default: undefined },
    imageMaxHeight: { type: Number, default: undefined },
    imagePreserveAspectRatio: { type: Boolean, default: true },
    imageActions: { type: Boolean, default: false },
  },
  emits: {
    "update:scrollTop": (_value: number) => true,
    scroll: (_value: number) => true,
    focus: () => true,
    blur: () => true,
    keydown: (_event: TerminalKeyboardEvent) => true,
    imageAction: (_payload: TuiMarkdownImageActionPayload) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, events, scheduler, selection, widthProvider } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const internalScrollTop = ref(0);
    const documentVersion = ref(0);
    const rows = shallowRef<readonly TuiMarkdownVisualRow[]>(markRaw([]));
    let pendingSelectionScrollFocusRemap = false;
    const wheelState = createWheelScrollState();
    let builtOnce = false;
    let rebuildVersion = 0;
    let layoutCache: TuiMarkdownLayoutCache | undefined;
    let alive = true;
    const parser = shallowRef(
      markRaw(
        createTuiMarkdownParser({
          streaming: props.streaming,
          customHtmlTags: props.customHtmlTags,
        }),
      ),
    );
    const graphicsOutputVersion = shallowRef(getTerminalGraphicsOutputVersion(terminal));
    const unsubscribeGraphicsOutput = subscribeTerminalGraphicsOutput(terminal, () => {
      graphicsOutputVersion.value = getTerminalGraphicsOutputVersion(terminal);
    });

    watch(
      () => `${props.streaming ? 1 : 0}:${(props.customHtmlTags ?? []).join("\u0000")}`,
      () => {
        parser.value = markRaw(
          createTuiMarkdownParser({
            streaming: props.streaming,
            customHtmlTags: props.customHtmlTags,
          }),
        );
      },
    );

    function rebuildRows(): void {
      const prevScrollTop = internalScrollTop.value;
      const prevVisibleRows = visibleRowSignatures(rows.value, prevScrollTop);
      const prevVisibleGraphics = visibleRowGraphics(rows.value, prevScrollTop);
      const nextLayout = withTextWidthProvider(widthProvider, () => {
        const blocks =
          props.blocks ??
          buildMarkdownBlocks(props.content, parser.value, {
            final: props.final,
            theme: props.theme,
            imageResolver: props.imageRenderer,
            imageSize: {
              minWidth: props.imageMinWidth,
              maxWidth: props.imageMaxWidth,
              minHeight: props.imageMinHeight,
              maxHeight: props.imageMaxHeight,
              preserveAspectRatio: props.imagePreserveAspectRatio,
            },
          }).blocks;
        return layoutMarkdownBlocksCached(blocks, props.w, layoutCache);
      });
      layoutCache = markRaw(nextLayout.cache);
      const nextRows = nextLayout.rows;
      rows.value = markRaw(nextRows);
      reconcileScrollTop();
      const nextScrollTop = internalScrollTop.value;
      const nextVisibleRows = visibleRowSignatures(nextRows, nextScrollTop);
      const nextVisibleGraphics = visibleRowGraphics(nextRows, nextScrollTop);
      const visibleChanged =
        prevVisibleRows.length !== nextVisibleRows.length ||
        prevVisibleRows.some((row, index) => row !== nextVisibleRows[index]) ||
        prevVisibleGraphics.some((row, index) => row !== nextVisibleGraphics[index]);
      if (!builtOnce || prevScrollTop !== nextScrollTop || visibleChanged) {
        documentVersion.value++;
        selection.refresh();
      }
    }

    function scheduleRebuild(): void {
      const currentVersion = ++rebuildVersion;
      if (!builtOnce || !props.streaming) {
        builtOnce = true;
        rebuildRows();
        return;
      }
      scheduler.queueFrameTask({
        id: `TVirtualMarkdown:${instance?.uid ?? "unknown"}:markdown`,
        reason: props.streaming ? "stream" : "data",
        priority: props.streaming ? "low" : "normal",
        sync: false,
        run: () => {
          if (!alive) return;
          if (currentVersion !== rebuildVersion) return;
          // Do not call ctx.invalidate() directly here. Visible-row diffing and
          // render-node deps must observe the rebuilt rows first so viewport/rect
          // invalidation reflects the latest scroll range and repaint policy.
          rebuildRows();
        },
      });
    }

    const fullRect = computed<Rect>(() =>
      translateRect(
        { x: props.x, y: props.y, w: props.w, h: props.h },
        layout.originX,
        layout.originY,
      ),
    );

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

    function maxScrollTop(): number {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      return Math.max(0, rows.value.length - (clipY + clip.h));
    }

    function visibleRowSignatures(
      sourceRows: readonly TuiMarkdownVisualRow[],
      scrollTop: number,
    ): readonly string[] {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      const start = Math.max(0, scrollTop + clipY);
      const end = Math.max(start, start + clip.h);
      const out: string[] = [];
      for (let index = start; index < end; index++)
        out.push(markdownRowSignature(sourceRows[index]));
      return out;
    }

    function visibleRowGraphics(
      sourceRows: readonly TuiMarkdownVisualRow[],
      scrollTop: number,
    ): readonly string[] {
      const clip = normalizedRect();
      const { y: clipY } = clipOffsets();
      const start = Math.max(0, scrollTop + clipY);
      const end = Math.max(start, start + clip.h);
      const out: string[] = [];
      for (let index = start; index < end; index++) out.push(rowGraphicSignature(sourceRows[index]));
      return out;
    }

    function hasControlledScrollTop(): boolean {
      return Object.prototype.hasOwnProperty.call(instance?.vnode.props ?? {}, "scrollTop");
    }

    function applyControlledScrollTop(next: number, remapSelectionFocus = false): void {
      const desired = Math.floor(Number(next) || 0);
      const clamped = clamp(desired, 0, maxScrollTop());
      const changed = internalScrollTop.value !== clamped;

      if (changed) {
        internalScrollTop.value = clamped;
      }

      // When a controlled prop changes, only emit if the parent supplied an
      // out-of-range value so it can correct its state.  Do NOT emit on
      // legitimate prop changes — that would create a feedback loop.
      if (desired !== clamped) {
        emit("update:scrollTop", clamped);
        emit("scroll", clamped);
      }

      if (changed || remapSelectionFocus) {
        selection.refresh(remapSelectionFocus ? { remapFocus: true } : undefined);
      }
    }

    function setScrollTop(
      next: number,
      emitChange = true,
      refreshOptions?: { remapSelectionFocus?: boolean; emitClampEvenIfUnchanged?: boolean },
    ): void {
      const desired = Math.floor(Number(next) || 0);
      const clamped = clamp(desired, 0, maxScrollTop());
      const changed = internalScrollTop.value !== clamped;

      if (changed) {
        internalScrollTop.value = clamped;
      }

      if (
        emitChange &&
        (changed || (refreshOptions?.emitClampEvenIfUnchanged && desired !== clamped))
      ) {
        emit("update:scrollTop", clamped);
        emit("scroll", clamped);
      }

      if (changed || refreshOptions?.remapSelectionFocus) {
        selection.refresh(refreshOptions?.remapSelectionFocus ? { remapFocus: true } : undefined);
      }
    }

    function reconcileScrollTop(): void {
      const desired = hasControlledScrollTop()
        ? Math.floor(Number(props.scrollTop) || 0)
        : internalScrollTop.value;
      const clamped = clamp(desired, 0, maxScrollTop());
      if (internalScrollTop.value === clamped) return;
      internalScrollTop.value = clamped;
      if (desired !== clamped) {
        emit("update:scrollTop", clamped);
        emit("scroll", clamped);
      }
      selection.refresh();
    }

    watch(
      () => props.scrollTop,
      () => {
        if (!hasControlledScrollTop()) return;

        const remap = pendingSelectionScrollFocusRemap;
        pendingSelectionScrollFocusRemap = false;

        applyControlledScrollTop(props.scrollTop, remap);
      },
    );

    watch(
      [
        () => props.content,
        () => props.blocks,
        () => props.w,
        () => parser.value,
        () => props.final,
        () => props.imageRenderer,
        () => markdownThemeSignature(props.theme),
        () => props.imageMinWidth,
        () => props.imageMaxWidth,
        () => props.imageMinHeight,
        () => props.imageMaxHeight,
        () => props.imagePreserveAspectRatio,
      ],
      () => {
        scheduleRebuild();
      },
      { immediate: true },
    );

    watch([() => props.content, () => props.w, () => props.h, () => absRect.value.h], () => {
      resetWheelScrollState(wheelState);
    });

    watch(
      [
        () => props.h,
        () => absRect.value.y,
        () => absRect.value.h,
        () => fullRect.value.y,
        () => fullRect.value.h,
      ],
      () => {
        reconcileScrollTop();
      },
      { immediate: true },
    );

    function scrollSelectionBy(delta: number): boolean {
      const n = Math.trunc(Number(delta));
      if (!Number.isFinite(n) || n === 0) return false;

      if (hasControlledScrollTop()) {
        const nextTop = clamp(internalScrollTop.value + n, 0, maxScrollTop());
        if (nextTop === internalScrollTop.value) return false;

        // Do not spam update:scrollTop while waiting for parent-controlled prop.
        if (pendingSelectionScrollFocusRemap) return false;

        pendingSelectionScrollFocusRemap = true;
        emit("update:scrollTop", nextTop);
        emit("scroll", nextTop);
        return true;
      }

      const before = internalScrollTop.value;
      setScrollTop(before + n, true, { remapSelectionFocus: true });
      return internalScrollTop.value !== before;
    }

    function selectionPointForCell(point: TerminalSelectionPoint): TerminalSelectionPoint | null {
      const r = normalizedRect();
      if (point.x < r.x || point.y < r.y || point.x >= r.x + r.w || point.y >= r.y + r.h) {
        return null;
      }
      const { x: clipX, y: clipY } = clipOffsets();
      const visualY = internalScrollTop.value + clipY + (point.y - r.y);
      if (visualY < 0 || visualY >= rows.value.length) return null;
      return {
        x: clamp(clipX + (point.x - r.x), 0, Math.max(0, props.w - 1)),
        y: visualY,
      };
    }

    function canHandleSelectionRange(range: TerminalSelectionRange): boolean {
      return Boolean(selectionPointForCell(range.anchor) && selectionPointForCell(range.focus));
    }

    function textForSelectionRange(range: TerminalSelectionRange): string {
      const cols = Math.max(1, Math.floor(props.w));
      return withTextWidthProvider(widthProvider, () =>
        terminalSelectionRowSpans(range, cols, rows.value.length)
          .map((span) => {
            const text = sliceByCellsRange(rows.value[span.y]?.plainText ?? "", span.x0, span.x1);
            return span.x1 >= cols ? text.trimEnd() : text;
          })
          .join("\n"),
      );
    }

    function visibleSpansForSelectionRange(
      providerRange: TerminalSelectionRange,
      _screenRange: TerminalSelectionRange,
    ): readonly SelectedRowSpan[] {
      const r = normalizedRect();
      const { x: clipX, y: clipY } = clipOffsets();
      const cols = Math.max(1, Math.floor(props.w));
      const top = internalScrollTop.value + clipY;
      const bottom = top + r.h;

      const providerSpans = terminalSelectionVisibleRowSpans(
        providerRange,
        cols,
        rows.value.length,
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

    function onKeydown(event: TerminalKeyboardEvent): void {
      emit("keydown", event);
      const page = Math.max(1, normalizedRect().h);
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value - 1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value + 1);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value - page);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        setScrollTop(internalScrollTop.value + page);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setScrollTop(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setScrollTop(maxScrollTop());
      }
    }

    const selectionTextProvider: SelectionTextProvider = {
      id: `TVirtualMarkdown:${instance?.uid ?? "unknown"}:selection-text`,
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
        click: (event: TerminalPointerEvent) => {
          if (!props.imageActions) return;
          const r = normalizedRect();
          const { x: clipX, y: clipY } = clipOffsets();
          const hit = findMarkdownImageActionAt(
            rows.value,
            { cellX: event.cellX, cellY: event.cellY },
            {
              screenRect: r,
              rowOffset: internalScrollTop.value + clipY,
              clipStart: clipX,
            },
          );
          if (!hit) return;
          event.preventDefault();
          emit("imageAction", hit);
        },
        wheel: (event: any) => {
          const { deltaY, mode } = getWheelScrollInput(event);
          if (!deltaY) return;
          const now =
            typeof event.time === "number"
              ? event.time
              : typeof event.timeStamp === "number"
                ? event.timeStamp
                : Date.now();
          const { nextTop, dir } = applyWheelScroll(
            wheelState,
            deltaY,
            internalScrollTop.value,
            maxScrollTop(),
            now,
            mode,
            { disableAcceleration: mode === "pixel" },
          );
          if (!dir || nextTop === internalScrollTop.value) return;
          event.preventDefault?.();
          setScrollTop(nextTop);
        },
        focus: () => {
          emit("focus");
        },
        blur: () => {
          emit("blur");
        },
        keydown: onKeydown,
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus || !visible.value) return;
      const manager = events.value;
      const nodeId = eventNode.id.value;
      if (!nodeId) return;
      if (!manager) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    onBeforeUnmount(() => {
      alive = false;
      rebuildVersion++;
      unsubscribeGraphicsOutput();
      clearMarkdownImageGraphics(terminal, fullRect.value);
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? normalizedRect() : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        internalScrollTop.value,
        props.style,
        defaultStyle.value,
        documentVersion.value,
        graphicsOutputVersion.value,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) return;
          const r = normalizedRect();
          if (r.w <= 0 || r.h <= 0) return;
          const baseStyle = props.style ?? defaultStyle.value;
          const { x: clipX, y: clipY } = clipOffsets();
          const keepGraphicIds = collectVisibleMarkdownImageGraphicIds(rows.value, {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            rowOffset: internalScrollTop.value + clipY,
            clipStart: clipX,
          });
          const paintRow = (y: number) => {
            if (y < r.y || y >= r.y + r.h) return;
            const visualIndex = internalScrollTop.value + clipY + (y - r.y);
            paintMarkdownVisualRow(terminal, rows.value[visualIndex], {
              x: r.x,
              y,
              w: r.w,
              clipStart: clipX,
              baseStyle,
              clear: true,
              keepGraphicIds,
            });
          };
          if (dirtyRows?.length) {
            for (const y of dirtyRows) paintRow(y);
            return;
          }
          for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
        });
      },
    }));

    return () => h("span", rootProps);
  },
});
