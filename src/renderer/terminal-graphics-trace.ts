import type { TerminalGraphicsProtocol } from "./terminal-graphics.js";

export type TerminalGraphicTraceEventType =
  | "request"
  | "skip-hidden"
  | "skip-scrolling"
  | "cache-hit"
  | "cache-miss"
  | "cache-store"
  | "renderer-start"
  | "renderer-end"
  | "renderer-error"
  | "validate-end"
  | "queue"
  | "queue-wait"
  | "queue-dedupe"
  | "clear"
  | "scroll-start"
  | "scroll-mark"
  | "scroll-idle";

export type TerminalGraphicTraceEvent = Readonly<{
  type: TerminalGraphicTraceEventType;
  id: string;
  key?: string;
  protocol?: TerminalGraphicsProtocol;
  timestamp: number;
  durationMs?: number;
  bytes?: number;
  reason?: string;
  error?: string;
}>;

export type TerminalGraphicTraceMetrics = Readonly<{
  requests: number;
  skippedHidden: number;
  skippedScrolling: number;
  cacheHits: number;
  cacheMisses: number;
  cacheStores: number;
  rendererRuns: number;
  rendererErrors: number;
  queued: number;
  queueWaits: number;
  queueDeduped: number;
  cleared: number;
  bytesQueued: number;
  totalRendererMs: number;
  totalValidateMs: number;
  totalQueueWaitMs: number;
  maxQueueWaitMs: number;
  scrollStarts: number;
  scrollMarks: number;
  scrollIdles: number;
  totalScrollMs: number;
  maxScrollMs: number;
}>;

const metrics = {
  requests: 0,
  skippedHidden: 0,
  skippedScrolling: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheStores: 0,
  rendererRuns: 0,
  rendererErrors: 0,
  queued: 0,
  queueWaits: 0,
  queueDeduped: 0,
  cleared: 0,
  bytesQueued: 0,
  totalRendererMs: 0,
  totalValidateMs: 0,
  totalQueueWaitMs: 0,
  maxQueueWaitMs: 0,
  scrollStarts: 0,
  scrollMarks: 0,
  scrollIdles: 0,
  totalScrollMs: 0,
  maxScrollMs: 0,
};

const subscribers = new Set<(event: TerminalGraphicTraceEvent) => void>();

export function nowTerminalGraphicTraceTime(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function recordTerminalGraphicTrace(
  event: Omit<TerminalGraphicTraceEvent, "timestamp"> & { timestamp?: number },
): void {
  const normalized: TerminalGraphicTraceEvent = {
    ...event,
    timestamp: event.timestamp ?? nowTerminalGraphicTraceTime(),
  };

  switch (normalized.type) {
    case "request":
      metrics.requests++;
      break;
    case "skip-hidden":
      metrics.skippedHidden++;
      break;
    case "skip-scrolling":
      metrics.skippedScrolling++;
      break;
    case "cache-hit":
      metrics.cacheHits++;
      break;
    case "cache-miss":
      metrics.cacheMisses++;
      break;
    case "cache-store":
      metrics.cacheStores++;
      break;
    case "renderer-start":
      metrics.rendererRuns++;
      break;
    case "renderer-end":
      metrics.totalRendererMs += normalized.durationMs ?? 0;
      break;
    case "renderer-error":
      metrics.rendererErrors++;
      break;
    case "validate-end":
      metrics.totalValidateMs += normalized.durationMs ?? 0;
      break;
    case "queue":
      metrics.queued++;
      metrics.bytesQueued += normalized.bytes ?? 0;
      break;
    case "queue-wait": {
      const durationMs = normalized.durationMs ?? 0;
      metrics.queueWaits++;
      metrics.totalQueueWaitMs += durationMs;
      metrics.maxQueueWaitMs = Math.max(metrics.maxQueueWaitMs, durationMs);
      break;
    }
    case "queue-dedupe":
      metrics.queueDeduped++;
      break;
    case "clear":
      metrics.cleared++;
      break;
    case "scroll-start":
      metrics.scrollStarts++;
      break;
    case "scroll-mark":
      metrics.scrollMarks++;
      break;
    case "scroll-idle": {
      const durationMs = normalized.durationMs ?? 0;
      metrics.scrollIdles++;
      metrics.totalScrollMs += durationMs;
      metrics.maxScrollMs = Math.max(metrics.maxScrollMs, durationMs);
      break;
    }
  }

  for (const subscriber of subscribers) subscriber(normalized);
}

export function getTerminalGraphicTraceMetrics(): TerminalGraphicTraceMetrics {
  return { ...metrics };
}

export function resetTerminalGraphicTraceMetrics(): void {
  metrics.requests = 0;
  metrics.skippedHidden = 0;
  metrics.skippedScrolling = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.cacheStores = 0;
  metrics.rendererRuns = 0;
  metrics.rendererErrors = 0;
  metrics.queued = 0;
  metrics.queueWaits = 0;
  metrics.queueDeduped = 0;
  metrics.cleared = 0;
  metrics.bytesQueued = 0;
  metrics.totalRendererMs = 0;
  metrics.totalValidateMs = 0;
  metrics.totalQueueWaitMs = 0;
  metrics.maxQueueWaitMs = 0;
  metrics.scrollStarts = 0;
  metrics.scrollMarks = 0;
  metrics.scrollIdles = 0;
  metrics.totalScrollMs = 0;
  metrics.maxScrollMs = 0;
}

export function subscribeTerminalGraphicTrace(
  listener: (event: TerminalGraphicTraceEvent) => void,
): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
