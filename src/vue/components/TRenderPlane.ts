import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { TerminalFrameContext, TerminalSchedulerInvalidateOptions } from "../context.js";
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
    const withPlane = (options?: TerminalSchedulerInvalidateOptions) => {
      const hasPlane = options && Object.prototype.hasOwnProperty.call(options, "plane");
      return {
        ...options,
        plane: hasPlane ? options.plane : props.plane,
      };
    };
    const scheduler = {
      invalidate: (options?: TerminalSchedulerInvalidateOptions) =>
        parentCtx.scheduler.invalidate(withPlane(options)),
      flush: () => parentCtx.scheduler.flush(),
      flushNow: () => parentCtx.scheduler.flushNow(),
      configure: (options: Parameters<typeof parentCtx.scheduler.configure>[0]) =>
        parentCtx.scheduler.configure(options),
      queueFrameTask: (task: Parameters<typeof parentCtx.scheduler.queueFrameTask>[0]) =>
        parentCtx.scheduler.queueFrameTask({
          ...task,
          run: (ctx: TerminalFrameContext) =>
            task.run({
              ...ctx,
              invalidate: (options) => ctx.invalidate(withPlane(options)),
            }),
        }),
      requestLive: (reason: string) => parentCtx.scheduler.requestLive(reason),
      dropLive: (reason: string) => parentCtx.scheduler.dropLive(reason),
      isInsideFrame: () => parentCtx.scheduler.isInsideFrame(),
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
