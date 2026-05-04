import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/index.js";
import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  markRaw,
  onBeforeUnmount,
  shallowRef,
  watch,
} from "vue";
import { buildMarkdownVisualRows } from "../markdown/document.js";
import { createTuiMarkdownParser } from "../markdown/parser.js";
import { paintMarkdownVisualRow } from "../markdown/render.js";
import type { TuiMarkdownThemeOverrides } from "../markdown/theme.js";
import type { TuiMarkdownVisualRow } from "../markdown/types.js";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { intersectRect, translateRect } from "../utils/rect.js";

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
  },
  setup(props) {
    const instance = getCurrentInstance();
    const { terminal, defaultStyle, scheduler } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
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
        buildMarkdownVisualRows(props.content, props.w, parser.value, {
          final: props.final,
          theme: props.theme,
        }),
      );
      documentVersion.value++;
    }

    function scheduleRebuild(): void {
      const currentVersion = ++rebuildVersion;
      if (!builtOnce) {
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
        () => props.theme,
      ],
      () => {
        scheduleRebuild();
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      alive = false;
      rebuildVersion++;
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
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        const full = fullRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const baseStyle = props.style ?? defaultStyle.value;
        const clipStart = Math.max(0, Math.floor(r.x - full.x));
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
          });
        };
        if (dirtyRows?.length) {
          for (const y of dirtyRows) paintRow(y);
          return;
        }
        for (let y = r.y; y < r.y + r.h; y++) paintRow(y);
      },
    }));

    return () => h("span", rootProps);
  },
});
