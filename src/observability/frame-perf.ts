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
