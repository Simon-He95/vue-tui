export type FramePerfReason =
  | "scroll"
  | "input"
  | "stream"
  | "resize"
  | "data"
  | "selection"
  | "manual"
  | "unknown";

const FRAME_PERF_REASON_PRIORITY: Record<FramePerfReason, number> = {
  unknown: 0,
  manual: 1,
  data: 2,
  selection: 3,
  stream: 4,
  resize: 5,
  scroll: 6,
  input: 7,
};

export type FramePerfRowBucketFallback = Readonly<{
  plane: string;
  reason: "dirty-ratio" | "candidate-ratio";
  dirtyRows: number;
  planeNodes: number;
  candidates?: number;
}>;

export type FramePerfMailboxFailure = Readonly<{
  id: string;
  queued: number;
  dropped: number;
}>;

export type FramePerfSample = Readonly<{
  frameId: number;
  reason: FramePerfReason;
  startedAt: number;
  durationMs: number;
  renderManagerMs: number;
  commitMs: number;
  domFlushMs?: number;
  stdoutFlushMs?: number;
  dirtyRows: number | null;
  activePlanes: readonly string[] | null;
  scannedNodes: number;
  paintedNodes: number;
  rowBucketFallbacks?: readonly FramePerfRowBucketFallback[];
  coalescedInvalidates: number;
  frameTaskCount: number;
  coalescedFrameTasks: number;
  frameTaskQueueDepthBeforeRun: number;
  frameTaskQueueDepthAfterRun: number;
  remainingFrameTasks: number;
  droppedUpdates: number;
  mailboxFailure?: FramePerfMailboxFailure;
  queueDepth: number;
  liveReasons?: readonly string[];
}>;

export type FramePerfMetricStats = Readonly<{
  avg: number;
  max: number;
  min: number;
}>;

export type FramePerfDirtyRowsStats = Readonly<{
  avg: number;
  max: number;
  sampledFrames: number;
  fullFrames: number;
}>;

export type FramePerfSummary = Readonly<{
  frames: number;
  firstFrameId: number | null;
  latestFrameId: number | null;
  windowMs: number;
  durationMs: FramePerfMetricStats;
  renderManagerMs: FramePerfMetricStats;
  commitMs: FramePerfMetricStats;
  domFlushMs: FramePerfMetricStats;
  stdoutFlushMs: FramePerfMetricStats;
  dirtyRows: FramePerfDirtyRowsStats;
  scannedNodes: FramePerfMetricStats;
  paintedNodes: FramePerfMetricStats;
  coalescedInvalidates: number;
  coalescedFrameTasks: number;
  droppedUpdates: number;
  maxQueueDepth: number;
  rowBucketFallbacks: number;
  reasons: Partial<Record<FramePerfReason, number>>;
  activePlanes: Record<string, number>;
}>;

const EMPTY_METRIC_STATS: FramePerfMetricStats = Object.freeze({ avg: 0, max: 0, min: 0 });

function metricStats(values: readonly number[]): FramePerfMetricStats {
  if (!values.length) return EMPTY_METRIC_STATS;
  let sum = 0;
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const value of values) {
    sum += value;
    if (value > max) max = value;
    if (value < min) min = value;
  }
  return { avg: sum / values.length, max, min };
}

export function summarizeFramePerf(samples: readonly FramePerfSample[]): FramePerfSummary {
  const durationMs: number[] = [];
  const renderManagerMs: number[] = [];
  const commitMs: number[] = [];
  const domFlushMs: number[] = [];
  const stdoutFlushMs: number[] = [];
  const dirtyRows: number[] = [];
  const scannedNodes: number[] = [];
  const paintedNodes: number[] = [];
  const reasons: Partial<Record<FramePerfReason, number>> = {};
  const activePlanes: Record<string, number> = {};
  let fullDirtyFrames = 0;
  let coalescedInvalidates = 0;
  let coalescedFrameTasks = 0;
  let droppedUpdates = 0;
  let maxQueueDepth = 0;
  let rowBucketFallbacks = 0;

  for (const sample of samples) {
    durationMs.push(sample.durationMs);
    renderManagerMs.push(sample.renderManagerMs);
    commitMs.push(sample.commitMs);
    scannedNodes.push(sample.scannedNodes);
    paintedNodes.push(sample.paintedNodes);
    if (sample.domFlushMs != null) domFlushMs.push(sample.domFlushMs);
    if (sample.stdoutFlushMs != null) stdoutFlushMs.push(sample.stdoutFlushMs);
    if (sample.dirtyRows == null) fullDirtyFrames++;
    else dirtyRows.push(sample.dirtyRows);

    reasons[sample.reason] = (reasons[sample.reason] ?? 0) + 1;
    const planes = sample.activePlanes;
    if (!planes) activePlanes.all = (activePlanes.all ?? 0) + 1;
    else {
      for (const plane of planes) activePlanes[plane] = (activePlanes[plane] ?? 0) + 1;
    }

    coalescedInvalidates += sample.coalescedInvalidates;
    coalescedFrameTasks += sample.coalescedFrameTasks;
    droppedUpdates += sample.droppedUpdates;
    if (sample.queueDepth > maxQueueDepth) maxQueueDepth = sample.queueDepth;
    rowBucketFallbacks += sample.rowBucketFallbacks?.length ?? 0;
  }

  const first = samples[0] ?? null;
  const latest = samples[samples.length - 1] ?? null;

  return {
    frames: samples.length,
    firstFrameId: first?.frameId ?? null,
    latestFrameId: latest?.frameId ?? null,
    windowMs: first && latest ? Math.max(0, latest.startedAt - first.startedAt) : 0,
    durationMs: metricStats(durationMs),
    renderManagerMs: metricStats(renderManagerMs),
    commitMs: metricStats(commitMs),
    domFlushMs: metricStats(domFlushMs),
    stdoutFlushMs: metricStats(stdoutFlushMs),
    dirtyRows: {
      avg: dirtyRows.length
        ? dirtyRows.reduce((sum, value) => sum + value, 0) / dirtyRows.length
        : 0,
      max: dirtyRows.length ? Math.max(...dirtyRows) : 0,
      sampledFrames: dirtyRows.length,
      fullFrames: fullDirtyFrames,
    },
    scannedNodes: metricStats(scannedNodes),
    paintedNodes: metricStats(paintedNodes),
    coalescedInvalidates,
    coalescedFrameTasks,
    droppedUpdates,
    maxQueueDepth,
    rowBucketFallbacks,
    reasons,
    activePlanes,
  };
}

export function framePerfNow(): number {
  const p = (globalThis as any).performance;
  if (p && typeof p.now === "function") return p.now();
  return Date.now();
}

export function mergeFramePerfReason(
  prev: FramePerfReason | undefined,
  next: FramePerfReason | undefined,
): FramePerfReason {
  const a = prev ?? "unknown";
  const b = next ?? "unknown";
  return FRAME_PERF_REASON_PRIORITY[b] > FRAME_PERF_REASON_PRIORITY[a] ? b : a;
}
