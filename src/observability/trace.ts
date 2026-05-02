import type { Ref } from "vue";
import type { TerminalRenderPlanes } from "../core/render-plane.js";
import type { TerminalEventRecord } from "../events/recording.js";
import type { DomRendererSyncFlushDecision } from "../renderer/index.js";
import { ref, shallowReactive } from "vue";

export type TraceRecord =
  | Readonly<{
      type: "event";
      at: number;
      event: TerminalEventRecord;
    }>
  | Readonly<{
      type: "focus";
      at: number;
      prev: string | null;
      next: string | null;
    }>
  | Readonly<{
      type: "commit";
      at: number;
      dirtyRows: readonly number[] | null;
      planes: TerminalRenderPlanes | null;
      sync?: boolean;
      rendererSyncFlush?: DomRendererSyncFlushDecision | null;
      focusedId: string | null;
    }>;

export type TraceStore = Readonly<{
  enabled: Ref<boolean>;
  records: TraceRecord[];
  push: (record: TraceRecord) => void;
  clear: () => void;
  snapshot: () => TraceRecord[];
}>;

export function createTraceStore(opts?: Readonly<{ enabled?: boolean; max?: number }>): TraceStore {
  const enabled = ref(Boolean(opts?.enabled));
  const records = shallowReactive<TraceRecord[]>([]);
  const max = Math.max(10, Math.floor(opts?.max ?? 400));

  function push(record: TraceRecord): void {
    if (!enabled.value) return;
    records.push(record);
    if (records.length > max) records.splice(0, records.length - max);
  }

  function clear(): void {
    records.splice(0, records.length);
  }

  function snapshot(): TraceRecord[] {
    return records.slice();
  }

  return { enabled, records, push, clear, snapshot };
}
