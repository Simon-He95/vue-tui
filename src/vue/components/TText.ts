import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/index.js";
import { computed, defineComponent, h } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import {
  padEndByCells,
  sanitizeInlineText,
  sanitizeTextBlock,
  sliceByCells,
  sliceByCellsRange,
  spaces,
  textCellWidth,
  wrapByCells,
} from "../utils/text.js";

function fitText(text: string, max: number): string {
  if (max <= 0) return "";
  text = sanitizeInlineText(text);
  return sliceByCells(text, max);
}

function splitLines(text: string): string[] {
  // Preserve explicit newlines, but never emit control characters directly to terminal.write.
  return sanitizeTextBlock(text).split("\n");
}

function computeDefaultWidth(text: string): number {
  const lines = splitLines(text);
  let max = 0;
  for (const line of lines) max = Math.max(max, textCellWidth(line));
  return max;
}

export const TText = defineComponent({
  name: "TText",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    value: { type: String, required: true },
    w: { type: Number, default: undefined },
    h: { type: Number, default: undefined },
    style: { type: Object as PropType<Style>, default: undefined },
    clear: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
    /**
     * Optional key that participates in render-node dependency tracking.
     * Useful for forcing a repaint when the rendered output might change
     * even if `value`, `style`, and geometry are unchanged (e.g. external
     * terminal writes or higher-level virtualized row reuse).
     */
    depsKey: { type: null as any, default: undefined },
  },
  setup(props) {
    const { terminal, defaultStyle } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();

    const defaultWidth = computed(() => computeDefaultWidth(props.value));

    const lines = computed(() => {
      const w = props.w ?? defaultWidth.value;
      if (w <= 0) return [""];
      if (!props.wrap) return splitLines(props.value).map((l) => fitText(l, w));
      // wrapByCells preserves explicit '\n' as hard line breaks.
      const safe = sanitizeTextBlock(props.value);
      return wrapByCells(safe, w).map((l) => fitText(l, w));
    });

    const absRect = computed<Rect>(() => {
      const width = props.w ?? defaultWidth.value;
      const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
      const raw = { x: props.x, y: props.y, w: width, h: height };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const fullRect = computed<Rect>(() => {
      const width = props.w ?? defaultWidth.value;
      const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
      return translateRect(
        { x: props.x, y: props.y, w: width, h: height },
        layout.originX,
        layout.originY,
      );
    });

    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.value,
        props.w,
        props.h,
        props.wrap,
        props.style,
        defaultStyle.value,
        props.depsKey,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const full = fullRect.value;
        const style = props.style ?? defaultStyle.value;
        const blank = props.clear ? spaces(r.w) : "";
        const out = lines.value;

        const dx = Math.max(0, Math.floor(r.x - full.x));
        const fullY = Math.floor(full.y);

        const paintRow = (y: number) => {
          const relY = y - r.y;
          if (relY < 0 || relY >= r.h) return;
          const i = y - fullY;
          if (i < 0 || i >= out.length) {
            if (props.clear) terminal.write(blank, { x: r.x, y, style });
            return;
          }
          const src = out[i] ?? "";
          const clipped = dx > 0 ? sliceByCellsRange(src, dx, dx + r.w) : sliceByCells(src, r.w);
          terminal.write(padEndByCells(clipped, r.w), { x: r.x, y, style });
        };

        if (!dirtyRows) {
          for (let i = 0; i < r.h; i++) paintRow(r.y + i);
          return;
        }

        for (const y of dirtyRows) paintRow(y);
      },
    }));

    return () => h("span", rootProps);
  },
});
