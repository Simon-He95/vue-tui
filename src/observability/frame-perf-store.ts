import type { Ref } from "vue";
import type { FramePerfSample, FramePerfSummary } from "./frame-perf.js";
import type { ComponentPerf, TuiPerfEvent, TuiPerfSink } from "./perf-sink.js";
import { computed, ref } from "vue";
import { summarizeFramePerf } from "./frame-perf.js";
import { getInstalledTuiPerf } from "./perf-sink.js";

export type FramePerfStore = Readonly<{
  enabled: Ref<boolean>;
  acquire: (reason?: string) => () => void;
  push: (sample: FramePerfSample) => void;
  recordComponent: (sample: ComponentPerf) => void;
  recordEvent: (event: TuiPerfEvent) => void;
  addSink: (sink: TuiPerfSink) => () => void;
  latest: () => FramePerfSample | null;
  list: () => FramePerfSample[];
  summary: () => FramePerfSummary;
  clear: () => void;
}>;

export function createFramePerfStore(
  limit = 120,
  opts?: Readonly<{ enabled?: boolean; sink?: TuiPerfSink | readonly TuiPerfSink[] | null }>,
): FramePerfStore {
  const max = Math.max(1, Math.floor(limit));
  const installed = getInstalledTuiPerf();
  const manualEnabled = ref(Boolean(opts?.enabled ?? installed.enabled));
  const leaseCount = ref(0);
  const enabled = computed({
    get: () => manualEnabled.value || leaseCount.value > 0,
    set: (next) => {
      manualEnabled.value = Boolean(next);
    },
  });
  const samples: FramePerfSample[] = [];
  const sinks: TuiPerfSink[] = [];
  if (installed.sink) sinks.push(installed.sink);
  const configuredSink = opts?.sink;
  if (Array.isArray(configuredSink)) sinks.push(...configuredSink);
  else if (configuredSink) sinks.push(configuredSink as TuiPerfSink);

  function emitToSinks(fn: (sink: TuiPerfSink) => void): void {
    for (const sink of sinks) {
      try {
        fn(sink);
      } catch {
        // Profiling must not break rendering.
      }
    }
  }

  function acquire(_reason?: string): () => void {
    leaseCount.value++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leaseCount.value = Math.max(0, leaseCount.value - 1);
    };
  }

  function push(sample: FramePerfSample): void {
    if (!enabled.value) return;
    samples.push(sample);
    if (samples.length > max) samples.splice(0, samples.length - max);
    emitToSinks((sink) => sink.onFramePerf(sample));
  }

  function recordComponent(sample: ComponentPerf): void {
    if (!enabled.value) return;
    emitToSinks((sink) => sink.onComponentPerf?.(sample));
  }

  function recordEvent(event: TuiPerfEvent): void {
    if (!enabled.value) return;
    emitToSinks((sink) => sink.onEvent?.(event));
  }

  function addSink(sink: TuiPerfSink): () => void {
    sinks.push(sink);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const index = sinks.indexOf(sink);
      if (index >= 0) sinks.splice(index, 1);
      sink.dispose?.();
    };
  }

  function latest(): FramePerfSample | null {
    return samples.length > 0 ? samples[samples.length - 1]! : null;
  }

  function list(): FramePerfSample[] {
    return samples.slice();
  }

  function summary(): FramePerfSummary {
    return summarizeFramePerf(samples);
  }

  function clear(): void {
    samples.length = 0;
  }

  return {
    enabled,
    acquire,
    push,
    recordComponent,
    recordEvent,
    addSink,
    latest,
    list,
    summary,
    clear,
  };
}
