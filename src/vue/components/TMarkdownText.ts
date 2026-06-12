import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect, TerminalPointerEvent } from "../../events/manager/types.js";
import {
  getTerminalGraphicsOutputVersion,
  subscribeTerminalGraphicsOutput,
} from "../../renderer/terminal-graphics.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  markRaw,
  onBeforeUnmount,
  shallowRef,
  watch,
} from "vue";
import { buildMarkdownVisualRows } from "../markdown/document.js";
import { findMarkdownImageActionAt } from "../markdown/image-actions.js";
import { findMarkdownLinkActionAt } from "../markdown/link-actions.js";
import { findMarkdownMathActionAt } from "../markdown/math-actions.js";
import { createTuiMarkdownParser } from "../markdown/parser.js";
import {
  clearMarkdownImageGraphics,
  collectVisibleMarkdownImageGraphicIds,
  paintMarkdownVisualRow,
} from "../markdown/render.js";
import { markdownThemeSignature, type TuiMarkdownThemeOverrides } from "../markdown/theme.js";
import type {
  TuiMarkdownGraphicSegment,
  TuiMarkdownImageActionPayload,
  TuiMarkdownLinkActionPayload,
  TuiMarkdownMathActionPayload,
  TuiMarkdownVisualRow,
} from "../markdown/types.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey } from "../context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { withTextWidthProvider } from "../utils/text.js";

export const TMarkdownText = defineComponent({
  name: "TMarkdownText",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    content: { type: String, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    final: { type: Boolean, default: true },
    streaming: { type: Boolean, default: false },
    clear: { type: Boolean, default: true },
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
    mathActions: { type: Boolean, default: false },
    linkActions: { type: Boolean, default: false },
    imageOcclusionRects: {
      type: Array as PropType<readonly Rect[]>,
      default: undefined,
    },
  },
  emits: {
    imageAction: (_payload: TuiMarkdownImageActionPayload) => true,
    mathAction: (_payload: TuiMarkdownMathActionPayload) => true,
    linkAction: (_payload: TuiMarkdownLinkActionPayload) => true,
  },
  setup(props, { emit }) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, scheduler, widthProvider } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const rows = shallowRef<readonly TuiMarkdownVisualRow[]>(markRaw([]));
    const documentVersion = shallowRef(0);
    let builtOnce = false;
    let rebuildVersion = 0;
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
      rows.value = markRaw(
        withTextWidthProvider(widthProvider, () =>
          buildMarkdownVisualRows(props.content, props.w, parser.value, {
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
          }),
        ),
      );
      documentVersion.value++;
    }

    function scheduleRebuild(): void {
      const currentVersion = ++rebuildVersion;
      if (!builtOnce || !props.streaming) {
        builtOnce = true;
        rebuildRows();
        return;
      }
      scheduler.queueFrameTask({
        id: `TMarkdownText:${instance?.uid ?? "unknown"}:markdown`,
        reason: props.streaming ? "stream" : "data",
        priority: props.streaming ? "low" : "normal",
        sync: false,
        run: () => {
          if (!alive) return;
          if (currentVersion !== rebuildVersion) return;
          // Let rows/documentVersion flow through useRenderNode first so any rect
          // changes (especially auto-height) are observed before the scheduler
          // decides what region to flush.
          rebuildRows();
        },
      });
    }

    watch(
      [
        () => props.content,
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

    onBeforeUnmount(() => {
      alive = false;
      rebuildVersion++;
      unsubscribeGraphicsOutput();
      clearMarkdownImageGraphics(terminal, fullRect.value);
    });

    const fullRect = computed<Rect>(() => {
      const height = props.h ?? Math.max(1, rows.value.length);
      return translateRect(
        { x: props.x, y: props.y, w: props.w, h: height },
        layout.originX,
        layout.originY,
      );
    });

    const absRect = computed<Rect>(() => {
      const translated = fullRect.value;
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    function imageActionAt(event: TerminalPointerEvent) {
      const r = absRect.value;
      const full = fullRect.value;
      return findMarkdownImageActionAt(
        rows.value,
        { cellX: event.cellX, cellY: event.cellY },
        {
          screenRect: r,
          rowOffset: Math.max(0, Math.floor(r.y - full.y)),
          clipStart: Math.max(0, Math.floor(r.x - full.x)),
        },
      );
    }

    function linkActionAt(event: TerminalPointerEvent) {
      const r = absRect.value;
      const full = fullRect.value;
      return findMarkdownLinkActionAt(
        rows.value,
        { cellX: event.cellX, cellY: event.cellY },
        {
          screenRect: r,
          rowOffset: Math.max(0, Math.floor(r.y - full.y)),
          clipStart: Math.max(0, Math.floor(r.x - full.x)),
        },
      );
    }

    function mathActionAt(event: TerminalPointerEvent) {
      const r = absRect.value;
      const full = fullRect.value;
      return findMarkdownMathActionAt(
        rows.value,
        { cellX: event.cellX, cellY: event.cellY },
        {
          screenRect: r,
          rowOffset: Math.max(0, Math.floor(r.y - full.y)),
          clipStart: Math.max(0, Math.floor(r.x - full.x)),
        },
      );
    }

    useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value && (props.imageActions || props.mathActions || props.linkActions),
      focusable: false,
      selectable: false,
      handlers: {
        click: (event: TerminalPointerEvent) => {
          if (props.imageActions) {
            const hit = imageActionAt(event);
            if (hit) {
              event.preventDefault();
              emit("imageAction", hit);
              return;
            }
          }
          if (props.mathActions) {
            const math = mathActionAt(event);
            if (math) {
              event.preventDefault();
              emit("mathAction", math);
              return;
            }
          }
          if (!props.linkActions) return;
          const link = linkActionAt(event);
          if (!link) return;
          event.preventDefault();
          emit("linkAction", link);
        },
      },
    }));

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.style,
        props.clear,
        documentVersion.value,
        graphicsOutputVersion.value,
        defaultStyle.value,
        props.imageOcclusionRects,
      ],
      paint: (dirtyRows) => {
        withTextWidthProvider(widthProvider, () => {
          if (!visible.value) return;
          const r = absRect.value;
          const full = fullRect.value;
          if (r.w <= 0 || r.h <= 0) return;
          const baseStyle = props.style ?? defaultStyle.value;
          const clipStart = Math.max(0, Math.floor(r.x - full.x));
          const rowOffset = Math.max(0, Math.floor(r.y - full.y));
          const isGraphicCovered = (
            rect: Readonly<{ x: number; y: number; w: number; h: number }>,
          ) => {
            return props.imageOcclusionRects?.some((item) => intersectRect(rect, item)) === true;
          };
          const keepGraphicIds = collectVisibleMarkdownImageGraphicIds(rows.value, {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            rowOffset,
            clipStart,
            isGraphicCovered,
          });
          const paintRow = (y: number) => {
            if (y < r.y || y >= r.y + r.h) return;
            const rowIndex = Math.floor(y - full.y);
            const row = rows.value[rowIndex];
            if (!row && !props.clear) return;
            paintMarkdownVisualRow(terminal, row, {
              x: r.x,
              y,
              w: r.w,
              clipStart,
              baseStyle,
              clear: props.clear,
              keepGraphicIds,
              isGraphicCovered,
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
