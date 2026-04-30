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
    state.plane = state.plane == null || state.plane === plane ? plane : null;
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
    scheduler.invalidate(
      queuedPlane || queuedPriority !== "normal"
        ? {
            plane: queuedPlane ?? undefined,
            priority: queuedPriority,
          }
        : undefined,
    );
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
    lastPlane.value = plane.value;
    if (!stack) return;
    if (!id.value) {
      const node: RenderNode = render.register({
        stack,
        zIndex: opt.zIndex,
        rect: opt.rect,
        plane: plane.value,
        paint: opt.paint,
      });
      id.value = node.id;
      requestBatchedInvalidate(scheduler, plane.value, opt.priority ?? "normal");
      return;
    }
    render.update(id.value, {
      stack,
      zIndex: opt.zIndex ?? 0,
      rect: opt.rect ?? null,
      dirtyRowsHint: opt.dirtyRowsHint,
      plane: plane.value,
      paint: opt.paint,
    });
    requestBatchedInvalidate(scheduler, plane.value, opt.priority ?? "normal");
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
