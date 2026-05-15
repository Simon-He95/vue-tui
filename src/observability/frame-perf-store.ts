import type { Ref } from "vue";
import type { FramePerfSample } from "./frame-perf.js";
import { computed, ref } from "vue";

export type FramePerfStore = Readonly<{
  enabled: Ref<boolean>;
  acquire: (reason?: string) => () => void;
  push: (sample: FramePerfSample) => void;
  latest: () => FramePerfSample | null;
  list: () => FramePerfSample[];
  clear: () => void;
}>;

export function createFramePerfStore(
  limit = 120,
  opts?: Readonly<{ enabled?: boolean }>,
): FramePerfStore {
  const max = Math.max(1, Math.floor(limit));
  const manualEnabled = ref(Boolean(opts?.enabled));
  const leaseCount = ref(0);
  const enabled = computed({
    get: () => manualEnabled.value || leaseCount.value > 0,
    set: (next) => {
      manualEnabled.value = Boolean(next);
    },
  });
  const samples: FramePerfSample[] = [];

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
  }

  function latest(): FramePerfSample | null {
    return samples.length > 0 ? samples[samples.length - 1]! : null;
  }

  function list(): FramePerfSample[] {
    return samples.slice();
  }

  function clear(): void {
    samples.length = 0;
  }

  return { enabled, acquire, push, latest, list, clear };
}
