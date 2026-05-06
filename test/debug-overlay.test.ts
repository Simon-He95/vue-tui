import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createTerminalApp,
  TDebugOverlay,
  useTerminal,
  type FramePerfStore,
} from "../src/index.js";

describe("TDebugOverlay", () => {
  it("shows the latest frame perf sample", () => {
    const SeedFramePerf = defineComponent({
      name: "SeedFramePerf",
      setup() {
        const { observability } = useTerminal();
        observability.framePerf.enabled.value = true;
        observability.framePerf.push({
          frameId: 1,
          reason: "scroll",
          startedAt: 0,
          durationMs: 6.4,
          renderManagerMs: 2.1,
          commitMs: 0.8,
          domFlushMs: 1.2,
          dirtyRows: 1,
          activePlanes: ["default"],
          scannedNodes: 3,
          paintedNodes: 2,
          coalescedInvalidates: 4,
          frameTaskCount: 1,
          coalescedFrameTasks: 3,
          frameTaskQueueDepthBeforeRun: 4,
          frameTaskQueueDepthAfterRun: 0,
          remainingFrameTasks: 0,
          droppedUpdates: 0,
          queueDepth: 0,
        });
        return () => null;
      },
    });

    const App = defineComponent({
      name: "DebugOverlayFramePerfApp",
      setup() {
        return () => [h(SeedFramePerf), h(TDebugOverlay, { panel: true })];
      },
    });

    const app = createTerminalApp({ cols: 52, rows: 16, component: App as any });
    try {
      app.mount();
      app.scheduler.flushNow();
      const text = app.terminal.snapshot().lines.join("\n");

      expect(text).toContain("frame: 6.4ms");
      expect(text).toContain("reason: scroll");
      expect(text).toContain("dirtyRows: 1");
      expect(text).toContain("scannedNodes: 3");
      expect(text).toContain("paintedNodes: 2");
      expect(text).toContain("domFlush: 1.2ms");
      expect(text).toContain("coalescedInvalidates: 4");
      expect(text).toContain("frameTasks: 1 queue:4->0");
      expect(text).toContain("coalescedTasks: 3");
      expect(text).toContain("queueDepth: 0");
    } finally {
      app.dispose();
    }
  });

  it("does not create a self-sustaining frame loop when showing frame perf", async () => {
    vi.useFakeTimers();
    let framePerf: FramePerfStore | null = null;

    const ExposeFramePerf = defineComponent({
      name: "ExposeFramePerf",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "DebugOverlayNoLoopApp",
      setup() {
        return () => [h(ExposeFramePerf), h(TDebugOverlay, { panel: true })];
      },
    });

    const app = createTerminalApp({ cols: 52, rows: 16, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      framePerf!.clear();

      framePerf!.push({
        frameId: 1,
        reason: "scroll",
        startedAt: 0,
        durationMs: 6,
        renderManagerMs: 2,
        commitMs: 1,
        dirtyRows: 1,
        activePlanes: ["default"],
        scannedNodes: 1,
        paintedNodes: 1,
        coalescedInvalidates: 0,
        frameTaskCount: 0,
        coalescedFrameTasks: 0,
        frameTaskQueueDepthBeforeRun: 0,
        frameTaskQueueDepthAfterRun: 0,
        remainingFrameTasks: 0,
        droppedUpdates: 0,
        queueDepth: 0,
      });

      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await nextTick();
      vi.advanceTimersByTime(50);
      await Promise.resolve();
      await nextTick();
      const afterRefresh = framePerf!.list().length;
      expect(afterRefresh).toBeGreaterThanOrEqual(1);
      expect(afterRefresh).toBeLessThanOrEqual(2);

      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await nextTick();
      expect(framePerf!.list().length).toBe(afterRefresh);
    } finally {
      app.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps frame perf enabled until all overlay leases are released", async () => {
    const showA = ref(true);
    const showB = ref(true);
    let framePerf: FramePerfStore | null = null;

    const ExposeFramePerf = defineComponent({
      name: "ExposeFramePerf",
      setup() {
        framePerf = useTerminal().observability.framePerf;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "DebugOverlayLeaseApp",
      setup() {
        return () => [
          h(ExposeFramePerf),
          showA.value ? h(TDebugOverlay, { key: "a", panel: true }) : null,
          showB.value ? h(TDebugOverlay, { key: "b", panel: true }) : null,
        ];
      },
    });

    const app = createTerminalApp({ cols: 52, rows: 16, component: App as any });
    try {
      app.mount();
      await nextTick();
      expect(framePerf!.enabled.value).toBe(true);

      showA.value = false;
      await nextTick();
      expect(framePerf!.enabled.value).toBe(true);

      showB.value = false;
      await nextTick();
      expect(framePerf!.enabled.value).toBe(false);
    } finally {
      app.dispose();
    }
  });
});
