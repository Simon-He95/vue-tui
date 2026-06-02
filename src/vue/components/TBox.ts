import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { Rect } from "../../events/manager/types.js";
import type { LayoutContext } from "../context.js";
import { computed, defineComponent, h, inject, provide, shallowReactive, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderNode } from "../composables/use-render-node.js";
import { useRenderStack } from "../composables/use-render-stack.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, LayoutContextKey } from "../context.js";
import { RenderStackKey } from "../render/context.js";
import { intersectRect, translateRect } from "../utils/rect.js";
import { repeatChar, sanitizeInlineText, sliceByCells } from "../utils/text.js";

const BORDER = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│",
};

const BOX_BACKGROUND_Z = -1;
const BOX_BORDER_Z = 1_000_000;

export const TBox = defineComponent({
  name: "TBox",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    border: { type: Boolean, default: true },
    title: { type: String, default: "" },
    padding: { type: Number, default: 0 },
    scrollX: { type: Number, default: 0 },
    scrollY: { type: Number, default: 0 },
    style: { type: Object as PropType<Style>, default: undefined },
    titleStyle: { type: Object as PropType<Style>, default: undefined },
    clear: { type: Boolean, default: true },
  },
  emits: ["pointerenterCapture", "pointerenter", "pointerleaveCapture", "pointerleave"],
  setup(props, { emit, slots }) {
    const { terminal, defaultStyle, render } = useTerminal();
    const parent = useLayout();
    const parentStack = useRenderStack();
    const { visible, rootProps } = useVisibility({ provide: true });
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const absRect = computed<Rect>(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, parent.originX, parent.originY);
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });

    const stack = computed(() => render.createStack(parentStack.value, props.zIndex));

    const contentLayout = shallowReactive<LayoutContext>({
      originX: 0,
      originY: 0,
      clipRect: null,
    });

    useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: false,
      handlers: {
        pointerenterCapture: (e) => emit("pointerenterCapture", e),
        pointerenter: (e) => emit("pointerenter", e),
        pointerleaveCapture: (e) => emit("pointerleaveCapture", e),
        pointerleave: (e) => emit("pointerleave", e),
      },
    }));

    function drawBorder(
      r: Rect,
      style: Style,
      titleStyle: Style | undefined,
      dirtyRows?: readonly number[] | null,
    ): void {
      const w = Math.max(0, Math.floor(r.w));
      const h = Math.max(0, Math.floor(r.h));
      if (!props.border || w < 2 || h < 2) return;
      const x0 = Math.floor(r.x);
      const y0 = Math.floor(r.y);
      const x1 = x0 + w - 1;
      const y1 = y0 + h - 1;
      const innerW = Math.max(0, w - 2);

      const drawTop = () => {
        terminal.write(`${BORDER.tl}${repeatChar(BORDER.h, innerW)}${BORDER.tr}`, {
          x: x0,
          y: y0,
          style,
        });
        if (props.title) {
          const max = Math.max(0, w - 4);
          const safe = sanitizeInlineText(props.title);
          const title = sliceByCells(safe, max);
          const ts = titleStyle ?? style;
          terminal.write(` ${title} `, { x: x0 + 1, y: y0, style: ts });
        }
      };

      const drawBottom = () => {
        terminal.write(`${BORDER.bl}${repeatChar(BORDER.h, innerW)}${BORDER.br}`, {
          x: x0,
          y: y1,
          style,
        });
      };

      const drawMiddleRow = (y: number) => {
        terminal.put(x0, y, BORDER.v, style);
        terminal.put(x1, y, BORDER.v, style);
      };

      if (!dirtyRows) {
        drawTop();
        drawBottom();
        for (let y = y0 + 1; y < y1; y++) drawMiddleRow(y);
        return;
      }

      for (const y of dirtyRows) {
        if (y < y0 || y > y1) continue;
        if (y === y0) drawTop();
        else if (y === y1) drawBottom();
        else drawMiddleRow(y);
      }
    }

    function drawClear(r: Rect, style: Style, dirtyRows?: readonly number[] | null): void {
      if (!props.clear) return;
      // Only carry bg into the fill — fg/dim/bold from border styles must not
      // bleed into the content padding zone.
      const bgOnly: Style = style.bg ? { bg: style.bg } : {};
      if (!dirtyRows) {
        terminal.fill(r.x, r.y, r.w, r.h, " ", bgOnly);
        return;
      }
      const y0 = Math.floor(r.y);
      const y1 = y0 + Math.max(0, Math.floor(r.h));
      for (const y of dirtyRows) {
        if (y < y0 || y >= y1) continue;
        terminal.fill(r.x, y, r.w, 1, " ", bgOnly);
      }
    }

    watchEffect(() => {
      const r = absRect.value;
      const borderInset = props.border ? 1 : 0;
      const requestedPad = Math.max(0, Math.floor(props.padding));
      const maxPadX = Math.max(0, Math.floor((r.w - borderInset * 2 - 1) / 2));
      const maxPadY = Math.max(0, Math.floor((r.h - borderInset * 2 - 1) / 2));
      const pad = Math.min(requestedPad, maxPadX, maxPadY);
      const content = {
        x: r.x + borderInset + pad,
        y: r.y + borderInset + pad,
        w: Math.max(0, r.w - borderInset * 2 - pad * 2),
        h: Math.max(0, r.h - borderInset * 2 - pad * 2),
      };
      let contentRect: Rect | null = intersectRect(content, r);
      if (parent.clipRect && contentRect) contentRect = intersectRect(contentRect, parent.clipRect);
      if (!contentRect) contentRect = { x: 0, y: 0, w: 0, h: 0 };

      contentLayout.originX = content.x - Math.floor(props.scrollX);
      contentLayout.originY = content.y - Math.floor(props.scrollY);
      contentLayout.clipRect = contentRect;
    });

    useRenderNode(() => ({
      stack: stack.value,
      zIndex: BOX_BACKGROUND_Z,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [visible.value, absRect.value, props.style, props.clear, defaultStyle.value],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        const style = props.style ?? defaultStyle.value;
        drawClear(r, style, dirtyRows ?? null);
      },
    }));

    useRenderNode(() => ({
      stack: stack.value,
      zIndex: BOX_BORDER_Z,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.border,
        props.title,
        props.style,
        props.titleStyle,
        defaultStyle.value,
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        const style = props.style ?? defaultStyle.value;
        drawBorder(r, style, props.titleStyle, dirtyRows ?? null);
      },
    }));

    provide(LayoutContextKey, contentLayout);
    provide(RenderStackKey, stack as any);
    provide(EventZIndexContextKey, eventZ as any);
    return () => h("div", rootProps, slots.default?.());
  },
});
