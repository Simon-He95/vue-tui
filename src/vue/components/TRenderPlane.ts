import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import { defineComponent, inject, provide, toRef } from "vue";
import { getPlaneTerminal } from "../../core/terminal/create-terminal.js";
import { RenderPlaneContextKey, TerminalContextKey } from "../context.js";

export const TRenderPlane = defineComponent({
  name: "TRenderPlane",
  props: {
    plane: {
      type: String as PropType<TerminalRenderPlane>,
      default: "default",
    },
  },
  setup(props, { slots }) {
    const parentCtx = inject(TerminalContextKey, null);
    if (!parentCtx) throw new Error("TRenderPlane is missing TerminalContext");

    const planeRef = toRef(props, "plane") as any;
    const terminal = getPlaneTerminal(parentCtx.terminal, props.plane);
    const scheduler = {
      invalidate: (options?: {
        priority?: "high" | "normal" | "low";
        plane?: TerminalRenderPlane;
      }) =>
        parentCtx.scheduler.invalidate({
          ...options,
          plane: options?.plane ?? props.plane,
        }),
      flush: () => parentCtx.scheduler.flush(),
      flushNow: () => parentCtx.scheduler.flushNow(),
    } as const;
    const runtime = {
      mount: (
        component: any,
        runtimeProps: Record<string, unknown>,
        options?: Readonly<{ plane?: TerminalRenderPlane }>,
      ) =>
        parentCtx.runtime.mount(component, runtimeProps, {
          plane: options?.plane ?? props.plane,
        }),
    } as const;

    provide(RenderPlaneContextKey, planeRef);
    provide(TerminalContextKey, {
      ...parentCtx,
      terminal,
      scheduler,
      runtime,
    });

    return () => slots.default?.() ?? null;
  },
});
