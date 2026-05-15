import type { Rect } from "../../events/manager/types.js";
import type { LayoutContext } from "../context.js";
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

export const TAnchor = defineComponent({
  name: "TAnchor",
  props: {
    left: { type: Number, default: undefined },
    top: { type: Number, default: undefined },
    right: { type: Number, default: undefined },
    bottom: { type: Number, default: undefined },
    w: { type: Number, default: undefined },
    h: { type: Number, default: undefined },
    zIndex: { type: Number, default: 0 },
    focusable: { type: Boolean, default: false },
    selectable: { type: Boolean, default: undefined },
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
    const { render } = useTerminal();
    const parentStack = useRenderStack();
    const { visible, rootProps } = useVisibility({ provide: true });
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0) as any);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));

    const rawRect = computed<Rect>(() => {
      const base = parent.clipRect ?? {
        x: parent.originX,
        y: parent.originY,
        w: 0,
        h: 0,
      };

      const left = props.left;
      const right = props.right;
      const top = props.top;
      const bottom = props.bottom;
      const width = props.w;
      const height = props.h;

      let w = width;
      let h = height;

      if (w == null && left != null && right != null) w = base.w - left - right;
      if (h == null && top != null && bottom != null) h = base.h - top - bottom;

      w = Math.max(0, Math.floor(w ?? 0));
      h = Math.max(0, Math.floor(h ?? 0));

      let x = base.x;
      let y = base.y;

      if (left != null) x = base.x + Math.floor(left);
      else if (right != null) x = base.x + base.w - Math.floor(right) - w;

      if (top != null) y = base.y + Math.floor(top);
      else if (bottom != null) y = base.y + base.h - Math.floor(bottom) - h;

      return translateRect({ x, y, w, h }, 0, 0);
    });

    const rect = computed<Rect>(() => {
      const translated = rawRect.value;
      return parent.clipRect
        ? (intersectRect(translated, parent.clipRect) ?? EMPTY_RECT)
        : translated;
    });

    useTerminalNode(() => ({
      rect: rect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: props.focusable,
      selectable: props.selectable,
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

    const childLayout = shallowReactive<LayoutContext>({
      originX: 0,
      originY: 0,
      clipRect: null,
    });

    const childStack = computed(() => render.createStack(parentStack.value, props.zIndex));

    watchEffect(() => {
      const translated = rawRect.value;
      childLayout.originX = translated.x;
      childLayout.originY = translated.y;
      childLayout.clipRect = rect.value;
    });

    provide(LayoutContextKey, childLayout);
    provide(RenderStackKey, childStack as any);
    provide(EventZIndexContextKey, eventZ as any);
    return () => h("div", rootProps, slots.default?.());
  },
});
