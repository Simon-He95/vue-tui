import type { TerminalRenderPlane, TerminalRenderPlanes } from "../core/render-plane.js";
import { envFlag, envString, firstNonEmptyEnv } from "../utils/env.js";

type NowFn = () => number;
type TuiProfilerFileWriter = Readonly<{
  appendFileSync?: (path: string, data: string) => void;
}>;

export type CreateTuiProfilerOptions = Readonly<{
  fileWriter?: TuiProfilerFileWriter;
  defaultLogDest?: "stdout" | "file" | "both";
  defaultLogPath?: string;
}>;

let defaultProfilerFileWriter: TuiProfilerFileWriter | null = null;

export function setTuiProfilerFileWriter(writer: TuiProfilerFileWriter | null): void {
  defaultProfilerFileWriter = writer;
}

function getProfilerFileWriter(options: CreateTuiProfilerOptions): TuiProfilerFileWriter | null {
  return options.fileWriter ?? defaultProfilerFileWriter;
}

function defaultNow(): number {
  const p = (globalThis as any).performance;
  if (p && typeof p.now === "function") return p.now();
  return Date.now();
}

function parseLogFormat(v: unknown): "text" | "json" | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "json") return "json";
  if (s === "text") return "text";
  return null;
}

function parseLogDest(v: unknown): "stdout" | "file" | "both" | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  if (s === "file") return "file";
  if (s === "both") return "both";
  if (s === "stdout") return "stdout";
  return null;
}

function parseLogEveryMs(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatClockTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

export type TuiProfiler = Readonly<{
  now: NowFn;
  recordInvalidate: (info?: { plane?: TerminalRenderPlane | null }) => void;
  recordRender: (info: {
    durationMs: number;
    rows: number;
    nodes: number;
    fullRepaint: boolean;
    sorted: boolean;
    activePlanes?: TerminalRenderPlanes | null;
  }) => void;
  recordWrite: (info: {
    durationMs: number;
    bytes: number;
    mode: "stream" | "sync" | "chunked";
  }) => void;
  dispose: () => void;
}>;

export function createTuiProfiler(
  name: string,
  options: CreateTuiProfilerOptions = {},
): TuiProfiler | null {
  const env = (globalThis as any).process?.env as Record<string, unknown> | undefined;
  if (!envFlag(env, "VUE_TUI_PROFILE", "DIMCODE_PROFILE_TUI")) return null;

  const format =
    parseLogFormat(firstNonEmptyEnv(env, "VUE_TUI_PROFILE_FORMAT", "DIMCODE_PROFILE_TUI_FORMAT")) ??
    (String(firstNonEmptyEnv(env, "VUE_TUI_PROFILE_LOG_PATH", "DIMCODE_PROFILE_TUI_LOG_PATH") ?? "")
      .trim()
      .endsWith(".jsonl")
      ? "json"
      : "text");
  const logDest =
    parseLogDest(
      firstNonEmptyEnv(env, "VUE_TUI_PROFILE_LOG_DEST", "DIMCODE_PROFILE_TUI_LOG_DEST"),
    ) ??
    options.defaultLogDest ??
    "stdout";
  const logPath =
    envString(env, "VUE_TUI_PROFILE_LOG_PATH", "DIMCODE_PROFILE_TUI_LOG_PATH") ||
    options.defaultLogPath ||
    "";
  let invalidates = 0;
  let renders = 0;
  let fullRenders = 0;
  let sortedRenders = 0;
  let totalRenderMs = 0;
  let totalRows = 0;
  let totalNodes = 0;
  let maxRenderMs = 0;
  let writes = 0;
  let totalWriteMs = 0;
  let maxWriteMs = 0;
  let totalBytes = 0;
  let streamWrites = 0;
  let syncWrites = 0;
  let chunkedWrites = 0;
  const invalidatePlaneCounts = new Map<string, number>();
  const renderPlaneCounts = new Map<string, number>();

  const logEveryMs =
    parseLogEveryMs(
      firstNonEmptyEnv(env, "VUE_TUI_PROFILE_LOG_EVERY_MS", "DIMCODE_PROFILE_TUI_LOG_EVERY_MS"),
    ) ?? 1000;
  const now = defaultNow;
  let lastLogAt = now();
  let disposed = false;

  function incrementPlaneCount(target: Map<string, number>, key: string | null | undefined): void {
    const normalized = String(key ?? "all").trim() || "all";
    target.set(normalized, (target.get(normalized) ?? 0) + 1);
  }

  function emit(line: string): void {
    const dest = logDest;
    if ((dest === "file" || dest === "both") && logPath) {
      try {
        const data = `${line}\n`;
        getProfilerFileWriter(options)?.appendFileSync?.(logPath, data);
      } catch {
        // ignore
      }
    }
    if (dest === "stdout" || dest === "both") {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  function hasPendingSamples(): boolean {
    return invalidates > 0 || renders > 0 || writes > 0;
  }

  function flushLog(force = false): void {
    if (disposed) return;
    if (!hasPendingSamples()) return;

    const at = now();
    const elapsedRaw = at - lastLogAt;
    if (!force && elapsedRaw <= 0) return;
    const elapsed = Math.max(1, elapsedRaw);
    lastLogAt = at;

    const rps = renders ? (renders * 1000) / elapsed : 0;
    const ips = invalidates ? (invalidates * 1000) / elapsed : 0;
    const avgMs = renders ? totalRenderMs / renders : 0;
    const avgRows = renders ? totalRows / renders : 0;
    const avgNodes = renders ? totalNodes / renders : 0;
    const wps = writes ? (writes * 1000) / elapsed : 0;
    const avgWriteMs = writes ? totalWriteMs / writes : 0;
    const bps = totalBytes ? (totalBytes * 1000) / elapsed : 0;
    const avgBytes = writes ? totalBytes / writes : 0;

    if (format === "json") {
      emit(
        JSON.stringify({
          tag: "VUE_TUI_PROFILE",
          name,
          at: Date.now(),
          elapsedMs: elapsed,
          invalidates,
          renders,
          writes,
          totalRenderMs,
          totalRows,
          totalNodes,
          totalWriteMs,
          totalBytes,
          rps,
          ips,
          avgMs,
          maxMs: maxRenderMs,
          avgRows,
          avgNodes,
          full: fullRenders,
          sorted: sortedRenders,
          wps,
          avgWriteMs,
          maxWriteMs,
          bps,
          avgBytes,
          planes: {
            invalidate: Object.fromEntries(invalidatePlaneCounts),
            render: Object.fromEntries(renderPlaneCounts),
          },
          writeMode: {
            stream: streamWrites,
            sync: syncWrites,
            chunked: chunkedWrites,
          },
        }),
      );
    } else {
      emit(
        `[${formatClockTime(Date.now())}] [VUE_TUI_PROFILE] ${name} elapsedMs=${elapsed.toFixed(0)} ` +
          `rps=${rps.toFixed(1)} ips=${ips.toFixed(1)} ` +
          `avgMs=${avgMs.toFixed(2)} maxMs=${maxRenderMs.toFixed(2)} ` +
          `avgRows=${avgRows.toFixed(1)} avgNodes=${avgNodes.toFixed(1)} ` +
          `full=${fullRenders} sorted=${sortedRenders}${
            writes
              ? ` wps=${wps.toFixed(1)} avgWriteMs=${avgWriteMs.toFixed(2)} maxWriteMs=${maxWriteMs.toFixed(2)} avgBytes=${avgBytes.toFixed(0)} bps=${bps.toFixed(0)} mode(stream/sync/chunked)=${streamWrites}/${syncWrites}/${chunkedWrites}`
              : ""
          }`,
      );
    }

    invalidates = 0;
    renders = 0;
    fullRenders = 0;
    sortedRenders = 0;
    totalRenderMs = 0;
    totalRows = 0;
    totalNodes = 0;
    maxRenderMs = 0;
    writes = 0;
    totalWriteMs = 0;
    maxWriteMs = 0;
    totalBytes = 0;
    streamWrites = 0;
    syncWrites = 0;
    chunkedWrites = 0;
    invalidatePlaneCounts.clear();
    renderPlaneCounts.clear();
  }

  const timer = setInterval(
    flushLog,
    Number.isFinite(logEveryMs) ? Math.max(100, logEveryMs) : 1000,
  );
  (timer as any).unref?.();

  return {
    now,
    recordInvalidate(info) {
      if (disposed) return;
      invalidates++;
      incrementPlaneCount(invalidatePlaneCounts, info?.plane ?? "all");
    },
    recordRender(info) {
      if (disposed) return;
      renders++;
      if (info.fullRepaint) fullRenders++;
      if (info.sorted) sortedRenders++;
      totalRenderMs += info.durationMs;
      totalRows += info.rows;
      totalNodes += info.nodes;
      if (info.durationMs > maxRenderMs) maxRenderMs = info.durationMs;
      if (!info.activePlanes?.length) {
        incrementPlaneCount(renderPlaneCounts, "all");
      } else {
        for (const plane of info.activePlanes) incrementPlaneCount(renderPlaneCounts, plane);
      }
    },
    recordWrite(info) {
      if (disposed) return;
      writes++;
      totalWriteMs += info.durationMs;
      totalBytes += Math.max(0, Math.floor(info.bytes));
      if (info.durationMs > maxWriteMs) maxWriteMs = info.durationMs;
      if (info.mode === "stream") streamWrites++;
      else if (info.mode === "sync") syncWrites++;
      else chunkedWrites++;
    },
    dispose() {
      if (disposed) return;
      flushLog(true);
      disposed = true;
      clearInterval(timer as any);
    },
  };
}
