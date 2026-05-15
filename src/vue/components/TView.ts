import type { Rect } from "../../events/manager/types.js";
import type { LayoutContext } from "../context.js";
import type { PropType } from "vue";
import { computed, defineComponent, h, inject, provide, shallowReactive, watchEffect } from "vue";
import { useLayout } from "../composables/use-layout.js";
import { useRenderStack } from "../composables/use-render-stack.js";
import { useTerminalNode } from "../composables/use-terminal-node.js";
import { useTerminal } from "../composables/use-terminal.js";
import { useVisibility } from "../composables/use-visibility.js";
import { EventZIndexContextKey, LayoutContextKey } from "../context.js";
import { RenderStackKey } from "../render/context.js";
import { intersectRect, translateRect } from "../utils/rect.js";

const EMPTY_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });

export const TView = defineComponent({
  name: "TView",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    scrollX: { type: Number, default: 0 },
    scrollY: { type: Number, default: 0 },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
    selectionScrollBy: {
      type: Function as PropType<(deltaRows: number) => boolean | void>,
      default: undefined,
    },
    autoFocus: { type: Boolean, default: false },
  },
  emits: [
    "clickCapture",
    "click",
    "dblclickCapture",
    "dblclick",
    "pointerdownCapture",
    "pointerdown",
    "pointerupCapture",
    "pointerup",
    "pointermoveCapture",
    "pointermove",
    "pointerenterCapture",
    "pointerenter",
    "pointerleaveCapture",
    "pointerleave",
    "wheelCapture",
    "wheel",
    "keydownCapture",
    "keydown",
    "keyupCapture",
    "keyup",
    "focusCapture",
    "focus",
    "blurCapture",
    "blur",
  ],
  setup(props, { emit, slots }) {
    const parent = useLayout();
    const { render, events } = useTerminal();
    const parentStack = useRenderStack();
    const { visible, rootProps } = useVisibility({ provide: true });
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const rawRect = computed<Rect>(() =>
      translateRect(
        { x: props.x, y: props.y, w: props.w, h: props.h },
        parent.originX,
        parent.originY,
      ),
    );

    const rect = computed<Rect>(() => {
      const translated = rawRect.value;
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? EMPTY_RECT;
    });

    const { id } = useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: props.focusable,
      selectable: props.selectable,
      selectionScrollBy: props.selectionScrollBy,
      handlers: {
        clickCapture: (e) => emit("clickCapture", e),
        click: (e) => emit("click", e),
        dblclickCapture: (e) => emit("dblclickCapture", e),
        dblclick: (e) => emit("dblclick", e),
        pointerdownCapture: (e) => emit("pointerdownCapture", e),
        pointerdown: (e) => emit("pointerdown", e),
        pointerupCapture: (e) => emit("pointerupCapture", e),
        pointerup: (e) => emit("pointerup", e),
        pointermoveCapture: (e) => emit("pointermoveCapture", e),
        pointermove: (e) => emit("pointermove", e),
        pointerenterCapture: (e) => emit("pointerenterCapture", e),
        pointerenter: (e) => emit("pointerenter", e),
        pointerleaveCapture: (e) => emit("pointerleaveCapture", e),
        pointerleave: (e) => emit("pointerleave", e),
        wheelCapture: (e) => emit("wheelCapture", e),
        wheel: (e) => emit("wheel", e),
        keydownCapture: (e) => emit("keydownCapture", e),
        keydown: (e) => emit("keydown", e),
        keyupCapture: (e) => emit("keyupCapture", e),
        keyup: (e) => emit("keyup", e),
        focusCapture: (e) => emit("focusCapture", e),
        focus: (e) => emit("focus", e),
        blurCapture: (e) => emit("blurCapture", e),
        blur: (e) => emit("blur", e),
      },
    }));

    watchEffect(() => {
      if (!props.autoFocus) return;
      if (!visible.value) return;
      const manager = events.value;
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });

    const childLayout = shallowReactive<LayoutContext>({
      originX: 0,
      originY: 0,
      clipRect: null,
    });

    const childStack = computed(() => render.createStack(parentStack.value, props.zIndex));

    watchEffect(() => {
      const translated = rawRect.value;
      childLayout.originX = translated.x - Math.floor(props.scrollX);
      childLayout.originY = translated.y - Math.floor(props.scrollY);
      childLayout.clipRect = rect.value;
    });

    provide(LayoutContextKey, childLayout);
    provide(RenderStackKey, childStack as any);
    provide(EventZIndexContextKey, eventZ as any);

    return () => h("div", rootProps, slots.default?.());
  },
});
