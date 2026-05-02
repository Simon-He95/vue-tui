import type { Ref } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { TerminalSchedulerPriority } from "../context.js";
import type { RenderNode, RenderRect, RenderStack } from "../render/render-manager.js";
import { computed, inject, onBeforeUnmount, ref, watchEffect } from "vue";
import { RenderPlaneContextKey } from "../context.js";
import { useRenderStack } from "./use-render-stack.js";
import { useTerminal } from "./use-terminal.js";

export interface RenderNodeOptions {
  zIndex?: number;
  stack?: RenderStack;
  rect?: RenderRect | null;
  /**
   * One-shot absolute terminal rows for row-local content changes only.
   * Omit this when geometry, z-order, style, data identity, or paint semantics changed.
   */
  dirtyRowsHint?: readonly number[];
  priority?: TerminalSchedulerPriority;
  deps?: unknown;
  paint: (dirtyRows?: readonly number[]) => void;
}

const pendingInvalidateByScheduler = new WeakMap<
  object,
  {
    queued: boolean;
    plane: TerminalRenderPlane | null;
    priority: TerminalSchedulerPriority;
  }
>();

function mergePriority(
  prev: TerminalSchedulerPriority,
  next: TerminalSchedulerPriority,
): TerminalSchedulerPriority {
  if (prev === "high" || next === "high") return "high";
  if (prev === "normal" || next === "normal") return "normal";
  return "low";
}

function requestBatchedInvalidate(
  scheduler: {
    invalidate: (options?: {
      priority?: TerminalSchedulerPriority;
      plane?: TerminalRenderPlane;
    }) => void;
  },
  plane: TerminalRenderPlane,
  priority: TerminalSchedulerPriority,
): void {
  let state = pendingInvalidateByScheduler.get(scheduler as object);
  if (!state) {
    state = { queued: false, plane: null, priority: "low" };
    pendingInvalidateByScheduler.set(scheduler as object, state);
  }
  if (state.queued) {
    if (state.plane !== null && state.plane !== plane) state.plane = null;
    state.priority = mergePriority(state.priority, priority);
    return;
  }
  state.plane = plane;
  state.priority = priority;
  state.queued = true;
  queueMicrotask(() => {
    state!.queued = false;
    const queuedPlane = state!.plane;
    const queuedPriority = state!.priority;
    state!.plane = null;
    state!.priority = "low";
    scheduler.invalidate({
      plane: queuedPlane ?? undefined,
      priority: queuedPriority,
    });
  });
}

export function useRenderNode(getOptions: () => RenderNodeOptions): {
  id: Ref<string | null>;
} {
  const { scheduler, render } = useTerminal();
  const parentStack = useRenderStack();
  const plane = inject(RenderPlaneContextKey, ref("default")) as Ref<TerminalRenderPlane>;
  const id = ref<string | null>(null);
  const lastPlane = ref<TerminalRenderPlane>(plane.value);

  const options = computed(() => getOptions());

  const stop = watchEffect(() => {
    const opt = options.value;
    void opt.deps;
    const stack = opt.stack ?? parentStack.value;
    const nextPlane = plane.value;
    if (!stack) return;
    if (!id.value) {
      const node: RenderNode = render.register({
        stack,
        zIndex: opt.zIndex,
        rect: opt.rect,
        plane: nextPlane,
        paint: opt.paint,
      });
      id.value = node.id;
      lastPlane.value = nextPlane;
      requestBatchedInvalidate(scheduler, nextPlane, opt.priority ?? "normal");
      return;
    }
    const prevPlane = lastPlane.value;
    const updatePayload: Parameters<typeof render.update>[1] = {
      stack,
      zIndex: opt.zIndex ?? 0,
      dirtyRowsHint: opt.dirtyRowsHint,
      plane: nextPlane,
      paint: opt.paint,
    };
    if (Object.prototype.hasOwnProperty.call(opt, "rect")) updatePayload.rect = opt.rect ?? null;
    render.update(id.value, updatePayload);
    lastPlane.value = nextPlane;
    const priority = opt.priority ?? "normal";
    requestBatchedInvalidate(scheduler, prevPlane, priority);
    if (prevPlane !== nextPlane) requestBatchedInvalidate(scheduler, nextPlane, priority);
  });

  onBeforeUnmount(() => {
    stop();
    if (id.value) {
      render.unregister(id.value);
      requestBatchedInvalidate(scheduler, lastPlane.value, "normal");
    }
  });

  return { id };
}
