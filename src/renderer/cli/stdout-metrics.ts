export type StdoutRendererWriteMode = "stream" | "sync" | "chunked";

export interface StdoutRendererMetrics {
  lastFrameAt: number;
  lastFrameBytes: number;
  lastWriteMs: number;
  writeEmaMs: number;
  writeMode: StdoutRendererWriteMode;
  fps: number;
  bytesPerSec: number;
}

const metrics: StdoutRendererMetrics = {
  lastFrameAt: 0,
  lastFrameBytes: 0,
  lastWriteMs: 0,
  writeEmaMs: 0,
  writeMode: "stream",
  fps: 0,
  bytesPerSec: 0,
};

let bucketStart = 0;
let bucketFrames = 0;
let bucketBytes = 0;

export function getStdoutRendererMetrics(): StdoutRendererMetrics {
  return metrics;
}

export function recordStdoutFrame(
  info: Readonly<{
    at: number;
    bytes: number;
    writeMs: number;
    writeEmaMs: number;
    writeMode: StdoutRendererWriteMode;
  }>,
): void {
  const at = Number(info.at);
  if (!Number.isFinite(at)) return;

  const bytes = Math.max(0, Math.floor(Number(info.bytes) || 0));
  const writeMs = Math.max(0, Number(info.writeMs) || 0);
  const writeEmaMs = Math.max(0, Number(info.writeEmaMs) || 0);
  const writeMode = info.writeMode;

  metrics.lastFrameAt = at;
  metrics.lastFrameBytes = bytes;
  metrics.lastWriteMs = writeMs;
  metrics.writeEmaMs = writeEmaMs;
  metrics.writeMode = writeMode;

  if (bucketStart === 0) bucketStart = at;
  bucketFrames++;
  bucketBytes += bytes;

  const elapsed = at - bucketStart;
  if (elapsed > 0) {
    metrics.fps = (bucketFrames * 1000) / elapsed;
    metrics.bytesPerSec = (bucketBytes * 1000) / elapsed;
  }

  if (elapsed >= 1000) {
    bucketStart = at;
    bucketFrames = 0;
    bucketBytes = 0;
  }
}
