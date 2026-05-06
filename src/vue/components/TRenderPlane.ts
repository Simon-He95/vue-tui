import type { PropType } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { TerminalFrameContext, TerminalSchedulerInvalidateOptions } from "../context.js";
import { defineComponent, inject, provide, ref, watch } from "vue";
import { getPlaneTerminal } from "../../core/terminal/create-terminal.js";
import { RenderPlaneContextKey, TerminalContextKey } from "../context.js";

function warnDev(message: string): void {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}

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

    const initialPlane = props.plane;
    const planeRef = ref<TerminalRenderPlane>(initialPlane);
    const terminal = getPlaneTerminal(parentCtx.terminal, initialPlane);
    let warnedPlaneMutation = false;
    watch(
      () => props.plane,
      (next) => {
        if (next === initialPlane || warnedPlaneMutation) return;
        warnedPlaneMutation = true;
        warnDev(
          `[vue-tui] TRenderPlane.plane is immutable after mount: ${initialPlane} -> ${next}. ` +
            `Key TRenderPlane by plane if you need to move a subtree.`,
        );
      },
    );
    const withPlane = (
      plane: TerminalRenderPlane,
      options?: TerminalSchedulerInvalidateOptions,
    ) => {
      const hasPlane = options && Object.prototype.hasOwnProperty.call(options, "plane");
      return {
        ...options,
        plane: hasPlane ? options.plane : plane,
      };
    };
    const scheduler = {
      invalidate: (options?: TerminalSchedulerInvalidateOptions) =>
        parentCtx.scheduler.invalidate(withPlane(initialPlane, options)),
      flush: () => parentCtx.scheduler.flush(),
      flushNow: () => parentCtx.scheduler.flushNow(),
      configure: (options: Parameters<typeof parentCtx.scheduler.configure>[0]) =>
        parentCtx.scheduler.configure(options),
      // Frame task ids remain scheduler-global even inside TRenderPlane.
      // Components should include plane/instance information in their ids
      // when they need isolation across planes.
      queueFrameTask: (task: Parameters<typeof parentCtx.scheduler.queueFrameTask>[0]) => {
        const queuedPlane = initialPlane;
        return parentCtx.scheduler.queueFrameTask({
          ...task,
          run: (ctx: TerminalFrameContext) =>
            task.run({
              ...ctx,
              invalidate: (options) => ctx.invalidate(withPlane(queuedPlane, options)),
              reportDroppedUpdates: (count) => ctx.reportDroppedUpdates?.(count),
              reportMailboxDeliveryAttempt: (attempt) =>
                ctx.reportMailboxDeliveryAttempt?.(attempt),
            }),
        });
      },
      // Cancellation uses the same scheduler-global id space as queueFrameTask.
      cancelFrameTask: (id: string) => parentCtx.scheduler.cancelFrameTask?.(id),
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
          plane: options?.plane ?? initialPlane,
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
