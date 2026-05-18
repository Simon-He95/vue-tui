import type { FramePerfSample } from "./frame-perf.js";

export type FramePerf = FramePerfSample;

export type ComponentPerf = Readonly<{
  name: string;
  id?: string;
  phase:
    | "source-read"
    | "measure"
    | "layout"
    | "render"
    | "cache-hit"
    | "cache-miss"
    | "scroll"
    | "parse";
  durationMs: number;
  visibleStart?: number;
  visibleEnd?: number;
  overscanStart?: number;
  overscanEnd?: number;
  itemCount?: number;
  renderedCount?: number;
  cacheHit?: number;
  cacheMiss?: number;
  sourceReadCount?: number;
  sourceSkippedCount?: number;
  width?: number;
  version?: string | number;
  reason?: string;
}>;

export type TuiPerfEvent = Readonly<{
  type: string;
  ts?: number;
  component?: string;
  id?: string;
  data?: Record<string, unknown>;
}>;

export type TuiPerfSink = Readonly<{
  onFramePerf: (sample: FramePerfSample) => void;
  onComponentPerf?: (sample: ComponentPerf) => void;
  onEvent?: (event: TuiPerfEvent) => void;
  dispose?: () => void;
}>;

export type TuiPerfJsonlWriter = Readonly<{
  appendFileSync?: (path: string, data: string) => void;
}>;

export type CreateJsonlPerfSinkOptions = Readonly<{
  file?: string;
  fileWriter?: TuiPerfJsonlWriter | null;
  write?: (line: string) => void;
  sampleRate?: number;
  includeComponents?: boolean;
  includeEvents?: boolean;
}>;

export type InstallTuiPerfOptions = Readonly<{
  enabled?: boolean;
  sink?: TuiPerfSink | null;
  debugOverlay?: boolean;
}>;

type InstalledTuiPerf = Readonly<{
  enabled: boolean;
  sink: TuiPerfSink | null;
}>;

let installedTuiPerf: InstalledTuiPerf = { enabled: false, sink: null };

function shouldSample(rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function normalizeSampleRate(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

export function createJsonlPerfSink(options: CreateJsonlPerfSinkOptions = {}): TuiPerfSink {
  const sampleRate = normalizeSampleRate(options.sampleRate);
  const includeComponents = options.includeComponents ?? true;
  const includeEvents = options.includeEvents ?? false;

  function emit(value: Record<string, unknown>): void {
    const line = JSON.stringify(value);
    if (options.file && options.fileWriter?.appendFileSync) {
      options.fileWriter.appendFileSync(options.file, `${line}\n`);
    }
    options.write?.(line);
  }

  return {
    onFramePerf(sample) {
      if (!shouldSample(sampleRate)) return;
      emit({ type: "frame", ...sample });
    },
    onComponentPerf(sample) {
      if (!includeComponents || !shouldSample(sampleRate)) return;
      emit({ type: "component", ...sample });
    },
    onEvent(event) {
      if (!includeEvents || !shouldSample(sampleRate)) return;
      emit({
        type: "event",
        eventType: event.type,
        ts: event.ts ?? Date.now(),
        component: event.component,
        id: event.id,
        data: event.data,
      });
    },
  };
}

export function installTuiPerf(options: InstallTuiPerfOptions = {}): () => void {
  const previous = installedTuiPerf;
  const previousDebugPerf = (globalThis as any).__VT_DEBUG_PERF__;
  const current: InstalledTuiPerf = {
    enabled: options.enabled ?? Boolean(options.sink),
    sink: options.sink ?? null,
  };
  installedTuiPerf = current;
  if (options.debugOverlay != null) {
    (globalThis as any).__VT_DEBUG_PERF__ = Boolean(options.debugOverlay);
  }

  return () => {
    current.sink?.dispose?.();
    if (installedTuiPerf === current) installedTuiPerf = previous;
    if (previousDebugPerf === undefined) delete (globalThis as any).__VT_DEBUG_PERF__;
    else (globalThis as any).__VT_DEBUG_PERF__ = previousDebugPerf;
  };
}

export function getInstalledTuiPerf(): InstalledTuiPerf {
  return installedTuiPerf;
}
