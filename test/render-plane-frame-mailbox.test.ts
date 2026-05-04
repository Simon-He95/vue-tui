import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createTerminalApp,
  TRenderPlane,
  TText,
  useTerminal,
} from "../src/index.js";
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
});
