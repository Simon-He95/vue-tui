export interface WheelScrollState {
  accumulator: number;
  lastAt: number;
  lastEdgeDir: number;
  lastEdgeAt: number;
}

export interface WheelScrollResult {
  nextTop: number;
  dir: -1 | 0 | 1;
  lines: number;
}

export type WheelDeltaMode = "auto" | "line" | "pixel";

export interface WheelScrollOptions {
  disableAcceleration?: boolean;
}

const LINE_UNIT_THRESHOLD = 3;
const PIXELS_PER_LINE = 16;
const ACCEL_WINDOW_MS = 120;
const MAX_ACCEL = 26;
const EDGE_BOUNCE_MS = 120;
// Some terminals (notably Ghostty) can emit 2+ wheel ticks per one physical wheel step,
// with very small intervals (~4ms). Treat those as a single logical tick.
const MIN_TICK_INTERVAL_MS = 6;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isLineUnitDelta(deltaY: number, mode: WheelDeltaMode = "auto"): boolean {
  if (mode === "line") return true;
  if (mode === "pixel") return false;
  const abs = Math.abs(deltaY);
  return abs > 0 && abs <= LINE_UNIT_THRESHOLD && Number.isInteger(deltaY);
}

function normalizeDelta(deltaY: number, mode: WheelDeltaMode = "auto"): number {
  if (mode === "line") return deltaY;
  if (mode === "pixel") return deltaY / PIXELS_PER_LINE;
  const abs = Math.abs(deltaY);
  // Heuristic: treat small integer deltas as "line units" (WheelEvent.deltaMode=1),
  // otherwise interpret as pixels and normalize.
  if (abs <= LINE_UNIT_THRESHOLD && Number.isInteger(deltaY)) return deltaY;
  return deltaY / PIXELS_PER_LINE;
}

function accelFactor(now: number, lastAt: number): number {
  const dt = now - lastAt;
  if (!Number.isFinite(dt) || dt <= 0 || dt > ACCEL_WINDOW_MS) return 1;
  const t = 1 - dt / ACCEL_WINDOW_MS;
  return 1 + t * (MAX_ACCEL - 1);
}

export function createWheelScrollState(): WheelScrollState {
  return {
    accumulator: 0,
    lastAt: 0,
    lastEdgeDir: 0,
    lastEdgeAt: 0,
  };
}

export function resetWheelScrollState(state: WheelScrollState): void {
  state.accumulator = 0;
  state.lastAt = 0;
  state.lastEdgeDir = 0;
  state.lastEdgeAt = 0;
}

export function applyWheelScroll(
  state: WheelScrollState,
  deltaY: number,
  scrollTop: number,
  maxTop: number,
  now: number = Date.now(),
  deltaMode: WheelDeltaMode = "auto",
  options: WheelScrollOptions = {},
): WheelScrollResult {
  if (!Number.isFinite(deltaY) || deltaY === 0 || maxTop <= 0) {
    if (maxTop <= 0) {
      state.accumulator = 0;
      state.lastEdgeDir = 0;
      state.lastEdgeAt = 0;
    }
    return { nextTop: scrollTop, dir: 0, lines: 0 };
  }

  const dt = state.lastAt ? now - state.lastAt : Infinity;
  const lineUnits = isLineUnitDelta(deltaY, deltaMode);
  if (lineUnits && dt !== Infinity && dt >= 0 && dt < MIN_TICK_INTERVAL_MS)
    return { nextTop: scrollTop, dir: 0, lines: 0 };

  const accel = lineUnits
    ? 1
    : options.disableAcceleration
      ? 1
      : state.lastAt
        ? accelFactor(now, state.lastAt)
        : 1;
  state.lastAt = now;

  state.accumulator += normalizeDelta(deltaY, deltaMode) * accel;
  const lines = Math.trunc(state.accumulator);
  if (lines === 0) return { nextTop: scrollTop, dir: 0, lines: 0 };

  state.accumulator -= lines;
  const dir = lines > 0 ? 1 : -1;
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop >= maxTop;

  if ((dir < 0 && atTop) || (dir > 0 && atBottom)) {
    state.lastEdgeDir = dir;
    state.lastEdgeAt = now;
    state.accumulator = 0;
    return { nextTop: scrollTop, dir: 0, lines: 0 };
  }

  if (
    state.lastEdgeDir !== 0 &&
    now - state.lastEdgeAt < EDGE_BOUNCE_MS &&
    dir === -state.lastEdgeDir &&
    (atTop || atBottom)
  ) {
    return { nextTop: scrollTop, dir: 0, lines: 0 };
  }

  const unclamped = scrollTop + lines;
  const nextTop = clamp(unclamped, 0, maxTop);
  if (nextTop === scrollTop) {
    state.accumulator = 0;
    return { nextTop: scrollTop, dir: 0, lines: 0 };
  }
  if (nextTop !== unclamped) state.accumulator = 0;

  state.lastEdgeDir = 0;
  return {
    nextTop,
    dir: nextTop > scrollTop ? 1 : -1,
    lines: nextTop - scrollTop,
  };
}
