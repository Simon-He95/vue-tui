import assert from "node:assert/strict";
import type { Component } from "vue";
import type { FramePerfReason, FramePerfSample, FramePerfStore } from "../../src/observability.js";
import { defineComponent } from "vue";
import { useTerminal } from "../../src/vue.js";

export type FramePerfProbe = Readonly<{
  component: Component;
  get: () => FramePerfStore;
  clear: () => void;
  latest: () => FramePerfSample | null;
  list: () => FramePerfSample[];
}>;

export function createFramePerfProbe(name = "FramePerfProbe"): FramePerfProbe {
  let framePerf: FramePerfStore | null = null;
  const component = defineComponent({
    name,
    setup() {
      framePerf = useTerminal().observability.framePerf;
      framePerf.enabled.value = true;
      return () => null;
    },
  });

  function get(): FramePerfStore {
    if (!framePerf) throw new Error(`${name} did not mount`);
    return framePerf;
  }

  return {
    component,
    get,
    clear: () => get().clear(),
    latest: () => get().latest(),
    list: () => get().list(),
  };
}

export type ScrollMailboxFrameExpectation = Readonly<{
  reason?: FramePerfReason;
  frameTaskCount?: number;
  droppedUpdates: number;
  viewportHeight?: number;
  paintedNodes?: number;
  maxPaintedNodes?: number;
  maxScannedNodes?: number;
}>;

export function expectScrollMailboxFrame(
  sample: FramePerfSample | null | undefined,
  options: ScrollMailboxFrameExpectation,
): void {
  assert.ok(sample, "expected frame perf sample");
  assert.equal(sample.reason, options.reason ?? "scroll");
  assert.equal(sample.frameTaskCount, options.frameTaskCount ?? 1);
  assert.equal(sample.coalescedFrameTasks, 0);
  assert.equal(sample.droppedUpdates, options.droppedUpdates);
  assert.equal(sample.remainingFrameTasks, 0);

  if (options.viewportHeight != null) {
    assert.ok(
      (sample.dirtyRows ?? Infinity) <= options.viewportHeight,
      `expected dirtyRows <= ${options.viewportHeight}, got ${sample.dirtyRows}`,
    );
  }
  if (options.paintedNodes != null) {
    assert.equal(sample.paintedNodes, options.paintedNodes);
  }
  if (options.maxPaintedNodes != null) {
    assert.ok(
      sample.paintedNodes <= options.maxPaintedNodes,
      `expected paintedNodes <= ${options.maxPaintedNodes}, got ${sample.paintedNodes}`,
    );
  }
  if (options.maxScannedNodes != null) {
    assert.ok(
      sample.scannedNodes < options.maxScannedNodes,
      `expected scannedNodes < ${options.maxScannedNodes}, got ${sample.scannedNodes}`,
    );
  }
}
