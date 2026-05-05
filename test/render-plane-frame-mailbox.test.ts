import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp, TRenderPlane, TText, useTerminal } from "../src/index.js";
import { createFrameMailbox } from "../src/vue/scheduler/frame-mailbox.js";

function installRaf() {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let rafId = 0;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = ++rafId;
    callbacks.set(id, cb);
    return id;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    callbacks.delete(id);
  }) as typeof cancelAnimationFrame;

  return {
    callbacks,
    runNext(time = 0): boolean {
      const next = callbacks.entries().next().value;
      if (!next) return false;
      const [id, cb] = next;
      callbacks.delete(id);
      cb(time);
      return true;
    },
    restore() {
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

describe("render-plane frame mailbox", () => {
  it("forwards dropped updates and default invalidation through TRenderPlane", async () => {
    const raf = installRaf();
    let queueBurst!: () => void;
    let framePerf: ReturnType<typeof useTerminal>["observability"]["framePerf"] | null = null;
    const commits: Array<readonly string[] | null> = [];

    const Probe = defineComponent({
      name: "RenderPlaneFramePerfProbe",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        framePerf.enabled.value = true;
        return () => null;
      },
    });

    const PlaneMailboxNode = defineComponent({
      name: "PlaneMailboxNode",
      setup() {
        const { scheduler } = useTerminal();
        const value = ref("plane-0");
        const mailbox = createFrameMailbox<number>({
          scheduler,
          id: "plane-mailbox:dropped",
          reason: "input",
          priority: "high",
          apply(next, ctx) {
            value.value = `plane-${next}`;
            ctx.invalidate();
          },
        });
        queueBurst = () => {
          mailbox.queue(1);
          mailbox.queue(2);
          mailbox.queue(3);
        };
        return () => h(TText, { x: 0, y: 0, value: value.value });
      },
    });

    const App = defineComponent({
      name: "RenderPlaneMailboxApp",
      setup() {
        return () => [
          h(Probe),
          h(TRenderPlane, { plane: "transcript" }, () => [h(PlaneMailboxNode)]),
        ];
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const offCommit = app.terminal.on("commit", ({ planes }) => {
      commits.push(planes);
    });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      commits.length = 0;
      framePerf!.clear();

      queueBurst();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(framePerf!.list()).toContainEqual(
        expect.objectContaining({
          frameTaskCount: 1,
          droppedUpdates: 2,
          remainingFrameTasks: 0,
        }),
      );
      expect(commits.at(-1)).toEqual(["transcript"]);
    } finally {
      offCommit();
      app.dispose();
      raf.restore();
    }
  });

  it("forwards cancelFrameTask through TRenderPlane", async () => {
    const raf = installRaf();
    let queueValue!: () => void;
    let cancel!: () => void;
    const apply = vi.fn();

    const PlaneMailboxNode = defineComponent({
      name: "CancelablePlaneMailboxNode",
      setup() {
        const { scheduler } = useTerminal();
        const mailbox = createFrameMailbox<number>({
          scheduler,
          id: "plane-mailbox:cancel",
          reason: "scroll",
          priority: "high",
          apply(value, ctx) {
            apply(value);
            ctx.invalidate();
          },
        });
        queueValue = () => {
          mailbox.queue(1);
        };
        cancel = () => {
          mailbox.cancel();
        };
        return () => h(TText, { x: 0, y: 0, value: "plane" });
      },
    });

    const App = defineComponent({
      name: "RenderPlaneMailboxCancelApp",
      setup() {
        return () => h(TRenderPlane, { plane: "transcript" }, () => [h(PlaneMailboxNode)]);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      queueValue();
      expect(raf.callbacks.size).toBe(1);

      cancel();
      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(apply).not.toHaveBeenCalled();
    } finally {
      app.dispose();
      raf.restore();
    }
  });

  it("captures the queued plane for default task invalidation", async () => {
    const raf = installRaf();
    const plane = ref<"transcript" | "overlay">("transcript");
    let queueDefaultTask!: () => void;
    let queueExplicitTask!: () => void;
    const value = ref("plane-0");

    const PlaneTaskNode = defineComponent({
      name: "PlaneTaskNode",
      setup() {
        const { scheduler } = useTerminal();
        queueDefaultTask = () => {
          scheduler.queueFrameTask({
            id: "plane-task:default",
            reason: "input",
            priority: "high",
            run(ctx) {
              value.value = "plane-1";
              ctx.invalidate();
            },
          });
        };
        queueExplicitTask = () => {
          scheduler.queueFrameTask({
            id: "plane-task:explicit",
            reason: "input",
            priority: "high",
            run(ctx) {
              value.value = "plane-2";
              ctx.invalidate({ plane: "overlay" });
            },
          });
        };
        return () => h(TText, { x: 0, y: 0, value: `${value.value}:${plane.value}` });
      },
    });

    const App = defineComponent({
      name: "RenderPlaneQueuedPlaneCaptureApp",
      setup() {
        return () => h(TRenderPlane, { plane: plane.value }, () => [h(PlaneTaskNode)]);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const invalidations: Array<string | undefined> = [];
    const originalInvalidate = app.scheduler.invalidate.bind(app.scheduler);
    (app.scheduler as any).invalidate = (options?: { plane?: string }) => {
      invalidations.push(options?.plane);
      return originalInvalidate(options);
    };

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();
      invalidations.length = 0;

      queueDefaultTask();
      plane.value = "overlay";
      await nextTick();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(invalidations).toContain("transcript");

      invalidations.length = 0;
      raf.callbacks.clear();
      queueExplicitTask();
      await nextTick();
      expect(raf.callbacks.size).toBe(1);

      raf.runNext();
      await nextTick();
      app.scheduler.flushNow();

      expect(invalidations).toContain("overlay");
    } finally {
      (app.scheduler as any).invalidate = originalInvalidate;
      app.dispose();
      raf.restore();
    }
  });

  it("warns when TRenderPlane.plane changes after mount", async () => {
    const plane = ref<"transcript" | "overlay">("transcript");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const App = defineComponent({
      name: "RenderPlaneImmutablePlaneApp",
      setup() {
        return () =>
          h(TRenderPlane, { plane: plane.value }, () => [h(TText, { x: 0, y: 0, value: "plane" })]);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      plane.value = "overlay";
      await nextTick();
      app.scheduler.flushNow();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("TRenderPlane.plane is immutable after mount");
    } finally {
      app.dispose();
      warn.mockRestore();
    }
  });

  it("forwards explicit plane undefined through TRenderPlane task invalidation", async () => {
    const raf = installRaf();
    let queueUndefinedTask!: () => void;

    const PlaneTaskNode = defineComponent({
      name: "PlaneUndefinedTaskNode",
      setup() {
        const { scheduler } = useTerminal();
        queueUndefinedTask = () => {
          scheduler.queueFrameTask({
            id: "plane-task:undefined",
            priority: "high",
            run(ctx) {
              ctx.invalidate({ plane: undefined, reason: "input" });
            },
          });
        };
        return () => h(TText, { x: 0, y: 0, value: "plane" });
      },
    });

    const App = defineComponent({
      name: "RenderPlaneUndefinedEscapeApp",
      setup() {
        return () => h(TRenderPlane, { plane: "transcript" }, () => [h(PlaneTaskNode)]);
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 4, component: App });
    const invalidations: Array<string | undefined> = [];
    const originalInvalidate = app.scheduler.invalidate.bind(app.scheduler);
    (app.scheduler as any).invalidate = (options?: { plane?: string }) => {
      invalidations.push(options?.plane);
      return originalInvalidate(options);
    };

    try {
      app.mount();
      app.scheduler.flushNow();
      raf.callbacks.clear();

      queueUndefinedTask();
      expect(raf.callbacks.size).toBe(1);
      raf.runNext();

      expect(invalidations).toContain(undefined);
    } finally {
      (app.scheduler as any).invalidate = originalInvalidate;
      app.dispose();
      raf.restore();
    }
  });
});
