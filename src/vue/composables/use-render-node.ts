import type { Ref } from "vue";
import type { TerminalRenderPlane } from "../../core/render-plane.js";
import type { TerminalSchedulerPriority } from "../context.js";
import type { RenderNode, RenderRect, RenderStack } from "../render/render-manager.js";
import { computed, inject, onBeforeUnmount, ref, watchEffect } from "vue";
import { RenderPlaneContextKey } from "../context.js";
import { useRenderStack } from "./use-render-stack.js";
import { useTerminal } from "./use-terminal.js";
import { withTextWidthProvider } from "../utils/text.js";

export interface RenderNodeOptions {
  /**
   * Whether this node is registered at all. `false` unregisters it and skips
   * its paint work; the node registers again when this becomes true. Use it
   * for overlays that must not allocate or compute anything until they open.
   */
  enabled?: boolean;
  /** Render plane for this node; defaults to the surrounding plane context. */
  plane?: TerminalRenderPlane;
  zIndex?: number;
  stack?: RenderStack;
  rect?: RenderRect | null;
  /**
   * One-shot absolute terminal rows for row-local content changes on this node's plane only.
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

function sameRenderRect(a: RenderRect | null | undefined, b: RenderRect | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function sameDeps(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function useRenderNode(getOptions: () => RenderNodeOptions): {
  id: Ref<string | null>;
} {
  const { scheduler, render, widthProvider } = useTerminal();
  const parentStack = useRenderStack();
  const plane = inject(RenderPlaneContextKey, ref("default")) as Ref<TerminalRenderPlane>;
  const id = ref<string | null>(null);
  const lastPlane = ref<TerminalRenderPlane>(plane.value);
  let lastStack: RenderStack | null = null;
  let lastZIndex = 0;
  let lastHasRect = false;
  let lastRect: RenderRect | null = null;
  let lastDeps: unknown;
  let lastHasDeps = false;

  const options = computed(() => withTextWidthProvider(widthProvider, getOptions));

  const stop = watchEffect(
    () => {
      const opt = options.value;
      if (opt.enabled === false) {
        if (!id.value) return;
        render.unregister(id.value);
        id.value = null;
        lastStack = null;
        lastZIndex = 0;
        lastHasRect = false;
        lastRect = null;
        lastHasDeps = false;
        lastDeps = undefined;
        requestBatchedInvalidate(scheduler, lastPlane.value, opt.priority ?? "normal");
        return;
      }
      void opt.deps;
      const stack = opt.stack ?? parentStack.value;
      const nextPlane = opt.plane ?? plane.value;
      const hasRect = Object.prototype.hasOwnProperty.call(opt, "rect");
      const nextRect = hasRect ? (opt.rect ?? null) : null;
      const nextZIndex = opt.zIndex ?? 0;
      const hasDeps = Object.prototype.hasOwnProperty.call(opt, "deps");
      if (!stack) return;
      if (!id.value) {
        const node: RenderNode = render.register({
          stack,
          zIndex: nextZIndex,
          rect: hasRect ? nextRect : undefined,
          plane: nextPlane,
          paint: opt.paint,
        });
        id.value = node.id;
        lastPlane.value = nextPlane;
        lastStack = stack;
        lastZIndex = nextZIndex;
        lastHasRect = hasRect;
        lastRect = nextRect;
        lastHasDeps = hasDeps;
        lastDeps = opt.deps;
        requestBatchedInvalidate(scheduler, nextPlane, opt.priority ?? "normal");
        return;
      }
      const prevPlane = lastPlane.value;
      if (
        hasDeps &&
        lastHasDeps &&
        !opt.dirtyRowsHint?.length &&
        lastStack === stack &&
        lastZIndex === nextZIndex &&
        prevPlane === nextPlane &&
        lastHasRect === hasRect &&
        (!hasRect || sameRenderRect(lastRect, nextRect)) &&
        sameDeps(lastDeps, opt.deps)
      ) {
        return;
      }

      const updatePayload: Parameters<typeof render.update>[1] = {
        stack,
        zIndex: nextZIndex,
        dirtyRowsHint: opt.dirtyRowsHint,
        plane: nextPlane,
        paint: opt.paint,
      };
      if (hasRect) updatePayload.rect = nextRect;
      render.update(id.value, updatePayload);
      lastPlane.value = nextPlane;
      lastStack = stack;
      lastZIndex = nextZIndex;
      lastHasRect = hasRect;
      lastRect = nextRect;
      lastHasDeps = hasDeps;
      lastDeps = opt.deps;
      const priority = opt.priority ?? "normal";
      requestBatchedInvalidate(scheduler, prevPlane, priority);
      if (prevPlane !== nextPlane) requestBatchedInvalidate(scheduler, nextPlane, priority);
    },
    { flush: "sync" },
  );

  onBeforeUnmount(() => {
    stop();
    if (id.value) {
      render.unregister(id.value);
      requestBatchedInvalidate(scheduler, lastPlane.value, "normal");
    }
  });

  return { id };
}
