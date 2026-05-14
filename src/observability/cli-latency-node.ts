import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { CliLatencyProfiler, CliLatencyStageEvent } from "./cli-latency-types.js";
import { envFlag, envString } from "../utils/env.js";

interface CliLatencyOp {
  id: number;
  createdAt: number;
  createdAtIso: string;
  eventType: string;
  key: string;
  code: string;
  operation: string | null;
  rawInputAt: number | null;
  stdinDispatchAt: number | null;
  dispatchStartAt: number | null;
  dispatchEndAt: number | null;
  invalidateAt: number | null;
  invalidatePriority: string | null;
  invalidatePlane: string | null;
  flushStartAt: number | null;
  flushEndAt: number | null;
  commitAt: number | null;
  commitSync: boolean | null;
  commitPlaneCount: number | null;
  commitDirtyRows: number | null;
  stdoutQueuedDelayMs: number | null;
  stdoutRenderStartAt: number | null;
  writeStartAt: number | null;
  writeEndAt: number | null;
  writeDurationMs: number | null;
  writeMode: string | null;
  writeBytes: number | null;
  defaultPrevented: boolean | null;
  parser: string | null;
}

type CliLatencyLogRecord = Readonly<{
  ts: string;
  id: number;
  event: Readonly<{
    type: string;
    key: string;
    code: string;
    defaultPrevented: boolean | null;
    parser: string | null;
  }>;
  operation: string | null;
  stages: Readonly<{
    rawInputAt: number | null;
    stdinDispatchAt: number | null;
    dispatchStartAt: number | null;
    dispatchEndAt: number | null;
    invalidateAt: number | null;
    flushStartAt: number | null;
    flushEndAt: number | null;
    commitAt: number | null;
    stdoutRenderStartAt: number | null;
    writeStartAt: number | null;
    writeEndAt: number | null;
  }>;
  timingsMs: Readonly<{
    inputParseWait: number | null;
    eventDispatch: number | null;
    dispatchToInvalidate: number | null;
    dispatchToFlush: number | null;
    flushToCommitDone: number | null;
    commitToRender: number | null;
    renderToWriteStart: number | null;
    write: number | null;
    totalToWrite: number | null;
  }>;
  scheduler: Readonly<{
    invalidatePriority: string | null;
    invalidatePlane: string | null;
    commitSync: boolean | null;
    commitPlaneCount: number | null;
    commitDirtyRows: number | null;
    stdoutQueuedDelayMs: number | null;
    writeMode: string | null;
    writeBytes: number | null;
  }>;
  outcome: string;
}>;

const EVENT_OP_ID = Symbol("dimcode.cliLatencyOpId");
const DEFAULT_LOG_FILE = "vue-tui-cli-latency.jsonl";
const INVALIDATE_ASSOCIATION_WINDOW_MS = 32;
const MAX_OP_AGE_MS = 5000;
const GLOBAL_PROFILER_KEY = "__vueTuiCliLatencyProfiler" as const;

let nextOpId = 1;
let singleton: CliLatencyProfiler | null | undefined;

type GlobalProfilerRegistry = typeof globalThis & {
  [GLOBAL_PROFILER_KEY]?: () => CliLatencyProfiler | null;
};

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function diffMs(end: number | null, start: number | null): number | null {
  if (end == null || start == null) return null;
  return Math.max(0, end - start);
}

function isTrackedEventType(type: string): boolean {
  return type === "keydown" || type === "beforeinput" || type === "input" || type === "paste";
}

function defineOpId(target: CliLatencyStageEvent, id: number): void {
  try {
    Object.defineProperty(target, EVENT_OP_ID, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: id,
    });
  } catch {
    // Ignore
  }
}

function readOpId(target: CliLatencyStageEvent): number | null {
  const value = (target as any)?.[EVENT_OP_ID];
  return typeof value === "number" ? value : null;
}

function createDisabledProfiler(): null {
  return null;
}

export function defaultCliLatencyLogPath(): string {
  return join(tmpdir(), DEFAULT_LOG_FILE);
}

function createProfiler(): CliLatencyProfiler | null {
  const processLike = process;
  const env = (processLike?.env ?? {}) as Record<string, unknown>;
  if (!envFlag(env, "VUE_TUI_PROFILE_INPUT_LATENCY", "DIMCODE_PROFILE_INPUT_LATENCY"))
    return createDisabledProfiler();

  const logPath = envString(
    env,
    "VUE_TUI_PROFILE_INPUT_LATENCY_LOG_PATH",
    "DIMCODE_PROFILE_INPUT_LATENCY_LOG_PATH",
    defaultCliLatencyLogPath(),
  );

  const ops = new Map<number, CliLatencyOp>();
  const pendingCommitIds = new Set<number>();
  const pendingWriteIds = new Set<number>();
  let currentDispatchOpId: number | null = null;
  let lastDispatchOpId: number | null = null;
  let lastDispatchEndedAt: number | null = null;
  let currentFlushIds: number[] = [];
  let lastRawInputAt: number | null = null;

  const emit = (record: CliLatencyLogRecord): void => {
    try {
      const data = `${JSON.stringify(record)}\n`;
      appendFileSync(logPath, data);
    } catch {
      // Ignore profiler write errors.
    }
  };

  const cleanupOp = (id: number): void => {
    ops.delete(id);
    pendingCommitIds.delete(id);
    pendingWriteIds.delete(id);
    if (currentDispatchOpId === id) currentDispatchOpId = null;
    if (lastDispatchOpId === id) {
      lastDispatchOpId = null;
      lastDispatchEndedAt = null;
    }
    if (currentFlushIds.includes(id))
      currentFlushIds = currentFlushIds.filter((value) => value !== id);
  };

  const flushOp = (op: CliLatencyOp, outcome: string): void => {
    const totalStart = op.rawInputAt ?? op.stdinDispatchAt ?? op.dispatchStartAt;
    emit({
      ts: op.createdAtIso,
      id: op.id,
      event: {
        type: op.eventType,
        key: op.key,
        code: op.code,
        defaultPrevented: op.defaultPrevented,
        parser: op.parser,
      },
      operation: op.operation,
      stages: {
        rawInputAt: op.rawInputAt,
        stdinDispatchAt: op.stdinDispatchAt,
        dispatchStartAt: op.dispatchStartAt,
        dispatchEndAt: op.dispatchEndAt,
        invalidateAt: op.invalidateAt,
        flushStartAt: op.flushStartAt,
        flushEndAt: op.flushEndAt,
        commitAt: op.commitAt,
        stdoutRenderStartAt: op.stdoutRenderStartAt,
        writeStartAt: op.writeStartAt,
        writeEndAt: op.writeEndAt,
      },
      timingsMs: {
        inputParseWait: diffMs(op.stdinDispatchAt, op.rawInputAt),
        eventDispatch: diffMs(op.dispatchEndAt, op.dispatchStartAt),
        dispatchToInvalidate: diffMs(op.invalidateAt, op.dispatchEndAt),
        dispatchToFlush: diffMs(op.flushStartAt, op.dispatchEndAt),
        flushToCommitDone: diffMs(op.flushEndAt, op.flushStartAt),
        commitToRender: diffMs(op.stdoutRenderStartAt, op.commitAt),
        renderToWriteStart: diffMs(op.writeStartAt, op.stdoutRenderStartAt),
        write: op.writeDurationMs,
        totalToWrite: diffMs(op.writeEndAt, totalStart),
      },
      scheduler: {
        invalidatePriority: op.invalidatePriority,
        invalidatePlane: op.invalidatePlane,
        commitSync: op.commitSync,
        commitPlaneCount: op.commitPlaneCount,
        commitDirtyRows: op.commitDirtyRows,
        stdoutQueuedDelayMs: op.stdoutQueuedDelayMs,
        writeMode: op.writeMode,
        writeBytes: op.writeBytes,
      },
      outcome,
    });
    cleanupOp(op.id);
  };

  const expireOldOps = (): void => {
    const currentTime = now();
    for (const op of ops.values()) {
      if (currentTime - op.createdAt < MAX_OP_AGE_MS) continue;
      flushOp(op, op.writeEndAt != null ? "completed" : "timeout");
    }
  };

  const flushPendingOps = (outcome: string): void => {
    for (const op of Array.from(ops.values()))
      flushOp(op, op.writeEndAt != null ? "completed" : outcome);
  };

  const ensureOp = (event: CliLatencyStageEvent): CliLatencyOp | null => {
    const type = String(event?.type ?? "");
    if (!isTrackedEventType(type)) return null;

    const existingId = readOpId(event);
    if (existingId != null) {
      return ops.get(existingId) ?? null;
    }

    const id = nextOpId++;
    const op: CliLatencyOp = {
      id,
      createdAt: now(),
      createdAtIso: new Date().toISOString(),
      eventType: type,
      key: String(event?.key ?? ""),
      code: String(event?.code ?? ""),
      operation: null,
      rawInputAt: null,
      stdinDispatchAt: null,
      dispatchStartAt: null,
      dispatchEndAt: null,
      invalidateAt: null,
      invalidatePriority: null,
      invalidatePlane: null,
      flushStartAt: null,
      flushEndAt: null,
      commitAt: null,
      commitSync: null,
      commitPlaneCount: null,
      commitDirtyRows: null,
      stdoutQueuedDelayMs: null,
      stdoutRenderStartAt: null,
      writeStartAt: null,
      writeEndAt: null,
      writeDurationMs: null,
      writeMode: null,
      writeBytes: null,
      defaultPrevented: null,
      parser: null,
    };
    ops.set(id, op);
    defineOpId(event, id);
    expireOldOps();
    return op;
  };

  const forIds = (ids: Iterable<number>, fn: (op: CliLatencyOp) => void): void => {
    for (const id of ids) {
      const op = ops.get(id);
      if (!op) continue;
      fn(op);
    }
  };

  const resolveActiveOp = (): CliLatencyOp | null => {
    if (currentDispatchOpId != null) return ops.get(currentDispatchOpId) ?? null;
    if (
      lastDispatchOpId != null &&
      lastDispatchEndedAt != null &&
      now() - lastDispatchEndedAt <= INVALIDATE_ASSOCIATION_WINDOW_MS
    ) {
      return ops.get(lastDispatchOpId) ?? null;
    }
    return null;
  };

  processLike?.once?.("exit", () => {
    flushPendingOps("process-exit");
  });

  return {
    enabled: true,
    recordRawInput(_info) {
      lastRawInputAt = now();
      expireOldOps();
    },
    recordStdinDispatch(event, info) {
      const op = ensureOp(event);
      if (!op) return;
      if (op.rawInputAt == null && lastRawInputAt != null) op.rawInputAt = lastRawInputAt;
      if (op.stdinDispatchAt == null) op.stdinDispatchAt = now();
      if (!op.parser && info?.parser) op.parser = String(info.parser);
    },
    recordEventDispatchStart(event) {
      const op = ensureOp(event);
      if (!op) return;
      currentDispatchOpId = op.id;
      if (op.dispatchStartAt == null) op.dispatchStartAt = now();
    },
    recordEventDispatchEnd(event, info) {
      const op = ensureOp(event);
      if (!op) return;
      op.defaultPrevented = Boolean(info.defaultPrevented);
      if (op.dispatchEndAt == null) op.dispatchEndAt = now();
      currentDispatchOpId = currentDispatchOpId === op.id ? null : currentDispatchOpId;
      lastDispatchOpId = op.id;
      lastDispatchEndedAt = op.dispatchEndAt;
    },
    recordSchedulerInvalidate(info) {
      const op = resolveActiveOp();
      if (!op) return;
      if (op.invalidateAt == null) op.invalidateAt = now();
      if (!op.invalidatePriority && info?.priority) op.invalidatePriority = String(info.priority);
      if (!op.invalidatePlane && info?.plane) op.invalidatePlane = String(info.plane);
      pendingCommitIds.add(op.id);
    },
    recordFlushStart(info) {
      currentFlushIds = Array.from(pendingCommitIds);
      if (!currentFlushIds.length) return;
      const flushTime = now();
      forIds(currentFlushIds, (op) => {
        if (op.flushStartAt == null) op.flushStartAt = flushTime;
        if (op.commitSync == null && info?.sync != null) op.commitSync = Boolean(info.sync);
        if (op.commitPlaneCount == null && Array.isArray(info?.activePlanes)) {
          op.commitPlaneCount = info!.activePlanes!.length;
        }
      });
    },
    recordFlushEnd() {
      if (!currentFlushIds.length) return;
      const flushTime = now();
      forIds(currentFlushIds, (op) => {
        if (op.flushEndAt == null) op.flushEndAt = flushTime;
      });
      currentFlushIds = [];
    },
    recordCommit(info) {
      if (!pendingCommitIds.size) return;
      const commitTime = now();
      const ids = Array.from(pendingCommitIds);
      pendingCommitIds.clear();
      forIds(ids, (op) => {
        if (op.flushEndAt == null && op.flushStartAt != null) op.flushEndAt = commitTime;
        if (op.commitAt == null) op.commitAt = commitTime;
        op.commitSync = info?.sync == null ? op.commitSync : Boolean(info.sync);
        op.commitPlaneCount = Array.isArray(info?.planes)
          ? info!.planes!.length
          : op.commitPlaneCount;
        op.commitDirtyRows = Array.isArray(info?.dirtyRows)
          ? info!.dirtyRows!.length
          : info?.dirtyRows === null
            ? null
            : op.commitDirtyRows;
        pendingWriteIds.add(op.id);
      });
    },
    recordStdoutQueued(delayMs) {
      if (!pendingWriteIds.size) return;
      forIds(pendingWriteIds, (op) => {
        if (op.stdoutQueuedDelayMs == null) op.stdoutQueuedDelayMs = Math.max(0, delayMs);
      });
    },
    recordStdoutRenderStart() {
      if (!pendingWriteIds.size) return;
      const renderTime = now();
      forIds(pendingWriteIds, (op) => {
        if (op.stdoutRenderStartAt == null) op.stdoutRenderStartAt = renderTime;
      });
    },
    recordStdoutNoOutput() {
      if (!pendingWriteIds.size) return;
      const ids = Array.from(pendingWriteIds);
      pendingWriteIds.clear();
      forIds(ids, (op) => flushOp(op, "no-output"));
    },
    recordStdoutWrite(info) {
      if (!pendingWriteIds.size) return;
      const writeEndTime = now();
      const ids = Array.from(pendingWriteIds);
      pendingWriteIds.clear();
      forIds(ids, (op) => {
        op.writeEndAt = writeEndTime;
        op.writeDurationMs = Math.max(0, info.durationMs);
        op.writeStartAt = writeEndTime - op.writeDurationMs;
        op.writeMode = String(info.mode ?? "");
        op.writeBytes = Math.max(0, Math.floor(info.bytes));
        flushOp(op, "completed");
      });
    },
    markOperation(operation) {
      const nextOperation = String(operation ?? "").trim();
      if (!nextOperation) return;
      const op = resolveActiveOp();
      if (!op) return;
      op.operation = nextOperation;
    },
  };
}

export function getCliLatencyProfiler(): CliLatencyProfiler | null {
  if (singleton !== undefined) return singleton;
  singleton = createProfiler();
  return singleton;
}

(globalThis as GlobalProfilerRegistry)[GLOBAL_PROFILER_KEY] = getCliLatencyProfiler;
