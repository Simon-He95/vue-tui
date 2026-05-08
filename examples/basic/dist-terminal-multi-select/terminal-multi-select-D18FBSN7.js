import process$1 from "node:process";
import { appendFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
const ANSI_PALETTE_HEX = Object.freeze({
  black: "#000000",
  red: "#c91b00",
  green: "#00c200",
  yellow: "#c7c400",
  blue: "#0225c7",
  magenta: "#c930c7",
  cyan: "#00c5c7",
  white: "#c7c7c7",
  blackBright: "#686868",
  redBright: "#ff6e67",
  greenBright: "#5ffa68",
  yellowBright: "#fffc67",
  blueBright: "#6871ff",
  magentaBright: "#ff76ff",
  cyanBright: "#5ffdff",
  whiteBright: "#ffffff"
});
function ansiHexToRgb(hex) {
  const h2 = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h2.length !== 6) return void 0;
  const r = Number.parseInt(h2.slice(0, 2), 16);
  const g = Number.parseInt(h2.slice(2, 4), 16);
  const b = Number.parseInt(h2.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return void 0;
  return { r, g, b };
}
const ANSI_PALETTE_RGB = Object.freeze(
  Object.fromEntries(
    Object.entries(ANSI_PALETTE_HEX).map(([k, v]) => [k, ansiHexToRgb(v)])
  )
);
function isAnsiColorName(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(ANSI_PALETTE_HEX, name);
}
function ansiColorRgb(name, palette) {
  if (!isAnsiColorName(name)) return void 0;
  const custom = palette?.[name];
  if (custom) return ansiHexToRgb(custom) ?? ANSI_PALETTE_RGB[name];
  return ANSI_PALETTE_RGB[name];
}
const ANSI8_COLOR_NAMES = Object.freeze([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white"
]);
const ANSI16_COLOR_NAMES = Object.freeze([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright"
]);
const ESC$2 = "\x1B[";
const SGR_RESET = `${ESC$2}0m`;
const SGR_BOLD = `${ESC$2}1m`;
const SGR_DIM = `${ESC$2}2m`;
const SGR_ITALIC = `${ESC$2}3m`;
const SGR_UNDERLINE = `${ESC$2}4m`;
const SGR_INVERSE = `${ESC$2}7m`;
function toAnsi8ColorName(name) {
  switch (name) {
    case "black":
    case "red":
    case "green":
    case "yellow":
    case "blue":
    case "magenta":
    case "cyan":
    case "white":
      return name;
    case "blackBright":
      return "black";
    case "redBright":
      return "red";
    case "greenBright":
      return "green";
    case "yellowBright":
      return "yellow";
    case "blueBright":
      return "blue";
    case "magentaBright":
      return "magenta";
    case "cyanBright":
      return "cyan";
    case "whiteBright":
      return "white";
  }
}
const ANSI16_FG_CODE = Object.freeze({
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97
});
const ANSI16_BG_CODE = Object.freeze({
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47,
  blackBright: 100,
  redBright: 101,
  greenBright: 102,
  yellowBright: 103,
  blueBright: 104,
  magentaBright: 105,
  cyanBright: 106,
  whiteBright: 107
});
function ansi8FgOpen(name) {
  const base = toAnsi8ColorName(name);
  const idx = ANSI8_COLOR_NAMES.indexOf(base);
  return `${ESC$2}${30 + (idx < 0 ? 7 : idx)}m`;
}
function ansi8BgOpen(name) {
  const base = toAnsi8ColorName(name);
  const idx = ANSI8_COLOR_NAMES.indexOf(base);
  return `${ESC$2}${40 + (idx < 0 ? 0 : idx)}m`;
}
function ansi16FgOpen(name) {
  return `${ESC$2}${ANSI16_FG_CODE[name]}m`;
}
function ansi16BgOpen(name) {
  return `${ESC$2}${ANSI16_BG_CODE[name]}m`;
}
function ansi256FgOpen(index) {
  const n = clampAnsiIndex(index);
  return `${ESC$2}38;5;${n}m`;
}
function ansi256BgOpen(index) {
  const n = clampAnsiIndex(index);
  return `${ESC$2}48;5;${n}m`;
}
function truecolorFgOpen(rgb) {
  return `${ESC$2}38;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}
function truecolorBgOpen(rgb) {
  return `${ESC$2}48;2;${clampByte(rgb.r)};${clampByte(rgb.g)};${clampByte(rgb.b)}m`;
}
function ansi256ToRgb$1(index) {
  const n = clampAnsiIndex(index);
  if (n < 16) {
    const name = ANSI16_COLOR_NAMES[n] ?? "white";
    return ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10;
    return { r: c, g: c, b: c };
  }
  const i = n - 16;
  const rr = Math.floor(i / 36);
  const gg = Math.floor(i % 36 / 6);
  const bb = i % 6;
  const levels = [0, 95, 135, 175, 215, 255];
  return { r: levels[rr], g: levels[gg], b: levels[bb] };
}
function rgbToAnsi256(rgb) {
  const r = clampByte(rgb.r);
  const g = clampByte(rgb.g);
  const b = clampByte(rgb.b);
  const levels = [0, 95, 135, 175, 215, 255];
  const nearestLevelIndex = (v) => {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levels.length; i++) {
      const d = (v - levels[i]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };
  const ri = nearestLevelIndex(r);
  const gi = nearestLevelIndex(g);
  const bi = nearestLevelIndex(b);
  const cubeIndex = 16 + 36 * ri + 6 * gi + bi;
  const cube = ansi256ToRgb$1(cubeIndex);
  const cubeDist = (r - cube.r) ** 2 + (g - cube.g) ** 2 + (b - cube.b) ** 2;
  const gray = Math.round((r + g + b) / 3);
  const grayIndex = gray < 8 ? 16 : gray > 248 ? 231 : 232 + Math.round((gray - 8) / 10);
  const grayRgb = ansi256ToRgb$1(grayIndex);
  const grayDist = (r - grayRgb.r) ** 2 + (g - grayRgb.g) ** 2 + (b - grayRgb.b) ** 2;
  return grayDist < cubeDist ? grayIndex : cubeIndex;
}
function rgbToAnsi16(rgb) {
  const r = clampByte(rgb.r);
  const g = clampByte(rgb.g);
  const b = clampByte(rgb.b);
  let best = "white";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const name of ANSI16_COLOR_NAMES) {
    const candidate = ansiColorRgb(name) ?? { r: 255, g: 255, b: 255 };
    const dr = r - candidate.r;
    const dg = g - candidate.g;
    const db = b - candidate.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}
function clampAnsiIndex(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(n)));
}
function clampByte(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}
const EVENT_OP_ID = Symbol("dimcode.cliLatencyOpId");
const DEFAULT_LOG_PATH = "/tmp/dimcode-cli-latency.jsonl";
const INVALIDATE_ASSOCIATION_WINDOW_MS = 32;
const MAX_OP_AGE_MS = 5e3;
let nextOpId = 1;
let singleton;
function now$1() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function diffMs(end, start) {
  if (end == null || start == null) return null;
  return Math.max(0, end - start);
}
function parseEnabled$1(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
function isTrackedEventType(type) {
  return type === "keydown" || type === "beforeinput" || type === "input" || type === "paste";
}
function defineOpId(target, id) {
  try {
    Object.defineProperty(target, EVENT_OP_ID, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: id
    });
  } catch {
  }
}
function readOpId(target) {
  const value = target?.[EVENT_OP_ID];
  return typeof value === "number" ? value : null;
}
function createDisabledProfiler() {
  return null;
}
function createProfiler() {
  const env = process$1?.env ?? {};
  if (!parseEnabled$1(env.DIMCODE_PROFILE_INPUT_LATENCY)) return createDisabledProfiler();
  const logPath = String(env.DIMCODE_PROFILE_INPUT_LATENCY_LOG_PATH ?? DEFAULT_LOG_PATH).trim() || DEFAULT_LOG_PATH;
  const ops = /* @__PURE__ */ new Map();
  const pendingCommitIds = /* @__PURE__ */ new Set();
  const pendingWriteIds = /* @__PURE__ */ new Set();
  let currentDispatchOpId = null;
  let lastDispatchOpId = null;
  let lastDispatchEndedAt = null;
  let currentFlushIds = [];
  let lastRawInputAt = null;
  const emit2 = (record) => {
    try {
      appendFileSync(logPath, `${JSON.stringify(record)}
`);
    } catch {
    }
  };
  const cleanupOp = (id) => {
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
  const flushOp = (op, outcome) => {
    const totalStart = op.rawInputAt ?? op.stdinDispatchAt ?? op.dispatchStartAt;
    emit2({
      ts: op.createdAtIso,
      id: op.id,
      event: {
        type: op.eventType,
        key: op.key,
        code: op.code,
        defaultPrevented: op.defaultPrevented,
        parser: op.parser
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
        writeEndAt: op.writeEndAt
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
        totalToWrite: diffMs(op.writeEndAt, totalStart)
      },
      scheduler: {
        invalidatePriority: op.invalidatePriority,
        invalidatePlane: op.invalidatePlane,
        commitSync: op.commitSync,
        commitPlaneCount: op.commitPlaneCount,
        commitDirtyRows: op.commitDirtyRows,
        stdoutQueuedDelayMs: op.stdoutQueuedDelayMs,
        writeMode: op.writeMode,
        writeBytes: op.writeBytes
      },
      outcome
    });
    cleanupOp(op.id);
  };
  const expireOldOps = () => {
    const currentTime = now$1();
    for (const op of ops.values()) {
      if (currentTime - op.createdAt < MAX_OP_AGE_MS) continue;
      flushOp(op, op.writeEndAt != null ? "completed" : "timeout");
    }
  };
  const flushPendingOps = (outcome) => {
    for (const op of Array.from(ops.values()))
      flushOp(op, op.writeEndAt != null ? "completed" : outcome);
  };
  const ensureOp = (event) => {
    const type = String(event?.type ?? "");
    if (!isTrackedEventType(type)) return null;
    const existingId = readOpId(event);
    if (existingId != null) {
      return ops.get(existingId) ?? null;
    }
    const id = nextOpId++;
    const op = {
      id,
      createdAt: now$1(),
      createdAtIso: (/* @__PURE__ */ new Date()).toISOString(),
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
      parser: null
    };
    ops.set(id, op);
    defineOpId(event, id);
    expireOldOps();
    return op;
  };
  const forIds = (ids, fn) => {
    for (const id of ids) {
      const op = ops.get(id);
      if (!op) continue;
      fn(op);
    }
  };
  const resolveActiveOp = () => {
    if (currentDispatchOpId != null) return ops.get(currentDispatchOpId) ?? null;
    if (lastDispatchOpId != null && lastDispatchEndedAt != null && now$1() - lastDispatchEndedAt <= INVALIDATE_ASSOCIATION_WINDOW_MS) {
      return ops.get(lastDispatchOpId) ?? null;
    }
    return null;
  };
  process$1?.once?.("exit", () => {
    flushPendingOps("process-exit");
  });
  return {
    enabled: true,
    recordRawInput(_info) {
      lastRawInputAt = now$1();
      expireOldOps();
    },
    recordStdinDispatch(event, info) {
      const op = ensureOp(event);
      if (!op) return;
      if (op.rawInputAt == null && lastRawInputAt != null) op.rawInputAt = lastRawInputAt;
      if (op.stdinDispatchAt == null) op.stdinDispatchAt = now$1();
      if (!op.parser && info?.parser) op.parser = String(info.parser);
    },
    recordEventDispatchStart(event) {
      const op = ensureOp(event);
      if (!op) return;
      currentDispatchOpId = op.id;
      if (op.dispatchStartAt == null) op.dispatchStartAt = now$1();
    },
    recordEventDispatchEnd(event, info) {
      const op = ensureOp(event);
      if (!op) return;
      op.defaultPrevented = Boolean(info.defaultPrevented);
      if (op.dispatchEndAt == null) op.dispatchEndAt = now$1();
      currentDispatchOpId = currentDispatchOpId === op.id ? null : currentDispatchOpId;
      lastDispatchOpId = op.id;
      lastDispatchEndedAt = op.dispatchEndAt;
    },
    recordSchedulerInvalidate(info) {
      const op = resolveActiveOp();
      if (!op) return;
      if (op.invalidateAt == null) op.invalidateAt = now$1();
      if (!op.invalidatePriority && info?.priority) op.invalidatePriority = String(info.priority);
      if (!op.invalidatePlane && info?.plane) op.invalidatePlane = String(info.plane);
      pendingCommitIds.add(op.id);
    },
    recordFlushStart(info) {
      currentFlushIds = Array.from(pendingCommitIds);
      if (!currentFlushIds.length) return;
      const flushTime = now$1();
      forIds(currentFlushIds, (op) => {
        if (op.flushStartAt == null) op.flushStartAt = flushTime;
        if (op.commitSync == null && info?.sync != null) op.commitSync = Boolean(info.sync);
        if (op.commitPlaneCount == null && Array.isArray(info?.activePlanes)) {
          op.commitPlaneCount = info.activePlanes.length;
        }
      });
    },
    recordFlushEnd() {
      if (!currentFlushIds.length) return;
      const flushTime = now$1();
      forIds(currentFlushIds, (op) => {
        if (op.flushEndAt == null) op.flushEndAt = flushTime;
      });
      currentFlushIds = [];
    },
    recordCommit(info) {
      if (!pendingCommitIds.size) return;
      const commitTime = now$1();
      const ids = Array.from(pendingCommitIds);
      pendingCommitIds.clear();
      forIds(ids, (op) => {
        if (op.flushEndAt == null && op.flushStartAt != null) op.flushEndAt = commitTime;
        if (op.commitAt == null) op.commitAt = commitTime;
        op.commitSync = info?.sync == null ? op.commitSync : Boolean(info.sync);
        op.commitPlaneCount = Array.isArray(info?.planes) ? info.planes.length : op.commitPlaneCount;
        op.commitDirtyRows = Array.isArray(info?.dirtyRows) ? info.dirtyRows.length : info?.dirtyRows === null ? null : op.commitDirtyRows;
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
      const renderTime = now$1();
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
      const writeEndTime = now$1();
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
    }
  };
}
function getCliLatencyProfiler() {
  if (singleton !== void 0) return singleton;
  singleton = createProfiler();
  return singleton;
}
function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function keyEvent(key, code = "", mods, repeat) {
  const base = { type: "keydown", key, code, ...mods };
  return repeat ? { ...base, repeat: true } : base;
}
function modsFromXtermModifier(mod) {
  if (!mod || !Number.isFinite(mod)) return null;
  const m = Math.floor(mod);
  const out2 = {};
  if (m === 2 || m === 4 || m === 6 || m === 8 || m === 10 || m === 12 || m === 14 || m === 16) {
    out2.shiftKey = true;
  }
  if (m === 3 || m === 4 || m === 7 || m === 8 || m === 11 || m === 12 || m === 15 || m === 16) {
    out2.altKey = true;
  }
  if (m === 5 || m === 6 || m === 7 || m === 8 || m === 13 || m === 14 || m === 15 || m === 16) {
    out2.ctrlKey = true;
  }
  if (m >= 9) {
    out2.metaKey = m === 9 || m === 10 || m === 11 || m === 12 || m === 13 || m === 14 || m === 15 || m === 16;
  }
  return Object.keys(out2).length ? out2 : null;
}
function modsFromKittyMask(mask) {
  if (!Number.isFinite(mask) || mask <= 0) return null;
  const m = Math.floor(mask);
  const out2 = {};
  if (m & 1) out2.shiftKey = true;
  if (m & 2) out2.altKey = true;
  if (m & 4) out2.ctrlKey = true;
  if (m & 8) out2.metaKey = true;
  if (m & 32) out2.metaKey = true;
  return Object.keys(out2).length ? out2 : null;
}
function modsFromKittyModifier(mod) {
  if (!mod || !Number.isFinite(mod)) return null;
  const mask = Math.floor(mod) - 1;
  return modsFromKittyMask(mask);
}
const KITTY_FUNCTIONAL_KEYS = {
  57344: { key: "Escape", code: "Escape" },
  57345: { key: "Enter", code: "Enter" },
  57346: { key: "Tab", code: "Tab" },
  57347: { key: "Backspace", code: "Backspace" },
  57348: { key: "Insert", code: "Insert" },
  57349: { key: "Delete", code: "Delete" },
  57350: { key: "ArrowLeft", code: "ArrowLeft" },
  57351: { key: "ArrowRight", code: "ArrowRight" },
  57352: { key: "ArrowUp", code: "ArrowUp" },
  57353: { key: "ArrowDown", code: "ArrowDown" },
  57354: { key: "PageUp", code: "PageUp" },
  57355: { key: "PageDown", code: "PageDown" },
  57356: { key: "Home", code: "Home" },
  57357: { key: "End", code: "End" },
  57358: { key: "CapsLock", code: "CapsLock" },
  57359: { key: "ScrollLock", code: "ScrollLock" },
  57360: { key: "NumLock", code: "NumLock" },
  57361: { key: "PrintScreen", code: "PrintScreen" },
  57362: { key: "Pause", code: "Pause" },
  57363: { key: "ContextMenu", code: "ContextMenu" },
  57364: { key: "F1", code: "F1" },
  57365: { key: "F2", code: "F2" },
  57366: { key: "F3", code: "F3" },
  57367: { key: "F4", code: "F4" },
  57368: { key: "F5", code: "F5" },
  57369: { key: "F6", code: "F6" },
  57370: { key: "F7", code: "F7" },
  57371: { key: "F8", code: "F8" },
  57372: { key: "F9", code: "F9" },
  57373: { key: "F10", code: "F10" },
  57374: { key: "F11", code: "F11" },
  57375: { key: "F12", code: "F12" },
  57376: { key: "F13", code: "F13" },
  57377: { key: "F14", code: "F14" },
  57378: { key: "F15", code: "F15" },
  57379: { key: "F16", code: "F16" },
  57380: { key: "F17", code: "F17" },
  57381: { key: "F18", code: "F18" },
  57382: { key: "F19", code: "F19" },
  57383: { key: "F20", code: "F20" },
  57384: { key: "F21", code: "F21" },
  57385: { key: "F22", code: "F22" },
  57386: { key: "F23", code: "F23" },
  57387: { key: "F24", code: "F24" },
  57388: { key: "F25", code: "F25" },
  57389: { key: "F26", code: "F26" },
  57390: { key: "F27", code: "F27" },
  57391: { key: "F28", code: "F28" },
  57392: { key: "F29", code: "F29" },
  57393: { key: "F30", code: "F30" },
  57394: { key: "F31", code: "F31" },
  57395: { key: "F32", code: "F32" },
  57396: { key: "F33", code: "F33" },
  57397: { key: "F34", code: "F34" },
  57398: { key: "F35", code: "F35" },
  57399: { key: "0", code: "Numpad0" },
  57400: { key: "1", code: "Numpad1" },
  57401: { key: "2", code: "Numpad2" },
  57402: { key: "3", code: "Numpad3" },
  57403: { key: "4", code: "Numpad4" },
  57404: { key: "5", code: "Numpad5" },
  57405: { key: "6", code: "Numpad6" },
  57406: { key: "7", code: "Numpad7" },
  57407: { key: "8", code: "Numpad8" },
  57408: { key: "9", code: "Numpad9" },
  57409: { key: ".", code: "NumpadDecimal" },
  57410: { key: "/", code: "NumpadDivide" },
  57411: { key: "*", code: "NumpadMultiply" },
  57412: { key: "-", code: "NumpadSubtract" },
  57413: { key: "+", code: "NumpadAdd" },
  57414: { key: "Enter", code: "NumpadEnter" },
  57415: { key: "=", code: "NumpadEqual" },
  57416: { key: ",", code: "NumpadComma" },
  57417: { key: "ArrowLeft", code: "NumpadArrowLeft" },
  57418: { key: "ArrowRight", code: "NumpadArrowRight" },
  57419: { key: "ArrowUp", code: "NumpadArrowUp" },
  57420: { key: "ArrowDown", code: "NumpadArrowDown" },
  57421: { key: "PageUp", code: "NumpadPageUp" },
  57422: { key: "PageDown", code: "NumpadPageDown" },
  57423: { key: "Home", code: "NumpadHome" }
};
const KITTY_SPECIAL_KEY_RE = /^\x1B\[(\d+);(\d+):(\d+)([A-Z~])$/;
const KITTY_FUNCTIONAL_KEY_TERMINATORS = {
  A: { key: "ArrowUp", code: "ArrowUp" },
  B: { key: "ArrowDown", code: "ArrowDown" },
  C: { key: "ArrowRight", code: "ArrowRight" },
  D: { key: "ArrowLeft", code: "ArrowLeft" },
  H: { key: "Home", code: "Home" },
  F: { key: "End", code: "End" },
  P: { key: "F1", code: "F1" },
  Q: { key: "F2", code: "F2" },
  R: { key: "F3", code: "F3" },
  S: { key: "F4", code: "F4" }
};
const KITTY_TILDE_KEYS = {
  1: { key: "Home", code: "Home" },
  2: { key: "Insert", code: "Insert" },
  3: { key: "Delete", code: "Delete" },
  4: { key: "End", code: "End" },
  5: { key: "PageUp", code: "PageUp" },
  6: { key: "PageDown", code: "PageDown" },
  7: { key: "Home", code: "Home" },
  8: { key: "End", code: "End" },
  11: { key: "F1", code: "F1" },
  12: { key: "F2", code: "F2" },
  13: { key: "F3", code: "F3" },
  14: { key: "F4", code: "F4" },
  15: { key: "F5", code: "F5" },
  17: { key: "F6", code: "F6" },
  18: { key: "F7", code: "F7" },
  19: { key: "F8", code: "F8" },
  20: { key: "F9", code: "F9" },
  21: { key: "F10", code: "F10" },
  23: { key: "F11", code: "F11" },
  24: { key: "F12", code: "F12" }
};
function parseEventType(eventType) {
  if (eventType === "2") return { repeat: true, release: false };
  if (eventType === "3") return { repeat: false, release: true };
  return { repeat: false, release: false };
}
function parseKittySpecialKey(sequence) {
  const match = KITTY_SPECIAL_KEY_RE.exec(sequence);
  if (!match) return { handled: false, event: null };
  const keyNumOrOne = match[1];
  const modifierStr = match[2];
  const eventTypeStr = match[3];
  const terminator = match[4];
  let mapping;
  if (terminator === "~") {
    mapping = KITTY_TILDE_KEYS[keyNumOrOne];
  } else if (keyNumOrOne === "1") {
    mapping = KITTY_FUNCTIONAL_KEY_TERMINATORS[terminator];
  }
  const eventType = parseEventType(eventTypeStr);
  if (!mapping) return { handled: true, event: null };
  if (eventType.release) return { handled: true, event: null };
  const mods = modsFromKittyModifier(Number.parseInt(modifierStr, 10)) ?? void 0;
  return {
    handled: true,
    event: keyEvent(mapping.key, mapping.code, mods, eventType.repeat)
  };
}
function looksLikeKittyCsiU(cp, modifier, hasColons, fieldCount) {
  if (hasColons || fieldCount > 2) return true;
  if (cp >= 57344) return true;
  if (modifier != null && modifier > 16) return true;
  if (modifier != null && modifier >= 2) {
    if (cp === 13 || cp === 9 || cp === 27 || cp === 127) return true;
  }
  return false;
}
function parseKittyCsiU(sequence) {
  const match = /^\x1B\[([^\x1B]+)u$/.exec(sequence);
  if (!match) return { handled: false, event: null };
  const params = match[1];
  const fields = params.split(";");
  const field1 = fields[0] ?? "";
  const field1Parts = field1.split(":");
  const codepointStr = field1Parts[0] ?? "";
  const cp = Number.parseInt(codepointStr, 10);
  const field2 = fields[1] ?? "";
  const field2Parts = field2.split(":");
  const modifier = field2Parts[0] ? Number.parseInt(field2Parts[0], 10) : null;
  const eventTypeStr = field2Parts[1];
  const hasColons = field1Parts.length > 1 || field2Parts.length > 1;
  if (!Number.isFinite(cp)) return { handled: true, event: null };
  if (!looksLikeKittyCsiU(cp, modifier, hasColons, fields.length))
    return { handled: false, event: null };
  const eventType = parseEventType(eventTypeStr);
  if (eventType.release) return { handled: true, event: null };
  const mods = modsFromKittyModifier(modifier) ?? void 0;
  const functionalKey = KITTY_FUNCTIONAL_KEYS[cp];
  if (functionalKey) {
    return {
      handled: true,
      event: keyEvent(functionalKey.key, functionalKey.code, mods, eventType.repeat)
    };
  }
  if (cp === 13) {
    return {
      handled: true,
      event: keyEvent("Enter", "Enter", mods, eventType.repeat)
    };
  }
  if (cp === 9) {
    return {
      handled: true,
      event: keyEvent("Tab", "Tab", mods, eventType.repeat)
    };
  }
  if (cp === 27) {
    return {
      handled: true,
      event: keyEvent("Escape", "Escape", mods, eventType.repeat)
    };
  }
  if (cp === 127) {
    return {
      handled: true,
      event: keyEvent("Backspace", "Backspace", mods, eventType.repeat)
    };
  }
  if (cp >= 32) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), "", mods, eventType.repeat)
      };
    } catch {
      return { handled: true, event: null };
    }
  }
  return { handled: true, event: null };
}
function parseKittySequence(sequence) {
  const special = parseKittySpecialKey(sequence);
  if (special.handled) return special;
  return parseKittyCsiU(sequence);
}
function parseMouseSgr(sequence) {
  if (!sequence.startsWith("\x1B[<")) return { handled: false, event: null };
  const env = process$1?.env ?? {};
  const invertWheel = String(env.DIMCODE_WHEEL_INVERT ?? env.VUE_TUI_WHEEL_INVERT ?? "") === "1";
  const mouseDebugEnabled = String(env.DIMCODE_MOUSE_DEBUG ?? env.VUE_TUI_MOUSE_DEBUG ?? "") === "1";
  const mouseDebugPath = String(
    env.DIMCODE_MOUSE_DEBUG_PATH ?? env.VUE_TUI_MOUSE_DEBUG_PATH ?? "/tmp/goatchain-mouse-debug.log"
  );
  const debug = (msg) => {
    if (!mouseDebugEnabled) return;
    try {
      appendFileSync(mouseDebugPath, `${msg}
`);
    } catch {
    }
  };
  let i = 3;
  const readInt = () => {
    const start = i;
    while (i < sequence.length) {
      const c = sequence.charCodeAt(i);
      if (c < 48 || c > 57) break;
      i++;
    }
    if (i === start) return null;
    return Number.parseInt(sequence.slice(start, i), 10);
  };
  const b = readInt();
  if (b == null || sequence[i] !== ";") return { handled: true, event: null };
  i++;
  const x = readInt();
  if (x == null || sequence[i] !== ";") return { handled: true, event: null };
  i++;
  const y = readInt();
  if (y == null) return { handled: true, event: null };
  const kind = sequence[i];
  if (kind !== "m" && kind !== "M") return { handled: true, event: null };
  i++;
  const up = kind === "m";
  const cellX = Math.max(0, x - 1);
  const cellY = Math.max(0, y - 1);
  const shiftKey = Boolean(b & 4);
  const altKey = Boolean(b & 8);
  const ctrlKey = Boolean(b & 16);
  if ((b & 64) === 64) {
    let deltaY = b & 1 ? 1 : -1;
    if (invertWheel) deltaY = -deltaY;
    debug(
      `[${Date.now()}] [MOUSE] wheel b=${b} bit1=${b & 1} deltaY=${deltaY} x=${cellX} y=${cellY}`
    );
    return {
      handled: true,
      event: { type: "wheel", cellX, cellY, deltaY, shiftKey, altKey, ctrlKey }
    };
  }
  const button = b & 3;
  if (!up && (b & 32) === 0 && button === 3) {
    debug(
      `[${Date.now()}] [MOUSE] up(button=3 as M) b=${b} x=${cellX} y=${cellY} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`
    );
    return {
      handled: true,
      event: {
        type: "pointerup",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey
      }
    };
  }
  if (up) {
    debug(
      `[${Date.now()}] [MOUSE] up b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`
    );
    return {
      handled: true,
      event: {
        type: "pointerup",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey
      }
    };
  }
  if (b & 32) {
    debug(
      `[${Date.now()}] [MOUSE] move b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`
    );
    return {
      handled: true,
      event: {
        type: "pointermove",
        cellX,
        cellY,
        button,
        shiftKey,
        altKey,
        ctrlKey
      }
    };
  }
  debug(
    `[${Date.now()}] [MOUSE] down b=${b} x=${cellX} y=${cellY} button=${button} shift=${Number(shiftKey)} alt=${Number(altKey)} ctrl=${Number(ctrlKey)}`
  );
  return {
    handled: true,
    event: {
      type: "pointerdown",
      cellX,
      cellY,
      button,
      shiftKey,
      altKey,
      ctrlKey
    }
  };
}
function parseMouseSequence(sequence) {
  return parseMouseSgr(sequence);
}
function parseCsiU(parts, params) {
  if (params.includes(":")) return { handled: false, event: null };
  const cp = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN;
  if (!Number.isFinite(cp)) return { handled: true, event: null };
  if (cp >= 57344) return { handled: false, event: null };
  const mod = parts[1] ? Number.parseInt(parts[1], 10) : null;
  const mods = modsFromXtermModifier(mod) ?? void 0;
  if (cp === 13) return { handled: true, event: keyEvent("Enter", "Enter", mods) };
  if (cp === 9) return { handled: true, event: keyEvent("Tab", "Tab", mods) };
  if (cp === 27) return { handled: true, event: keyEvent("Escape", "Escape", mods) };
  if (cp === 127) return { handled: true, event: keyEvent("Backspace", "Backspace", mods) };
  if (cp >= 32) {
    try {
      return {
        handled: true,
        event: keyEvent(String.fromCodePoint(cp), "", mods)
      };
    } catch {
      return { handled: true, event: null };
    }
  }
  return { handled: true, event: null };
}
function parseCsi(sequence) {
  if (!sequence.startsWith("\x1B[")) return { handled: false, event: null };
  if (sequence.length < 3) return { handled: true, event: null };
  const final = sequence[sequence.length - 1];
  const params = sequence.slice(2, -1);
  const parts = params ? params.split(";") : [""];
  if (final === "u") return parseCsiU(parts, params);
  if (final === "Z") return { handled: true, event: keyEvent("Tab", "Tab", { shiftKey: true }) };
  const mod = parts.length >= 2 ? Number.parseInt(parts[parts.length - 1], 10) : null;
  const mods = modsFromXtermModifier(mod) ?? void 0;
  if (final === "A") return { handled: true, event: keyEvent("ArrowUp", "ArrowUp", mods) };
  if (final === "B") return { handled: true, event: keyEvent("ArrowDown", "ArrowDown", mods) };
  if (final === "C") return { handled: true, event: keyEvent("ArrowRight", "ArrowRight", mods) };
  if (final === "D") return { handled: true, event: keyEvent("ArrowLeft", "ArrowLeft", mods) };
  if (final === "H") return { handled: true, event: keyEvent("Home", "Home", mods) };
  if (final === "F") return { handled: true, event: keyEvent("End", "End", mods) };
  if (final === "~") {
    if (parts[0] === "27" && parts.length >= 3) {
      const mod2 = Number.parseInt(parts[1], 10);
      const cp = Number.parseInt(parts[2], 10);
      const mods2 = modsFromXtermModifier(mod2) ?? void 0;
      if (cp === 13) return { handled: true, event: keyEvent("Enter", "Enter", mods2) };
      if (cp === 9) return { handled: true, event: keyEvent("Tab", "Tab", mods2) };
      if (cp === 27) return { handled: true, event: keyEvent("Escape", "Escape", mods2) };
      if (cp >= 32) {
        try {
          return {
            handled: true,
            event: keyEvent(String.fromCodePoint(cp), "", mods2)
          };
        } catch {
          return { handled: true, event: null };
        }
      }
      return { handled: true, event: null };
    }
    const keyCode = parts[0] ? Number.parseInt(parts[0], 10) : Number.NaN;
    if (keyCode === 1 || keyCode === 7)
      return { handled: true, event: keyEvent("Home", "Home", mods) };
    if (keyCode === 4 || keyCode === 8)
      return { handled: true, event: keyEvent("End", "End", mods) };
    if (keyCode === 2) return { handled: true, event: keyEvent("Insert", "Insert", mods) };
    if (keyCode === 3) return { handled: true, event: keyEvent("Delete", "Delete", mods) };
    if (keyCode === 5) return { handled: true, event: keyEvent("PageUp", "PageUp", mods) };
    if (keyCode === 6) return { handled: true, event: keyEvent("PageDown", "PageDown", mods) };
    if (keyCode === 11) return { handled: true, event: keyEvent("F1", "F1", mods) };
    if (keyCode === 12) return { handled: true, event: keyEvent("F2", "F2", mods) };
    if (keyCode === 13) return { handled: true, event: keyEvent("F3", "F3", mods) };
    if (keyCode === 14) return { handled: true, event: keyEvent("F4", "F4", mods) };
    if (keyCode === 15) return { handled: true, event: keyEvent("F5", "F5", mods) };
    if (keyCode === 17) return { handled: true, event: keyEvent("F6", "F6", mods) };
    if (keyCode === 18) return { handled: true, event: keyEvent("F7", "F7", mods) };
    if (keyCode === 19) return { handled: true, event: keyEvent("F8", "F8", mods) };
    if (keyCode === 20) return { handled: true, event: keyEvent("F9", "F9", mods) };
    if (keyCode === 21) return { handled: true, event: keyEvent("F10", "F10", mods) };
    if (keyCode === 23) return { handled: true, event: keyEvent("F11", "F11", mods) };
    if (keyCode === 24) return { handled: true, event: keyEvent("F12", "F12", mods) };
    return { handled: true, event: null };
  }
  return { handled: true, event: null };
}
function parseSs3(sequence) {
  if (!sequence.startsWith("\x1BO")) return { handled: false, event: null };
  if (sequence.length < 3) return { handled: true, event: null };
  const final = sequence[2];
  switch (final) {
    case "A":
      return { handled: true, event: keyEvent("ArrowUp", "ArrowUp") };
    case "B":
      return { handled: true, event: keyEvent("ArrowDown", "ArrowDown") };
    case "C":
      return { handled: true, event: keyEvent("ArrowRight", "ArrowRight") };
    case "D":
      return { handled: true, event: keyEvent("ArrowLeft", "ArrowLeft") };
    case "H":
      return { handled: true, event: keyEvent("Home", "Home") };
    case "F":
      return { handled: true, event: keyEvent("End", "End") };
    case "P":
      return { handled: true, event: keyEvent("F1", "F1") };
    case "Q":
      return { handled: true, event: keyEvent("F2", "F2") };
    case "R":
      return { handled: true, event: keyEvent("F3", "F3") };
    case "S":
      return { handled: true, event: keyEvent("F4", "F4") };
    default:
      return { handled: true, event: null };
  }
}
function parseXtermSequence(sequence) {
  if (!sequence.startsWith("\x1B")) return { handled: false, event: null };
  const csi = parseCsi(sequence);
  if (csi.handled) return csi;
  const ss3 = parseSs3(sequence);
  if (ss3.handled) return ss3;
  return { handled: false, event: null };
}
const ESC$1 = "\x1B";
const BRACKETED_PASTE_START = "\x1B[200~";
const BRACKETED_PASTE_END = "\x1B[201~";
const ESC_CONTINUATION_RESCUE_WINDOW_MS = 64;
function looksLikeQuotedPathPaste(value) {
  if (!value) return false;
  if (value.includes(ESC$1)) return false;
  if (value.length < 12) return false;
  if (!/['"]/.test(value)) return false;
  if (!/[\\/]/.test(value)) return false;
  if (!/['"]\s*(?:~\/|\/|[A-Z]:[\\/]|\\\\)/i.test(value)) return false;
  const last = value[value.length - 1];
  if (last === "'" || last === '"' || /\s/.test(last)) return true;
  return false;
}
function isCompleteSequence(data) {
  if (!data.startsWith(ESC$1)) return "not-escape";
  if (data.length === 1) return "incomplete";
  const afterEsc = data.slice(1);
  if (afterEsc.startsWith("[")) {
    if (afterEsc.startsWith("[M")) return data.length >= 6 ? "complete" : "incomplete";
    return isCompleteCsiSequence(data);
  }
  if (afterEsc.startsWith("]")) return isCompleteOscSequence(data);
  if (afterEsc.startsWith("P")) return isCompleteDcsSequence(data);
  if (afterEsc.startsWith("_")) return isCompleteApcSequence(data);
  if (afterEsc.startsWith("O")) return afterEsc.length >= 2 ? "complete" : "incomplete";
  if (afterEsc.length === 1) return "complete";
  return "complete";
}
function isCompleteCsiSequence(data) {
  if (!data.startsWith(`${ESC$1}[`)) return "complete";
  if (data.length < 3) return "incomplete";
  const payload = data.slice(2);
  const lastChar = payload[payload.length - 1];
  const lastCharCode = lastChar.charCodeAt(0);
  if (lastCharCode >= 64 && lastCharCode <= 126) {
    if (payload.startsWith("<")) {
      if (/^<\d+;\d+;\d+M$/i.test(payload)) return "complete";
      if (lastChar === "M" || lastChar === "m") {
        const parts = payload.slice(1, -1).split(";");
        if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) return "complete";
      }
      return "incomplete";
    }
    return "complete";
  }
  return "incomplete";
}
function isCompleteOscSequence(data) {
  if (!data.startsWith(`${ESC$1}]`)) return "complete";
  if (data.endsWith(`${ESC$1}\\`) || data.endsWith("\x07")) return "complete";
  return "incomplete";
}
function isCompleteDcsSequence(data) {
  if (!data.startsWith(`${ESC$1}P`)) return "complete";
  if (data.endsWith(`${ESC$1}\\`)) return "complete";
  return "incomplete";
}
function isCompleteApcSequence(data) {
  if (!data.startsWith(`${ESC$1}_`)) return "complete";
  if (data.endsWith(`${ESC$1}\\`)) return "complete";
  return "incomplete";
}
function extractCompleteSequences(buffer2) {
  const sequences = [];
  let pos = 0;
  while (pos < buffer2.length) {
    const remaining = buffer2.slice(pos);
    if (remaining.startsWith(ESC$1)) {
      if (remaining.length >= 2 && remaining[1] === ESC$1) {
        sequences.push(ESC$1);
        pos += 1;
        continue;
      }
      let seqEnd = 1;
      while (seqEnd <= remaining.length) {
        const candidate = remaining.slice(0, seqEnd);
        const status = isCompleteSequence(candidate);
        if (status === "complete") {
          sequences.push(candidate);
          pos += seqEnd;
          break;
        }
        if (status === "incomplete") {
          seqEnd++;
          continue;
        }
        sequences.push(candidate);
        pos += seqEnd;
        break;
      }
      if (seqEnd > remaining.length) return { sequences, remainder: remaining };
    } else {
      sequences.push(remaining[0]);
      pos++;
    }
  }
  return { sequences, remainder: "" };
}
function looksLikeSplitEscapeContinuation(value) {
  const first = value[0];
  if (first !== "[" && first !== "]" && first !== "P" && first !== "_" && first !== "O") {
    return false;
  }
  return isCompleteSequence(`${ESC$1}${value}`) !== "not-escape";
}
class StdinBuffer extends EventEmitter {
  buffer = "";
  timeout = null;
  timeoutMs;
  escTimeoutMs;
  pendingEscContinuationAt = null;
  pasteMode = false;
  pasteBuffer = "";
  constructor(options = {}) {
    super();
    this.timeoutMs = options.timeout ?? 10;
    this.escTimeoutMs = options.escTimeout ?? Math.max(this.timeoutMs, 100);
  }
  process(data) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    let str;
    if (Buffer.isBuffer(data)) {
      if (data.length === 1 && data[0] > 127) {
        const byte = data[0] - 128;
        str = `\x1B${String.fromCharCode(byte)}`;
      } else {
        str = data.toString();
      }
    } else {
      str = data;
    }
    if (this.pendingEscContinuationAt != null) {
      const canRescue = Date.now() - this.pendingEscContinuationAt <= ESC_CONTINUATION_RESCUE_WINDOW_MS;
      this.pendingEscContinuationAt = null;
      if (canRescue && looksLikeSplitEscapeContinuation(str)) str = `${ESC$1}${str}`;
    }
    if (str.length === 0 && this.buffer.length === 0) {
      this.emit("data", "");
      return;
    }
    this.buffer += str;
    if (this.pasteMode) {
      this.pasteBuffer += this.buffer;
      this.buffer = "";
      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);
        this.pasteMode = false;
        this.pasteBuffer = "";
        this.emit("paste", pastedContent);
        if (remaining.length > 0) this.process(remaining);
      }
      return;
    }
    const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START);
    if (startIndex !== -1) {
      if (startIndex > 0) {
        const beforePaste = this.buffer.slice(0, startIndex);
        const result2 = extractCompleteSequences(beforePaste);
        for (const sequence of result2.sequences) this.emit("data", sequence);
      }
      this.buffer = this.buffer.slice(startIndex + BRACKETED_PASTE_START.length);
      this.pasteMode = true;
      this.pasteBuffer = this.buffer;
      this.buffer = "";
      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);
        this.pasteMode = false;
        this.pasteBuffer = "";
        this.emit("paste", pastedContent);
        if (remaining.length > 0) this.process(remaining);
      }
      return;
    }
    if (looksLikeQuotedPathPaste(this.buffer)) {
      const payload = this.buffer;
      this.buffer = "";
      this.emit("paste", payload);
      return;
    }
    const result = extractCompleteSequences(this.buffer);
    this.buffer = result.remainder;
    for (const sequence of result.sequences) this.emit("data", sequence);
    if (this.buffer.length > 0) {
      const timeoutMs = this.buffer === ESC$1 ? this.escTimeoutMs : this.timeoutMs;
      this.timeout = setTimeout(() => {
        const rescuableLoneEsc = this.buffer === ESC$1;
        const flushed = this.flush();
        if (rescuableLoneEsc && flushed.length === 1 && flushed[0] === ESC$1)
          this.pendingEscContinuationAt = Date.now();
        for (const sequence of flushed) this.emit("data", sequence);
      }, timeoutMs);
    }
  }
  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.buffer.length === 0) return [];
    const sequences = [this.buffer];
    this.buffer = "";
    return sequences;
  }
  clear() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.buffer = "";
    this.pendingEscContinuationAt = null;
    this.pasteMode = false;
    this.pasteBuffer = "";
  }
  getBuffer() {
    return this.buffer;
  }
  destroy() {
    this.clear();
  }
}
const KITTY_KEYBOARD_PROTOCOL_ENABLE = "\x1B[>1u";
const KITTY_KEYBOARD_PROTOCOL_DISABLE = "\x1B[<u";
const XTERM_MODIFY_OTHER_KEYS_ENABLE = "\x1B[>4;2m";
const XTERM_MODIFY_OTHER_KEYS_DISABLE = "\x1B[>4n";
function isPrintable(ch) {
  if (ch.length === 0) return false;
  if (ch.length === 1) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) return false;
    return true;
  }
  if (ch.length === 2) {
    const code = ch.charCodeAt(0);
    return code >= 55296 && code <= 56319;
  }
  return false;
}
function ctrlKeyFromChar(ch) {
  if (!ch || ch.length !== 1) return null;
  const code = ch.charCodeAt(0);
  if (code >= 1 && code <= 26) return String.fromCharCode(code + 96);
  return null;
}
function isUnhandledCtrlC(event) {
  return event.type === "keydown" && (event.key === "c" || event.key === "C") && event.ctrlKey === true && event.metaKey !== true && event.altKey !== true && event.shiftKey !== true;
}
function parseKeyboardProtocol(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "auto" || normalized === "kitty" || normalized === "xterm" || normalized === "off") {
    return normalized;
  }
  return null;
}
function detectKeyboardProtocol(env) {
  const termProgram = String(env.TERM_PROGRAM ?? "").trim().toLowerCase();
  const term = String(env.TERM ?? "").trim().toLowerCase();
  const hasKittyProtocolTerminal = "GHOSTTY_RESOURCES_DIR" in env || "WEZTERM_PANE" in env || "KITTY_WINDOW_ID" in env || "KITTY_INSTALLATION_DIR" in env || "ALACRITTY_WINDOW_ID" in env || "ALACRITTY_LOG" in env || termProgram.includes("ghostty") || termProgram.includes("wezterm") || termProgram.includes("kitty") || termProgram.includes("alacritty");
  if (hasKittyProtocolTerminal) return "kitty";
  const isScreenLike = "TMUX" in env || term.includes("screen") || term.includes("tmux");
  const hasXtermKeyboardTerminal = termProgram.includes("iterm") || termProgram.includes("apple_terminal") || termProgram.includes("vscode") || term.includes("xterm") && !isScreenLike;
  return hasXtermKeyboardTerminal ? "xterm" : "off";
}
function resolveKeyboardProtocol(options) {
  const configured = parseKeyboardProtocol(options.keyboardProtocol) ?? "auto";
  if (configured !== "auto") return configured;
  const envOverride = parseKeyboardProtocol(options.env?.DIMCODE_KEYBOARD_PROTOCOL);
  if (envOverride && envOverride !== "auto") return envOverride;
  return detectKeyboardProtocol(options.env ?? {});
}
function getKeyboardProtocolSequences(protocol) {
  if (protocol === "kitty") {
    return {
      enable: KITTY_KEYBOARD_PROTOCOL_ENABLE,
      disable: KITTY_KEYBOARD_PROTOCOL_DISABLE
    };
  }
  if (protocol === "xterm") {
    return {
      enable: XTERM_MODIFY_OTHER_KEYS_ENABLE,
      disable: XTERM_MODIFY_OTHER_KEYS_DISABLE
    };
  }
  return null;
}
function createStdinDriver(options) {
  const stdin = options.stdin ?? process$1.stdin;
  const stdout = options.stdout ?? process$1.stdout;
  if (!stdin || !stdout) throw new Error("createStdinDriver requires Node process.stdin/stdout");
  const env = options.env ?? process$1.env ?? {};
  const enableMouse = options.enableMouse ?? true;
  const enableMouseMotion = options.enableMouseMotion ?? false;
  const keyboardProtocol = resolveKeyboardProtocol({
    keyboardProtocol: options.keyboardProtocol,
    env
  });
  const keyboardProtocolSequences = getKeyboardProtocolSequences(keyboardProtocol);
  let disposed = false;
  let swallowNextLF = false;
  let lastMouseDown = null;
  const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  const stdinBuffer = new StdinBuffer({
    timeout: 50,
    // When mouse tracking is enabled, CSI mouse reports are frequent and we really want to avoid
    // leaking "[<...;...;...M" into focused inputs if the leading ESC gets chunk-split.
    // Keep this well below one frame so plain Esc remains responsive while the
    // stdin buffer rescue path still covers delayed CSI continuations.
    escTimeout: enableMouse ? 8 : 6
  });
  const latency = getCliLatencyProfiler();
  const dispatchEvent = (event, parser) => {
    latency?.recordStdinDispatch(event, { parser });
    const prevented = Boolean(options.dispatch(event));
    if (isUnhandledCtrlC(event) && !prevented) options.onExit?.();
    return prevented;
  };
  const handlePlainChar = (ch) => {
    if (swallowNextLF) {
      swallowNextLF = false;
      if (ch === "\n") return;
    }
    if (ch === "") {
      dispatchEvent(keyEvent("c", "", { ctrlKey: true }), "plain");
      return;
    }
    if (ch === "\r") {
      swallowNextLF = true;
      dispatchEvent(keyEvent("Enter", "Enter"), "plain");
      return;
    }
    if (ch === "\n") {
      dispatchEvent(
        {
          type: "input",
          data: "\n",
          inputType: "insertLineBreak",
          text: "\n"
        },
        "plain"
      );
      return;
    }
    const ctrlKey = ctrlKeyFromChar(ch);
    if (ctrlKey) {
      if (ctrlKey === "i") {
        dispatchEvent(keyEvent("Tab", "Tab"), "plain");
        return;
      }
      if (ctrlKey === "h") {
        dispatchEvent(keyEvent("Backspace", "Backspace"), "plain");
        return;
      }
      dispatchEvent(keyEvent(ctrlKey, "", { ctrlKey: true }), "plain");
      return;
    }
    if (ch === "") {
      dispatchEvent(keyEvent("Backspace", "Backspace"), "plain");
      return;
    }
    if (ch === "	") {
      dispatchEvent(keyEvent("Tab", "Tab"), "plain");
      return;
    }
    if (isPrintable(ch)) dispatchEvent(keyEvent(ch), "plain");
  };
  const handleMouseEvent = (event) => {
    const ev = event;
    if (ev.type === "pointerdown") {
      options.dispatch(event);
      lastMouseDown = {
        cellX: ev.cellX,
        cellY: ev.cellY,
        button: ev.button ?? 0,
        shiftKey: Boolean(ev.shiftKey),
        altKey: Boolean(ev.altKey),
        ctrlKey: Boolean(ev.ctrlKey)
      };
    } else if (ev.type === "pointermove") {
      if (lastMouseDown && (ev.button === 3 || ev.button == null)) {
        const down = lastMouseDown;
        lastMouseDown = null;
        options.dispatch({
          type: "pointerup",
          cellX: down.cellX,
          cellY: down.cellY,
          button: 3,
          shiftKey: down.shiftKey,
          altKey: down.altKey,
          ctrlKey: down.ctrlKey
        });
        if (down.button === 0) {
          options.dispatch({
            type: "click",
            cellX: down.cellX,
            cellY: down.cellY,
            shiftKey: down.shiftKey,
            altKey: down.altKey,
            ctrlKey: down.ctrlKey
          });
        }
        return;
      }
      options.dispatch(event);
    } else if (ev.type === "pointerup") {
      options.dispatch(event);
      const down = lastMouseDown;
      lastMouseDown = null;
      const sameCell = down && down.cellX === ev.cellX && down.cellY === ev.cellY;
      if (sameCell && down.button === 0 && (ev.button === 0 || ev.button === 3)) {
        options.dispatch({
          type: "click",
          cellX: ev.cellX,
          cellY: ev.cellY,
          shiftKey: Boolean(ev.shiftKey ?? down?.shiftKey),
          altKey: Boolean(ev.altKey ?? down?.altKey),
          ctrlKey: Boolean(ev.ctrlKey ?? down?.ctrlKey)
        });
      }
    } else {
      options.dispatch(event);
    }
  };
  const handleSequence = (sequence) => {
    if (disposed) return;
    if (!sequence) return;
    if (sequence === "\x1B[I") {
      options.onTerminalFocusChange?.(true);
      return;
    }
    if (sequence === "\x1B[O") {
      options.onTerminalFocusChange?.(false);
      return;
    }
    const mouse = parseMouseSequence(sequence);
    if (mouse.handled) {
      if (mouse.event) handleMouseEvent(mouse.event);
      return;
    }
    const kitty = parseKittySequence(sequence);
    if (kitty.handled) {
      if (kitty.event) dispatchEvent(kitty.event, "kitty");
      return;
    }
    const xterm = parseXtermSequence(sequence);
    if (xterm.handled) {
      if (xterm.event) dispatchEvent(xterm.event, "xterm");
      return;
    }
    if (sequence.startsWith("\x1B")) {
      if (sequence.length === 2 && isPrintable(sequence[1])) {
        dispatchEvent(keyEvent(sequence[1], "", { altKey: true }), "alt");
        return;
      }
      if (sequence.length === 2) {
        const code = sequence.charCodeAt(1);
        if (code === 13) {
          dispatchEvent(keyEvent("Enter", "Enter", { altKey: true }), "alt");
          return;
        }
        if (code === 9) {
          dispatchEvent(keyEvent("Tab", "Tab", { altKey: true }), "alt");
          return;
        }
      }
      if (sequence === "\x1B") {
        dispatchEvent(keyEvent("Escape", "Escape"), "escape");
        return;
      }
      return;
    }
    for (const ch of sequence) handlePlainChar(ch);
  };
  stdinBuffer.on("data", handleSequence);
  stdinBuffer.on("paste", (data) => {
    const pastedText = normalizeNewlines(data);
    if (pastedText) dispatchEvent({ type: "paste", text: pastedText }, "paste");
  });
  const decodeBytes = (bytes) => {
    if (bytes.length === 1 && bytes[0] > 127) {
      const adjusted = bytes[0] - 128;
      stdinBuffer.process(`\x1B${String.fromCharCode(adjusted)}`);
      return;
    }
    const decoded = decoder.decode(bytes, { stream: true });
    if (decoded) stdinBuffer.process(decoded);
  };
  const onData = (chunk) => {
    if (disposed) return;
    latency?.recordRawInput();
    if (typeof chunk === "string") {
      stdinBuffer.process(chunk);
      return;
    }
    if (chunk instanceof ArrayBuffer) {
      decodeBytes(new Uint8Array(chunk));
      return;
    }
    if (ArrayBuffer.isView(chunk)) {
      const view = chunk;
      decodeBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return;
    }
    if (chunk != null) {
      try {
        const decoded = decoder.decode(chunk, { stream: true });
        if (decoded) stdinBuffer.process(decoded);
      } catch {
      }
    }
  };
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", onData);
  if (stdout.isTTY) {
    stdout.write("\x1B[?2004h");
    stdout.write("\x1B[?1004h");
    if (keyboardProtocolSequences) stdout.write(keyboardProtocolSequences.enable);
    if (enableMouse) {
      stdout.write("\x1B[?1007h");
      if (enableMouseMotion) stdout.write("\x1B[?1000h\x1B[?1003h\x1B[?1006h");
      else stdout.write("\x1B[?1000h\x1B[?1002h\x1B[?1006h");
    }
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stdin.off("data", onData);
    stdinBuffer.destroy();
    try {
      stdin.pause();
    } catch {
    }
    try {
      stdin.unref?.();
    } catch {
    }
    if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
    if (stdout.isTTY) {
      stdout.write("\x1B[?2004l");
      stdout.write("\x1B[?1004l");
      if (keyboardProtocolSequences) stdout.write(keyboardProtocolSequences.disable);
      if (enableMouse) {
        stdout.write("\x1B[?1007l");
        if (enableMouseMotion) stdout.write("\x1B[?1000l\x1B[?1003l\x1B[?1006l");
        else stdout.write("\x1B[?1000l\x1B[?1002l\x1B[?1006l");
      }
    }
  };
  return { dispose };
}
async function loadFsPromises() {
  return import("node:fs/promises");
}
function createNodePathPickerProvider() {
  const provider = {
    async listDir(absDir) {
      const fs = await loadFsPromises();
      const list = await fs.readdir(absDir, { withFileTypes: true });
      return list.map((d) => {
        const kind = d.isDirectory() ? "directory" : d.isFile() ? "file" : "other";
        return { name: d.name, kind };
      });
    },
    async stat(absPath) {
      const fs = await loadFsPromises();
      try {
        const s = await fs.lstat(absPath);
        const kind = s.isDirectory() ? "directory" : s.isFile() ? "file" : "other";
        return { exists: true, kind };
      } catch {
        return { exists: false, kind: "other" };
      }
    },
    async suggest(info) {
      const { suggestPaths } = await import("./path-suggest-C-jTVgYW.js");
      return suggestPaths({ ...info, listDir: provider.listDir });
    },
    async resolvePath(workspaceAbs, input) {
      const { resolveUserPath } = await import("./path-suggest-C-jTVgYW.js");
      return resolveUserPath(workspaceAbs, input);
    }
  };
  return provider;
}
function normalizeSeparators(input) {
  return input.replace(/\\/g, "/");
}
function isAbsolutePath(path) {
  const p = normalizeSeparators(path);
  if (p.startsWith("/")) return true;
  return /^[A-Z]:\//i.test(p);
}
function joinPath(base, next) {
  const a = normalizeSeparators(base);
  const b = normalizeSeparators(next);
  if (!a) return b;
  if (!b) return a;
  if (a.endsWith("/")) return `${a}${b.startsWith("/") ? b.slice(1) : b}`;
  return `${a}/${b.startsWith("/") ? b.slice(1) : b}`;
}
function normalizePath(path) {
  const raw = normalizeSeparators(path);
  if (!raw) return "";
  const drive = raw.match(/^([A-Z]:)(\/|$)/i)?.[1] ?? null;
  const rest = drive ? raw.slice(drive.length) : raw;
  const absolute = rest.startsWith("/");
  const parts = rest.split("/").filter(Boolean);
  const stack2 = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack2.length > 0 && stack2[stack2.length - 1] !== "..") {
        stack2.pop();
        continue;
      }
      if (!absolute) stack2.push("..");
      continue;
    }
    stack2.push(part);
  }
  const prefix = drive ? `${drive}${absolute ? "/" : ""}` : absolute ? "/" : "";
  const joined = stack2.join("/");
  const out2 = `${prefix}${joined}`;
  return out2 || (absolute ? drive ? `${drive}/` : "/" : "");
}
function resolvePath(baseAbs, input) {
  const b = normalizePath(baseAbs);
  const i = normalizePath(input);
  if (!b) return i;
  if (isAbsolutePath(i)) return i;
  return normalizePath(joinPath(b, i));
}
function parseColorMode(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "truecolor" || v === "24bit" || v === "rgb") return "truecolor";
  if (v === "ansi256" || v === "256" || v === "xterm256" || v === "xterm-256color") {
    return "ansi256";
  }
  if (v === "ansi16" || v === "16") return "ansi16";
  if (v === "ansi8" || v === "8") return "ansi8";
  return null;
}
function levelForMode(mode) {
  if (mode === "ansi8") return 8;
  if (mode === "ansi16") return 16;
  return 256;
}
function detectTerminalColorCapability(opts) {
  const env = opts?.env ?? {};
  const isTTY = opts?.isTTY ?? false;
  const platform = String(opts?.platform ?? "").trim().toLowerCase();
  const isWindows = platform === "win32" || String(env.OS ?? "").trim().toLowerCase() === "windows_nt";
  const forced = parseColorMode(env.DIMCODE_COLOR_MODE ?? env.VUE_TUI_COLOR_MODE);
  if (forced) return { mode: forced, level: levelForMode(forced) };
  if (!isTTY) return { mode: "truecolor", level: 256 };
  const termProgram = String(env.TERM_PROGRAM ?? "").toLowerCase();
  const isAppleTerminal = termProgram.includes("apple_terminal");
  const colorterm = String(env.COLORTERM ?? "").toLowerCase();
  if (!isAppleTerminal && (colorterm.includes("truecolor") || colorterm.includes("24bit"))) {
    return { mode: "truecolor", level: 256 };
  }
  if (termProgram.includes("vscode")) return { mode: "truecolor", level: 256 };
  if (termProgram.includes("wezterm") || termProgram.includes("alacritty") || termProgram.includes("ghostty") || termProgram.includes("kitty") || termProgram.includes("iterm") || termProgram.includes("windows terminal") || termProgram.includes("windowsterminal") || termProgram.includes("tabby") || termProgram.includes("hyper") || termProgram.includes("rio") || termProgram.includes("contour")) {
    return { mode: "truecolor", level: 256 };
  }
  const term = String(env.TERM ?? "").toLowerCase();
  if (isWindows) {
    const hasWindowsTerminal = "WT_SESSION" in env || "WT_PROFILE_ID" in env || "WT_ID" in env;
    const hasWezterm = "WEZTERM_EXECUTABLE" in env || "WEZTERM_PANE" in env;
    const hasAlacritty = "ALACRITTY_LOG" in env || "ALACRITTY_WINDOW_ID" in env;
    const hasTabby = "TABBY_CONFIG_DIRECTORY" in env;
    if (hasWindowsTerminal || hasWezterm || hasAlacritty || hasTabby)
      return { mode: "truecolor", level: 256 };
    if (term.includes("xterm") && term.includes("256color"))
      return { mode: "truecolor", level: 256 };
  }
  if (term.includes("256color")) return { mode: "ansi256", level: 256 };
  if (term.includes("color")) return { mode: "ansi16", level: 16 };
  if (term.includes("dumb")) return { mode: "ansi8", level: 8 };
  return { mode: "ansi16", level: 16 };
}
const ESC = "\x1B";
function ansi16ToColorName(code) {
  switch (code) {
    case 30:
      return "black";
    case 31:
      return "red";
    case 32:
      return "green";
    case 33:
      return "yellow";
    case 34:
      return "blue";
    case 35:
      return "magenta";
    case 36:
      return "cyan";
    case 37:
      return "white";
    case 90:
      return "blackBright";
    case 91:
      return "redBright";
    case 92:
      return "greenBright";
    case 93:
      return "yellowBright";
    case 94:
      return "blueBright";
    case 95:
      return "magentaBright";
    case 96:
      return "cyanBright";
    case 97:
      return "whiteBright";
    default:
      return void 0;
  }
}
function ansi16BgToColorName(code) {
  const fgCode = code >= 40 && code <= 47 ? code - 10 : code >= 100 && code <= 107 ? code - 10 : null;
  if (fgCode == null) return void 0;
  return ansi16ToColorName(fgCode);
}
const ANSI16_RGB = {
  black: { r: 0, g: 0, b: 0 },
  red: { r: 201, g: 27, b: 0 },
  green: { r: 0, g: 194, b: 0 },
  yellow: { r: 199, g: 196, b: 0 },
  blue: { r: 2, g: 37, b: 199 },
  magenta: { r: 201, g: 48, b: 199 },
  cyan: { r: 0, g: 197, b: 199 },
  white: { r: 199, g: 199, b: 199 },
  blackBright: { r: 104, g: 104, b: 104 },
  redBright: { r: 255, g: 110, b: 103 },
  greenBright: { r: 95, g: 250, b: 104 },
  yellowBright: { r: 255, g: 252, b: 103 },
  blueBright: { r: 104, g: 113, b: 255 },
  magentaBright: { r: 255, g: 118, b: 255 },
  cyanBright: { r: 95, g: 253, b: 255 },
  whiteBright: { r: 255, g: 255, b: 255 }
};
function nearestAnsi16(r, g, b) {
  let best = "white";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, rgb] of Object.entries(ANSI16_RGB)) {
    const dr = r - rgb.r;
    const dg = g - rgb.g;
    const db = b - rgb.b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}
function ansi256ToRgb(index) {
  const n = Math.max(0, Math.min(255, Math.trunc(index)));
  if (n < 16) {
    const map2 = [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "blackBright",
      "redBright",
      "greenBright",
      "yellowBright",
      "blueBright",
      "magentaBright",
      "cyanBright",
      "whiteBright"
    ];
    const name = map2[n] ?? "white";
    return ANSI16_RGB[name];
  }
  if (n >= 232) {
    const c = 8 + (n - 232) * 10;
    return { r: c, g: c, b: c };
  }
  const i = n - 16;
  const rr = Math.floor(i / 36);
  const gg = Math.floor(i % 36 / 6);
  const bb = i % 6;
  const toComponent = (v) => v === 0 ? 0 : 55 + v * 40;
  return { r: toComponent(rr), g: toComponent(gg), b: toComponent(bb) };
}
function applyAnsiSgrStyle(current, codes) {
  let next = { ...current };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    if (code === 0) {
      next = {};
      continue;
    }
    if (code === 1) {
      next = { ...next, bold: true };
    } else if (code === 2) {
      next = { ...next, dim: true };
    } else if (code === 3) {
      next = { ...next, italic: true };
    } else if (code === 4) {
      next = { ...next, underline: true };
    } else if (code === 7) {
      next = { ...next, inverse: true };
    } else if (code === 22) {
      next = { ...next, bold: false, dim: false };
    } else if (code === 23) {
      next = { ...next, italic: false };
    } else if (code === 24) {
      next = { ...next, underline: false };
    } else if (code === 27) {
      next = { ...next, inverse: false };
    } else if (code === 39) {
      next = { ...next, fg: void 0 };
    } else if (code === 49) {
      next = { ...next, bg: void 0 };
    } else if (code >= 30 && code <= 37 || code >= 90 && code <= 97) {
      const fg = ansi16ToColorName(code);
      next = { ...next, fg: fg ?? next.fg };
    } else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) {
      const bg = ansi16BgToColorName(code);
      next = { ...next, bg: bg ?? next.bg };
    } else if (code === 38 || code === 48) {
      const mode = codes[i + 1];
      if (mode === 5) {
        const idx = codes[i + 2];
        if (idx != null) {
          const { r, g, b } = ansi256ToRgb(idx);
          const name = nearestAnsi16(r, g, b);
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name };
        }
        i += 2;
      } else if (mode === 2) {
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        if (r != null && g != null && b != null) {
          const name = nearestAnsi16(r, g, b);
          next = code === 38 ? { ...next, fg: name } : { ...next, bg: name };
        }
        i += 4;
      }
    }
  }
  return next;
}
function parseAnsiSgr(input, baseStyle = {}) {
  const segments = [];
  let style = { ...baseStyle };
  let lastIndex = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== ESC || input[i + 1] !== "[") continue;
    let j = i + 2;
    while (j < input.length) {
      const c = input.charCodeAt(j);
      if (c >= 48 && c <= 57 || c === 59) {
        j++;
        continue;
      }
      break;
    }
    if (j >= input.length || input[j] !== "m") continue;
    if (i > lastIndex) segments.push({ text: input.slice(lastIndex, i), style });
    const body = input.slice(i + 2, j);
    const codes = body.split(";").filter(Boolean).map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n));
    style = applyAnsiSgrStyle(style, codes.length ? codes : [0]);
    lastIndex = j + 1;
    i = j;
  }
  if (lastIndex < input.length) segments.push({ text: input.slice(lastIndex), style });
  return segments;
}
const fullWidthRanges = [
  [4352, 4447],
  [9001, 9002],
  [11904, 42191],
  [44032, 55203],
  [63744, 64255],
  [65040, 65049],
  [65072, 65135],
  [65280, 65376],
  [65504, 65510]
];
function isFullWidthCodePoint(codePoint) {
  if (codePoint < 4352 || codePoint > 65510) return false;
  for (const [start, end] of fullWidthRanges) {
    if (codePoint < start) return false;
    if (codePoint <= end) return true;
  }
  return false;
}
function isEmojiLike(codePoint) {
  return codePoint >= 127744 && codePoint <= 129791 || codePoint >= 127462 && codePoint <= 127487;
}
let extendedPictographicRe = null;
try {
  extendedPictographicRe = new RegExp("\\p{Extended_Pictographic}", "u");
} catch {
  extendedPictographicRe = null;
}
let emojiPresentationRe = null;
try {
  emojiPresentationRe = new RegExp("\\p{Emoji_Presentation}", "u");
} catch {
  emojiPresentationRe = null;
}
let emojiRe = null;
try {
  emojiRe = new RegExp("\\p{Emoji}", "u");
} catch {
  emojiRe = null;
}
function charCellWidth(text) {
  if (!text) return 1;
  if (text.length === 1) {
    const code = text.charCodeAt(0);
    if (code < 4352) return 1;
  }
  const codePoint = text.codePointAt(0);
  if (codePoint == null) return 1;
  const hasVs16 = text.includes("️");
  if (isFullWidthCodePoint(codePoint)) return 2;
  if (isEmojiLike(codePoint)) return 2;
  if (emojiPresentationRe?.test(text)) return 2;
  if (text.includes("⃣")) return 2;
  if (hasVs16 && emojiRe?.test(text)) return 2;
  if (extendedPictographicRe?.test(text)) {
    if (codePoint <= 65535) return hasVs16 ? 2 : 1;
    return 2;
  }
  return 1;
}
const TERMINAL_RENDER_PLANES = ["default", "transcript", "chrome", "overlay"];
const DEFAULT_STYLE = Object.freeze({});
const styleCache = /* @__PURE__ */ new WeakMap();
const blankCellCache = /* @__PURE__ */ new WeakMap();
const continuationCellCache = /* @__PURE__ */ new WeakMap();
const cellCacheWidth1 = /* @__PURE__ */ new WeakMap();
const cellCacheWidth2 = /* @__PURE__ */ new WeakMap();
const MAX_CACHED_CELLS_PER_STYLE = 128;
function normalizeStyle$1(style) {
  if (!style) return DEFAULT_STYLE;
  if (Object.isFrozen(style)) return style;
  const cached = styleCache.get(style);
  if (cached) return cached;
  const frozen = Object.freeze({ ...style });
  styleCache.set(style, frozen);
  return frozen;
}
function getOrCreateCellCache(map2, style) {
  const cached = map2.get(style);
  if (cached) return cached;
  const next = /* @__PURE__ */ new Map();
  map2.set(style, next);
  return next;
}
function createCell(ch, style) {
  if (ch === " ") return createBlankCell(style);
  const normalizedStyle = normalizeStyle$1(style);
  const width = charCellWidth(ch);
  const map2 = width === 2 ? getOrCreateCellCache(cellCacheWidth2, normalizedStyle) : getOrCreateCellCache(cellCacheWidth1, normalizedStyle);
  const cached = map2.get(ch);
  if (cached) return cached;
  const cell = { ch, width, style: normalizedStyle };
  map2.set(ch, cell);
  if (map2.size > MAX_CACHED_CELLS_PER_STYLE) map2.clear();
  return cell;
}
function createBlankCell(style) {
  const normalizedStyle = normalizeStyle$1(style);
  const cached = blankCellCache.get(normalizedStyle);
  if (cached) return cached;
  const cell = Object.freeze({
    ch: " ",
    width: 1,
    style: normalizedStyle
  });
  blankCellCache.set(normalizedStyle, cell);
  return cell;
}
function createContinuationCell(style) {
  const normalizedStyle = normalizeStyle$1(style);
  const cached = continuationCellCache.get(normalizedStyle);
  if (cached) return cached;
  const cell = Object.freeze({
    ch: "",
    width: 1,
    continuation: true,
    style: normalizedStyle
  });
  continuationCellCache.set(normalizedStyle, cell);
  return cell;
}
function createGridBuffer(cols2, rows2) {
  const safeCols = Math.max(0, Math.floor(cols2));
  const safeRows = Math.max(0, Math.floor(rows2));
  const blank = createBlankCell();
  const grid = Array.from(
    { length: safeRows },
    () => Array.from({ length: safeCols }, () => blank)
  );
  return {
    cols: safeCols,
    rows: safeRows,
    grid,
    gridStart: 0,
    dirtyBits: new Uint8Array(safeRows),
    dirtyCount: safeRows || 0,
    dirtyMin: safeRows ? 0 : Number.POSITIVE_INFINITY,
    dirtyMax: safeRows ? safeRows - 1 : -1,
    dirtyAll: safeRows > 0,
    cursorX: 0,
    cursorY: 0,
    cursorVisible: true,
    cursorStyle: DEFAULT_STYLE,
    scrollback: [],
    scrollbackLimit: 1e3,
    rowPool: [],
    soaFingerprints: null,
    fingerprintFn: null
  };
}
function clamp$1(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function setFingerprintFn(buffer2, fn) {
  buffer2.fingerprintFn = fn;
  const len = buffer2.rows * buffer2.cols;
  if (!len) {
    buffer2.soaFingerprints = null;
    return;
  }
  buffer2.soaFingerprints = new Uint32Array(len);
  for (let y = 0; y < buffer2.rows; y++) {
    const row = getBufferRow(buffer2, y);
    const physY = physicalRowIndex(buffer2, y);
    const base = physY * buffer2.cols;
    for (let x = 0; x < buffer2.cols; x++) {
      const cell = row[x];
      buffer2.soaFingerprints[base + x] = fn(cell.ch, cell.style);
    }
  }
}
function getRowFingerprints(buffer2, y) {
  if (!buffer2.soaFingerprints) return null;
  const physY = physicalRowIndex(buffer2, y);
  const base = physY * buffer2.cols;
  return buffer2.soaFingerprints.subarray(base, base + buffer2.cols);
}
function updateCellFingerprint(buffer2, physY, x, ch, style) {
  if (!buffer2.soaFingerprints || !buffer2.fingerprintFn) return;
  buffer2.soaFingerprints[physY * buffer2.cols + x] = buffer2.fingerprintFn(ch, style);
}
function updateRangeFingerprint(buffer2, physY, x0, x1, ch, style) {
  if (!buffer2.soaFingerprints || !buffer2.fingerprintFn) return;
  const fp = buffer2.fingerprintFn(ch, style);
  const base = physY * buffer2.cols;
  for (let x = x0; x < x1; x++) {
    buffer2.soaFingerprints[base + x] = fp;
  }
}
function physicalRowIndex(buffer2, y) {
  return (buffer2.gridStart + y) % buffer2.rows;
}
function getBufferRow(buffer2, y) {
  return buffer2.grid[physicalRowIndex(buffer2, y)];
}
function getBufferCell(buffer2, x, y) {
  return getBufferRow(buffer2, y)[x];
}
function markAllDirty(buffer2) {
  if (buffer2.rows <= 0) return;
  buffer2.dirtyAll = true;
  buffer2.dirtyCount = buffer2.rows;
  buffer2.dirtyMin = 0;
  buffer2.dirtyMax = buffer2.rows - 1;
}
function markDirty(buffer2, y) {
  if (buffer2.dirtyAll) return;
  if (y < 0 || y >= buffer2.rows) return;
  if (buffer2.dirtyBits[y]) {
    return;
  }
  buffer2.dirtyBits[y] = 1;
  buffer2.dirtyCount++;
  if (y < buffer2.dirtyMin) buffer2.dirtyMin = y;
  if (y > buffer2.dirtyMax) buffer2.dirtyMax = y;
}
function clearCellRange(row, startX, endXExclusive) {
  const blank = createBlankCell();
  for (let x = startX; x < endXExclusive; x++) row[x] = blank;
}
function clearDanglingContinuation(row, x) {
  const cell = row[x];
  if (!cell?.continuation) return;
  row[x] = createBlankCell();
}
function clearWideIfOverwriting(row, x) {
  const cell = row[x];
  if (!cell) return;
  if (cell.continuation) {
    if (x - 1 >= 0) row[x - 1] = createBlankCell();
    row[x] = createBlankCell();
    return;
  }
  if (cell.width === 2) {
    row[x] = createBlankCell();
    if (x + 1 < row.length) row[x + 1] = createBlankCell();
  }
}
function putCell(buffer2, x, y, ch, style) {
  if (y < 0 || y >= buffer2.rows) return;
  if (x < 0 || x >= buffer2.cols) return;
  const row = getBufferRow(buffer2, y);
  clearWideIfOverwriting(row, x);
  const width = charCellWidth(ch);
  if (width === 2 && x + 1 >= buffer2.cols) {
    row[x] = createBlankCell();
    markDirty(buffer2, y);
    return;
  }
  const cell = createCell(ch, style);
  row[x] = cell;
  if (width === 2 && x + 1 < buffer2.cols) row[x + 1] = createContinuationCell(style);
  if (buffer2.soaFingerprints) {
    const physY = physicalRowIndex(buffer2, y);
    updateCellFingerprint(buffer2, physY, x, cell.ch, cell.style);
    if (width === 2 && x + 1 < buffer2.cols) {
      updateCellFingerprint(buffer2, physY, x + 1, "", cell.style);
    }
  }
  markDirty(buffer2, y);
}
function fillRect(buffer2, x, y, w, h2, ch = " ", style) {
  if (w <= 0 || h2 <= 0 || buffer2.cols === 0 || buffer2.rows === 0) return;
  const x0 = clamp$1(Math.floor(x), 0, buffer2.cols);
  const y0 = clamp$1(Math.floor(y), 0, buffer2.rows);
  const x1 = clamp$1(Math.floor(x + w), 0, buffer2.cols);
  const y1 = clamp$1(Math.floor(y + h2), 0, buffer2.rows);
  if (x1 <= x0 || y1 <= y0) return;
  const width = charCellWidth(ch);
  if (width === 1) {
    const fillCell = createCell(ch, style);
    const blank = createBlankCell();
    for (let yy = y0; yy < y1; yy++) {
      const row = getBufferRow(buffer2, yy);
      if (row[x0]?.continuation) clearWideIfOverwriting(row, x0);
      row.fill(fillCell, x0, x1);
      if (x1 < buffer2.cols && row[x1]?.continuation) row[x1] = blank;
      if (buffer2.soaFingerprints) {
        const physY = physicalRowIndex(buffer2, yy);
        updateRangeFingerprint(buffer2, physY, x0, x1, fillCell.ch, fillCell.style);
      }
      markDirty(buffer2, yy);
    }
    return;
  }
  const cell = width === 2 ? void 0 : createCell(ch, style);
  for (let yy = y0; yy < y1; yy++) {
    const row = getBufferRow(buffer2, yy);
    for (let xx = x0; xx < x1; xx++) {
      clearWideIfOverwriting(row, xx);
      if (width === 2 && xx + 1 >= buffer2.cols) {
        row[xx] = createBlankCell();
      } else {
        row[xx] = cell ?? createCell(ch, style);
        if (width === 2 && xx + 1 < buffer2.cols) row[xx + 1] = createContinuationCell(style);
      }
    }
    markDirty(buffer2, yy);
  }
}
function clearRect(buffer2, x, y, w, h2) {
  if (buffer2.cols === 0 || buffer2.rows === 0) return;
  if (x == null || y == null || w == null || h2 == null) {
    const blank = createBlankCell();
    for (let yy = 0; yy < buffer2.rows; yy++) {
      const row = getBufferRow(buffer2, yy);
      row.length = buffer2.cols;
      for (let xx = 0; xx < buffer2.cols; xx++) row[xx] = blank;
    }
    markAllDirty(buffer2);
    buffer2.cursorX = 0;
    buffer2.cursorY = 0;
    return;
  }
  if (w <= 0 || h2 <= 0) return;
  const x0 = clamp$1(Math.floor(x), 0, buffer2.cols);
  const y0 = clamp$1(Math.floor(y), 0, buffer2.rows);
  const x1 = clamp$1(Math.floor(x + w), 0, buffer2.cols);
  const y1 = clamp$1(Math.floor(y + h2), 0, buffer2.rows);
  if (x1 <= x0 || y1 <= y0) return;
  for (let yy = y0; yy < y1; yy++) {
    const row = getBufferRow(buffer2, yy);
    clearCellRange(row, x0, x1);
    if (x0 - 1 >= 0) clearDanglingContinuation(row, x0);
    if (x1 < buffer2.cols) clearDanglingContinuation(row, x1);
    markDirty(buffer2, yy);
  }
}
function takePooledRow(buffer2) {
  const row = buffer2.rowPool.pop();
  return row ?? null;
}
function blankRow(buffer2) {
  const pooled = takePooledRow(buffer2);
  if (!pooled) return Array.from({ length: buffer2.cols }, () => createBlankCell());
  pooled.length = buffer2.cols;
  const blank = createBlankCell();
  for (let x = 0; x < buffer2.cols; x++) pooled[x] = blank;
  return pooled;
}
function recomputeFingerprintsForRows(buffer2, startY, endY) {
  if (!buffer2.soaFingerprints || !buffer2.fingerprintFn) return;
  for (let y = startY; y < endY; y++) {
    const row = getBufferRow(buffer2, y);
    const physY = physicalRowIndex(buffer2, y);
    const base = physY * buffer2.cols;
    for (let x = 0; x < buffer2.cols; x++) {
      const cell = row[x];
      buffer2.soaFingerprints[base + x] = buffer2.fingerprintFn(cell.ch, cell.style);
    }
  }
}
function scrollBuffer(buffer2, lines) {
  const n = Math.trunc(lines);
  if (n === 0 || buffer2.rows === 0) return;
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      const removedIdx = buffer2.gridStart;
      const removed = buffer2.grid[removedIdx];
      if (buffer2.scrollbackLimit > 0) {
        buffer2.scrollback.push(removed);
        if (buffer2.scrollback.length > buffer2.scrollbackLimit) {
          const excess = buffer2.scrollback.length - buffer2.scrollbackLimit;
          const dropped = buffer2.scrollback.splice(0, excess);
          buffer2.rowPool.push(...dropped);
        }
      } else {
        buffer2.rowPool.push(removed);
      }
      buffer2.gridStart = (buffer2.gridStart + 1) % buffer2.rows;
      const bottomIdx = (buffer2.gridStart + buffer2.rows - 1) % buffer2.rows;
      buffer2.grid[bottomIdx] = blankRow(buffer2);
    }
  } else {
    for (let i = 0; i < -n; i++) {
      const bottomIdx = (buffer2.gridStart + buffer2.rows - 1) % buffer2.rows;
      const removed = buffer2.grid[bottomIdx];
      buffer2.rowPool.push(removed);
      buffer2.gridStart = (buffer2.gridStart - 1 + buffer2.rows) % buffer2.rows;
      buffer2.grid[buffer2.gridStart] = blankRow(buffer2);
    }
  }
  markAllDirty(buffer2);
  buffer2.cursorY = clamp$1(buffer2.cursorY - n, 0, Math.max(0, buffer2.rows - 1));
}
function scrollBufferRegion(buffer2, startY, endY, lines) {
  const n = Math.trunc(lines);
  if (n === 0 || buffer2.rows === 0) return [];
  const start = clamp$1(Math.floor(startY), 0, buffer2.rows);
  const end = clamp$1(Math.floor(endY), 0, buffer2.rows);
  const height = end - start;
  if (height <= 0) return [];
  const absDelta = Math.abs(n);
  const insertedRows = [];
  const replaceRegionWithBlankRows = () => {
    for (let y = start; y < end; y++) {
      const physY = physicalRowIndex(buffer2, y);
      buffer2.rowPool.push(buffer2.grid[physY]);
      buffer2.grid[physY] = blankRow(buffer2);
      markDirty(buffer2, y);
      insertedRows.push(y);
    }
  };
  if (absDelta >= height) {
    replaceRegionWithBlankRows();
    recomputeFingerprintsForRows(buffer2, start, end);
    if (buffer2.cursorY >= start && buffer2.cursorY < end)
      buffer2.cursorY = clamp$1(buffer2.cursorY - n, start, Math.max(start, end - 1));
    return insertedRows;
  }
  const regionRows = [];
  for (let y = start; y < end; y++) regionRows.push(getBufferRow(buffer2, y));
  const nextRows = Array.from({ length: height }, () => []);
  if (n > 0) {
    const movedCount = height - n;
    for (let i = 0; i < movedCount; i++) nextRows[i] = regionRows[i + n];
    for (let i = 0; i < n; i++) {
      buffer2.rowPool.push(regionRows[i]);
      const y = end - n + i;
      nextRows[movedCount + i] = blankRow(buffer2);
      markDirty(buffer2, y);
      insertedRows.push(y);
    }
  } else {
    const insertedCount = -n;
    const movedCount = height - insertedCount;
    for (let i = 0; i < insertedCount; i++) {
      buffer2.rowPool.push(regionRows[height - insertedCount + i]);
      const y = start + i;
      nextRows[i] = blankRow(buffer2);
      markDirty(buffer2, y);
      insertedRows.push(y);
    }
    for (let i = 0; i < movedCount; i++) nextRows[insertedCount + i] = regionRows[i];
  }
  for (let i = 0; i < height; i++) {
    const physY = physicalRowIndex(buffer2, start + i);
    buffer2.grid[physY] = nextRows[i];
  }
  recomputeFingerprintsForRows(buffer2, start, end);
  if (buffer2.cursorY >= start && buffer2.cursorY < end)
    buffer2.cursorY = clamp$1(buffer2.cursorY - n, start, Math.max(start, end - 1));
  return insertedRows;
}
function resizeBuffer(buffer2, cols2, rows2) {
  const nextCols = Math.max(0, Math.floor(cols2));
  const nextRows = Math.max(0, Math.floor(rows2));
  if (nextCols === buffer2.cols && nextRows === buffer2.rows) return;
  const blank = createBlankCell();
  const nextGrid = Array.from(
    { length: nextRows },
    () => Array.from({ length: nextCols }, () => blank)
  );
  const copyRows = Math.min(buffer2.rows, nextRows);
  const copyCols = Math.min(buffer2.cols, nextCols);
  for (let y = 0; y < copyRows; y++) {
    const src = getBufferRow(buffer2, y);
    const dst = nextGrid[y];
    for (let x = 0; x < copyCols; x++) dst[x] = src[x];
  }
  if (nextCols > 0) {
    for (let y = 0; y < nextGrid.length; y++) {
      const row = nextGrid[y];
      if (row[nextCols - 1]?.continuation) row[nextCols - 1] = blank;
    }
  }
  for (let y = 0; y < buffer2.rows; y++) buffer2.rowPool.push(getBufferRow(buffer2, y));
  buffer2.grid = nextGrid;
  buffer2.gridStart = 0;
  buffer2.cols = nextCols;
  buffer2.rows = nextRows;
  buffer2.dirtyBits = new Uint8Array(nextRows);
  buffer2.dirtyCount = nextRows || 0;
  buffer2.dirtyMin = nextRows ? 0 : Number.POSITIVE_INFINITY;
  buffer2.dirtyMax = nextRows ? nextRows - 1 : -1;
  buffer2.dirtyAll = nextRows > 0;
  buffer2.cursorX = clamp$1(buffer2.cursorX, 0, Math.max(0, nextCols));
  buffer2.cursorY = clamp$1(buffer2.cursorY, 0, Math.max(0, nextRows - 1));
  if (buffer2.fingerprintFn) {
    const len = nextRows * nextCols;
    if (len > 0) {
      buffer2.soaFingerprints = new Uint32Array(len);
      for (let y = 0; y < nextRows; y++) {
        const row = nextGrid[y];
        const base = y * nextCols;
        for (let x = 0; x < nextCols; x++) {
          const cell = row[x];
          buffer2.soaFingerprints[base + x] = buffer2.fingerprintFn(cell.ch, cell.style);
        }
      }
    } else {
      buffer2.soaFingerprints = null;
    }
  }
}
function snapshotText(buffer2) {
  const out2 = [];
  for (let y = 0; y < buffer2.rows; y++) {
    const row = getBufferRow(buffer2, y);
    out2.push(row.map((cell) => cell.continuation ? " " : cell.ch || " ").join(""));
  }
  return out2;
}
class Emitter {
  listeners = /* @__PURE__ */ new Map();
  on(event, cb) {
    let set = this.listeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
      if (set.size === 0) this.listeners.delete(event);
    };
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(payload);
  }
  clear() {
    this.listeners.clear();
  }
}
function isControlChar(ch) {
  return ch === "\n" || ch === "\r" || ch === "	";
}
function mergePlanes(prev, next) {
  if (!prev?.length) return next?.length ? [...next] : null;
  if (!next?.length) return prev;
  const merged = new Set(prev);
  for (const plane of next) merged.add(plane);
  return Array.from(merged);
}
const TERMINAL_PLANE_INTERNALS = Symbol("terminal-plane-internals");
function createCoverage(cols2, rows2) {
  return Array.from({ length: rows2 }, () => new Uint8Array(cols2));
}
function resizeCoverage(prev, cols2, rows2) {
  const next = createCoverage(cols2, rows2);
  const copyRows = Math.min(prev.length, rows2);
  for (let y = 0; y < copyRows; y++) {
    const src = prev[y];
    const dst = next[y];
    dst.set(src.subarray(0, Math.min(src.length, cols2)));
  }
  return next;
}
function setBufferClean(buffer2) {
  buffer2.dirtyBits.fill(0);
  buffer2.dirtyCount = 0;
  buffer2.dirtyMin = Number.POSITIVE_INFINITY;
  buffer2.dirtyMax = -1;
  buffer2.dirtyAll = false;
}
function createPlaneState(cols2, rows2) {
  const buffer2 = createGridBuffer(cols2, rows2);
  setBufferClean(buffer2);
  buffer2.cursorVisible = false;
  return {
    buffer: buffer2,
    coverage: createCoverage(cols2, rows2)
  };
}
function collectAndClearDirtyRows(buffer2) {
  if (buffer2.rows === 0) return [];
  if (buffer2.dirtyAll) {
    buffer2.dirtyAll = false;
    buffer2.dirtyBits.fill(0);
    buffer2.dirtyCount = 0;
    buffer2.dirtyMin = Number.POSITIVE_INFINITY;
    buffer2.dirtyMax = -1;
    return null;
  }
  if (buffer2.dirtyCount === 0) return [];
  const out2 = [];
  const start = Math.max(0, buffer2.dirtyMin);
  const end = Math.min(buffer2.rows - 1, buffer2.dirtyMax);
  for (let y = start; y <= end; y++) {
    if (buffer2.dirtyBits[y]) {
      buffer2.dirtyBits[y] = 0;
      out2.push(y);
      if (out2.length === buffer2.dirtyCount) break;
    }
  }
  buffer2.dirtyCount = 0;
  buffer2.dirtyMin = Number.POSITIVE_INFINITY;
  buffer2.dirtyMax = -1;
  return out2;
}
function peekDirtyRows(buffer2) {
  if (buffer2.rows === 0) return [];
  if (buffer2.dirtyAll) return null;
  if (buffer2.dirtyCount === 0) return [];
  const out2 = [];
  const start = Math.max(0, buffer2.dirtyMin);
  const end = Math.min(buffer2.rows - 1, buffer2.dirtyMax);
  for (let y = start; y <= end; y++) {
    if (buffer2.dirtyBits[y]) {
      out2.push(y);
      if (out2.length === buffer2.dirtyCount) break;
    }
  }
  return out2;
}
function clearPlaneCoverageRow(state, y) {
  if (y < 0 || y >= state.buffer.rows) return;
  const row = getBufferRow(state.buffer, y);
  const blank = createBlankCell();
  row.length = state.buffer.cols;
  for (let x = 0; x < state.buffer.cols; x++) row[x] = blank;
  state.coverage[y]?.fill(0);
  markDirty(state.buffer, y);
}
function markPlaneCoverageRange(state, x0, y0, x1, y1, value) {
  for (let y = y0; y < y1; y++) {
    const row = state.coverage[y];
    if (!row) continue;
    row.fill(value, x0, x1);
  }
}
function markPlaneCoverageForPut(state, x, y, ch, prevCell) {
  const row = state.coverage[y];
  if (!row) return;
  if (prevCell?.continuation && x > 0) row[x - 1] = 1;
  if (prevCell?.width === 2 && x + 1 < row.length) row[x + 1] = 1;
  row[x] = 1;
  if (ch !== " " && x + 1 < row.length) {
    const next = getBufferCell(state.buffer, x, y);
    if (next.width === 2) row[x + 1] = 1;
  }
}
function scrollPlaneCoverage(state, lines) {
  const n = Math.trunc(lines);
  if (n === 0 || state.coverage.length === 0) return;
  const rows2 = state.coverage.length;
  const cols2 = state.buffer.cols;
  if (Math.abs(n) >= rows2) {
    for (const row of state.coverage) row.fill(0);
    return;
  }
  if (n > 0) {
    state.coverage.splice(0, n);
    for (let i = 0; i < n; i++) state.coverage.push(new Uint8Array(cols2));
    return;
  }
  state.coverage.splice(rows2 + n, -n);
  for (let i = 0; i < -n; i++) state.coverage.unshift(new Uint8Array(cols2));
}
function scrollPlaneCoverageRegion(state, startY, endY, lines) {
  const n = Math.trunc(lines);
  if (n === 0 || state.coverage.length === 0) return;
  const start = Math.max(0, Math.min(state.coverage.length, Math.floor(startY)));
  const end = Math.max(0, Math.min(state.coverage.length, Math.floor(endY)));
  const height = end - start;
  if (height <= 0) return;
  const cols2 = state.buffer.cols;
  if (Math.abs(n) >= height) {
    for (let y = start; y < end; y++) state.coverage[y] = new Uint8Array(cols2);
    return;
  }
  const region = state.coverage.slice(start, end);
  const next = Array.from({ length: height }, () => new Uint8Array(0));
  if (n > 0) {
    const movedCount = height - n;
    for (let i = 0; i < movedCount; i++) next[i] = region[i + n];
    for (let i = 0; i < n; i++) next[movedCount + i] = new Uint8Array(cols2);
  } else {
    const insertedCount = -n;
    const movedCount = height - insertedCount;
    for (let i = 0; i < insertedCount; i++) next[i] = new Uint8Array(cols2);
    for (let i = 0; i < movedCount; i++) next[insertedCount + i] = region[i];
  }
  for (let i = 0; i < height; i++) state.coverage[start + i] = next[i];
}
function resizePlaneState(state, cols2, rows2) {
  resizeBuffer(state.buffer, cols2, rows2);
  state.coverage = resizeCoverage(state.coverage, state.buffer.cols, state.buffer.rows);
}
function normalizeDirtyRows(rows2, totalRows) {
  if (rows2 === null) return null;
  if (rows2.length === 0) return rows2;
  const out2 = [];
  for (const y of rows2) {
    const yy = Math.floor(y);
    if (yy < 0 || yy >= totalRows) continue;
    if (out2[out2.length - 1] === yy) continue;
    out2.push(yy);
  }
  return out2;
}
let sharedGraphemeSegmenter = null;
try {
  sharedGraphemeSegmenter = new Intl.Segmenter(void 0, {
    granularity: "grapheme"
  });
} catch {
}
function getPlaneTerminal(terminal, plane) {
  const internals = terminal[TERMINAL_PLANE_INTERNALS];
  return internals?.getPlaneTerminal(plane) ?? terminal;
}
function resetPlaneRowsForRender(terminal, plane, dirtyRows) {
  const internals = terminal[TERMINAL_PLANE_INTERNALS];
  internals?.resetRowsForRender(plane, dirtyRows);
}
function getPlaneRowCoverageKind(terminal, plane, y) {
  const internals = terminal[TERMINAL_PLANE_INTERNALS];
  return internals?.getRowCoverageKind(plane, y) ?? 0;
}
function scrollPlaneRows(terminal, plane, startY, endY, lines) {
  const internals = terminal[TERMINAL_PLANE_INTERNALS];
  internals?.scrollRows(plane, startY, endY, lines);
}
function createTerminal(opts) {
  const emitter = new Emitter();
  const compositeBuffer = createGridBuffer(opts.cols, opts.rows);
  const planeStates = /* @__PURE__ */ new Map();
  let disposed = false;
  let batchingDepth = 0;
  let pendingCommit = false;
  let pendingCommitAllPlanes = false;
  let pendingCommitPlanes = null;
  const pendingPlaneScrollOps = /* @__PURE__ */ new Map();
  const planeTerminals = /* @__PURE__ */ new Map();
  let base;
  compositeBuffer.cursorVisible = false;
  function assertNotDisposed() {
    if (disposed) throw new Error("Terminal is disposed");
  }
  function getPlaneState(plane) {
    let state = planeStates.get(plane);
    if (!state) {
      state = createPlaneState(compositeBuffer.cols, compositeBuffer.rows);
      planeStates.set(plane, state);
    }
    return state;
  }
  function setCursorForPlane(plane, x, y, visible = true) {
    const state = getPlaneState(plane);
    state.buffer.cursorX = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    state.buffer.cursorY = Math.max(
      0,
      Math.min(state.buffer.rows ? state.buffer.rows - 1 : 0, Math.floor(y))
    );
    state.buffer.cursorVisible = visible;
    markDirty(state.buffer, state.buffer.cursorY);
  }
  function putForPlane(plane, x, y, ch, style) {
    const state = getPlaneState(plane);
    if (y < 0 || y >= state.buffer.rows || x < 0 || x >= state.buffer.cols) return;
    const prevCell = getBufferCell(state.buffer, x, y);
    putCell(state.buffer, x, y, ch, style);
    markPlaneCoverageForPut(state, x, y, ch, prevCell);
  }
  function writeAtForPlane(plane, text, x, y, style) {
    const state = getPlaneState(plane);
    let cx = x;
    let cy = y;
    if (state.buffer.cols === 0 || state.buffer.rows === 0) return { x: cx, y: cy };
    const writeChar = (ch) => {
      if (isControlChar(ch)) {
        if (ch === "\n") {
          cx = 0;
          cy += 1;
          if (cy >= state.buffer.rows) {
            scrollBuffer(state.buffer, 1);
            scrollPlaneCoverage(state, 1);
            cy = state.buffer.rows - 1;
          }
        } else if (ch === "\r") {
          cx = 0;
        } else if (ch === "	") {
          const tabSize = 4;
          const next = Math.min(state.buffer.cols, cx + (tabSize - cx % tabSize));
          for (; cx < next; cx++) putForPlane(plane, cx, cy, " ", style);
        }
        return true;
      }
      if (cy < 0 || cy >= state.buffer.rows) return false;
      if (cx >= state.buffer.cols) {
        cx = 0;
        cy += 1;
      }
      if (cy >= state.buffer.rows) {
        scrollBuffer(state.buffer, 1);
        scrollPlaneCoverage(state, 1);
        cy = state.buffer.rows - 1;
      }
      putForPlane(plane, cx, cy, ch, style);
      const width = ch === " " ? 1 : getBufferCell(state.buffer, cx, cy).width || 1;
      cx += width;
      return true;
    };
    let i = 0;
    for (; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code > 127) break;
      if (!writeChar(text[i])) return { x: cx, y: cy };
    }
    if (i < text.length) {
      const rest = text.slice(i);
      if (sharedGraphemeSegmenter) {
        for (const seg of sharedGraphemeSegmenter.segment(rest)) {
          if (!writeChar(seg.segment)) break;
        }
      } else {
        for (const ch of rest) {
          if (!writeChar(ch)) break;
        }
      }
    }
    return { x: cx, y: cy };
  }
  function clearForPlane(plane, x, y, w, h2) {
    const state = getPlaneState(plane);
    clearRect(state.buffer, x, y, w, h2);
    if (x == null || y == null || w == null || h2 == null) {
      for (const row of state.coverage) row.fill(1);
      return;
    }
    if (w <= 0 || h2 <= 0) return;
    const x0 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    const y0 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y)));
    const x1 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x + w)));
    const y1 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y + h2)));
    if (x1 <= x0 || y1 <= y0) return;
    markPlaneCoverageRange(state, x0, y0, x1, y1, 1);
  }
  function fillForPlane(plane, x, y, w, h2, ch, style) {
    const state = getPlaneState(plane);
    fillRect(state.buffer, x, y, w, h2, ch ?? " ", style);
    if (w <= 0 || h2 <= 0 || state.buffer.cols === 0 || state.buffer.rows === 0) return;
    const x0 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x)));
    const y0 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y)));
    const x1 = Math.max(0, Math.min(state.buffer.cols, Math.floor(x + w)));
    const y1 = Math.max(0, Math.min(state.buffer.rows, Math.floor(y + h2)));
    if (x1 <= x0 || y1 <= y0) return;
    markPlaneCoverageRange(state, x0, y0, x1, y1, 1);
  }
  function scrollForPlane(plane, lines) {
    const state = getPlaneState(plane);
    scrollBuffer(state.buffer, lines);
    scrollPlaneCoverage(state, lines);
  }
  function normalizeScrollOperation(startY, endY, delta, totalRows) {
    const start = Math.max(0, Math.min(totalRows, Math.floor(startY)));
    const end = Math.max(0, Math.min(totalRows, Math.floor(endY)));
    const height = end - start;
    const lines = Math.trunc(delta);
    if (height <= 0 || lines === 0 || Math.abs(lines) >= height) return null;
    return { startY: start, endY: end, delta: lines };
  }
  function recordPendingScrollOp(plane, op) {
    const prev = pendingPlaneScrollOps.get(plane);
    if (prev && prev.startY === op.startY && prev.endY === op.endY) {
      const nextDelta = prev.delta + op.delta;
      if (nextDelta === 0) {
        pendingPlaneScrollOps.delete(plane);
        return;
      }
      const next = normalizeScrollOperation(op.startY, op.endY, nextDelta, compositeBuffer.rows);
      if (!next) {
        pendingPlaneScrollOps.delete(plane);
        return;
      }
      pendingPlaneScrollOps.set(plane, next);
      return;
    }
    pendingPlaneScrollOps.set(plane, op);
  }
  function takePendingScrollOps(planes) {
    const planesToTake = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    const out2 = [];
    for (const plane of planesToTake) {
      const op = pendingPlaneScrollOps.get(plane);
      if (!op) continue;
      pendingPlaneScrollOps.delete(plane);
      out2.push({ plane, ...op });
    }
    return out2.length ? out2 : null;
  }
  function higherPlanesFor(plane) {
    const planeIndex = TERMINAL_RENDER_PLANES.indexOf(plane);
    if (planeIndex < 0) return [];
    return TERMINAL_RENDER_PLANES.slice(planeIndex + 1);
  }
  function higherPlaneCoverageKind(plane, y) {
    const higherPlanes = higherPlanesFor(plane);
    if (!higherPlanes.length || y < 0 || y >= compositeBuffer.rows) return 0;
    let covered = 0;
    for (let x = 0; x < compositeBuffer.cols; x++) {
      let cellCovered = false;
      for (const higherPlane of higherPlanes) {
        const state = planeStates.get(higherPlane);
        if (state?.coverage[y]?.[x]) {
          cellCovered = true;
          break;
        }
      }
      if (cellCovered) covered++;
    }
    if (covered === 0) return 0;
    if (covered >= compositeBuffer.cols) return 2;
    return 1;
  }
  function prepareCompositeScrollOps(pendingOps) {
    if (!pendingOps?.length) {
      return {
        scrollOperations: null,
        extraDirtyRows: []
      };
    }
    const scrollOperations = [];
    const extraDirtyRows = /* @__PURE__ */ new Set();
    for (const pending of pendingOps) {
      const blockedRows = /* @__PURE__ */ new Set();
      const partiallyBlockedRows = /* @__PURE__ */ new Set();
      for (let y = pending.startY; y < pending.endY; y++) {
        const coverageKind = higherPlaneCoverageKind(pending.plane, y);
        if (coverageKind === 0) continue;
        blockedRows.add(y);
        if (coverageKind === 1) partiallyBlockedRows.add(y);
      }
      if (!blockedRows.size) {
        scrollOperations.push({
          startY: pending.startY,
          endY: pending.endY,
          delta: pending.delta
        });
        continue;
      }
      const absDelta = Math.abs(pending.delta);
      for (let y = pending.startY; y < pending.endY; y++) {
        if (partiallyBlockedRows.has(y)) extraDirtyRows.add(y);
      }
      let bandStart = -1;
      const flushBand = (bandEnd) => {
        if (bandStart < 0 || bandEnd <= bandStart) return;
        const bandHeight = bandEnd - bandStart;
        if (absDelta >= bandHeight) {
          for (let y = bandStart; y < bandEnd; y++) extraDirtyRows.add(y);
          bandStart = -1;
          return;
        }
        scrollOperations.push({
          startY: bandStart,
          endY: bandEnd,
          delta: pending.delta
        });
        if (pending.delta > 0) {
          for (let y = bandEnd - absDelta; y < bandEnd; y++) extraDirtyRows.add(y);
        } else {
          for (let y = bandStart; y < bandStart + absDelta; y++) extraDirtyRows.add(y);
        }
        bandStart = -1;
      };
      for (let y = pending.startY; y < pending.endY; y++) {
        if (blockedRows.has(y)) {
          flushBand(y);
          continue;
        }
        if (bandStart < 0) bandStart = y;
      }
      flushBand(pending.endY);
    }
    return {
      scrollOperations: scrollOperations.length ? scrollOperations : null,
      extraDirtyRows: Array.from(extraDirtyRows).sort((a, b) => a - b)
    };
  }
  function dirtyRowsCoverRange(rows2, startY, endY) {
    if (rows2 === null) return true;
    if (!rows2.length) return false;
    let idx = 0;
    while (idx < rows2.length && (rows2[idx] ?? -1) < startY) idx++;
    for (let y = startY; y < endY; y++) {
      if (rows2[idx] !== y) return false;
      idx++;
    }
    return true;
  }
  function dropScrollOpsCoveredByDirtyRows(ops, dirtyRows) {
    if (!ops?.length) return null;
    const next = ops.filter((op) => !dirtyRowsCoverRange(dirtyRows, op.startY, op.endY));
    return next.length ? next : null;
  }
  function scrollRowsForPlane(plane, startY, endY, lines) {
    const state = getPlaneState(plane);
    const op = normalizeScrollOperation(startY, endY, lines, state.buffer.rows);
    if (!op) return;
    scrollBufferRegion(state.buffer, op.startY, op.endY, op.delta);
    scrollPlaneCoverageRegion(state, op.startY, op.endY, op.delta);
    recordPendingScrollOp(plane, op);
  }
  function composeRows(rows2) {
    const blank = createBlankCell();
    const fpFn = compositeBuffer.fingerprintFn;
    const fpArr = compositeBuffer.soaFingerprints;
    const rowList = rows2 ?? Array.from({ length: compositeBuffer.rows }, (_, index) => index);
    for (const y of rowList) {
      if (y < 0 || y >= compositeBuffer.rows) continue;
      const dst = getBufferRow(compositeBuffer, y);
      dst.length = compositeBuffer.cols;
      for (let x = 0; x < compositeBuffer.cols; x++) dst[x] = blank;
      for (const plane of TERMINAL_RENDER_PLANES) {
        const state = planeStates.get(plane);
        if (!state) continue;
        const src = getBufferRow(state.buffer, y);
        const coverage = state.coverage[y];
        if (!coverage) continue;
        for (let x = 0; x < compositeBuffer.cols; x++) {
          if (coverage[x]) dst[x] = src[x];
        }
      }
      const cols2 = compositeBuffer.cols;
      for (let x = 0; x < cols2; x++) {
        const cell = dst[x];
        if (cell.width === 2 && !cell.continuation) {
          if (x + 1 >= cols2 || !dst[x + 1].continuation) {
            dst[x] = blank;
          }
        } else if (cell.continuation) {
          if (x === 0 || dst[x - 1].width !== 2 || dst[x - 1].continuation) {
            dst[x] = blank;
          }
        }
      }
      if (fpFn && fpArr) {
        const physY = (compositeBuffer.gridStart + y) % compositeBuffer.rows;
        const base2 = physY * cols2;
        for (let x = 0; x < cols2; x++) {
          const cell = dst[x];
          fpArr[base2 + x] = fpFn(cell.ch, cell.style);
        }
      }
      markDirty(compositeBuffer, y);
    }
  }
  function syncCompositeCursor() {
    const prevVisible = compositeBuffer.cursorVisible;
    const prevY = compositeBuffer.cursorY;
    let nextPlane = null;
    for (const plane of ["overlay", "chrome", "transcript", "default"]) {
      const state = planeStates.get(plane);
      if (state?.buffer.cursorVisible) {
        nextPlane = state;
        break;
      }
    }
    compositeBuffer.cursorVisible = Boolean(nextPlane);
    compositeBuffer.cursorX = nextPlane?.buffer.cursorX ?? 0;
    compositeBuffer.cursorY = nextPlane?.buffer.cursorY ?? 0;
    if (prevVisible) markDirty(compositeBuffer, prevY);
    if (compositeBuffer.cursorVisible) markDirty(compositeBuffer, compositeBuffer.cursorY);
  }
  function syncCompositeForRead(planes) {
    const planesToCompose = TERMINAL_RENDER_PLANES;
    let composeAllRows = false;
    const dirtyRows = /* @__PURE__ */ new Set();
    for (const plane of planesToCompose) {
      const state = planeStates.get(plane);
      if (!state) continue;
      const rows2 = peekDirtyRows(state.buffer);
      if (rows2 === null) {
        composeAllRows = true;
        break;
      }
      for (const y of rows2) dirtyRows.add(y);
    }
    if (composeAllRows || dirtyRows.size > 0)
      composeRows(composeAllRows ? null : Array.from(dirtyRows).sort((a, b) => a - b));
    syncCompositeCursor();
  }
  function pendingDirtyRowsForPlanes(planes) {
    const planesToCheck = planes?.length ? planes : TERMINAL_RENDER_PLANES;
    let full = false;
    const rows2 = /* @__PURE__ */ new Set();
    for (const plane of planesToCheck) {
      const state = planeStates.get(plane);
      if (!state) continue;
      const dirty = peekDirtyRows(state.buffer);
      if (dirty === null) {
        full = true;
        break;
      }
      for (const y of dirty) rows2.add(y);
    }
    if (full) return null;
    return Array.from(rows2).sort((a, b) => a - b);
  }
  function createPlaneTerminalApi(plane) {
    const existing = planeTerminals.get(plane);
    if (existing) return existing;
    const api = {
      resize(cols2, rows2) {
        assertNotDisposed();
        base.resize(cols2, rows2);
      },
      clear(x, y, w, h2) {
        assertNotDisposed();
        clearForPlane(plane, x, y, w, h2);
      },
      write(text, opts2) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const x = opts2?.x;
        const y = opts2?.y;
        const style = opts2?.style;
        if (x == null || y == null) {
          const next = writeAtForPlane(
            plane,
            text,
            state.buffer.cursorX,
            state.buffer.cursorY,
            style ?? state.buffer.cursorStyle
          );
          state.buffer.cursorX = next.x;
          state.buffer.cursorY = next.y;
        } else {
          writeAtForPlane(plane, text, x, y, style);
        }
      },
      writeAnsi(text, opts2) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const x = opts2?.x;
        const y = opts2?.y;
        const positionedWrite = x != null && y != null;
        let cx = positionedWrite ? x : state.buffer.cursorX;
        let cy = positionedWrite ? y : state.buffer.cursorY;
        let style = positionedWrite ? {} : state.buffer.cursorStyle;
        for (const seg of parseAnsiSgr(text, style)) {
          const next = writeAtForPlane(plane, seg.text, cx, cy, seg.style);
          cx = next.x;
          cy = next.y;
          style = seg.style;
        }
        if (!positionedWrite) {
          state.buffer.cursorX = cx;
          state.buffer.cursorY = cy;
          state.buffer.cursorStyle = style;
        }
      },
      put(x, y, ch, style) {
        assertNotDisposed();
        putForPlane(plane, x, y, ch, style);
      },
      fill(x, y, w, h2, ch, style) {
        assertNotDisposed();
        fillForPlane(plane, x, y, w, h2, ch, style);
      },
      scroll(lines) {
        assertNotDisposed();
        scrollForPlane(plane, lines);
      },
      setCursor(x, y, visible) {
        assertNotDisposed();
        setCursorForPlane(plane, x, y, visible);
      },
      batch(fn) {
        assertNotDisposed();
        return base.batch(fn);
      },
      commit(meta) {
        assertNotDisposed();
        return base.commit({ planes: meta?.planes ?? [plane], sync: meta?.sync });
      },
      on(event, cb) {
        assertNotDisposed();
        return base.on(event, cb);
      },
      dispose() {
        base.dispose();
      },
      size() {
        assertNotDisposed();
        return base.size();
      },
      snapshot() {
        assertNotDisposed();
        const state = getPlaneState(plane);
        return {
          cols: state.buffer.cols,
          rows: state.buffer.rows,
          lines: snapshotText(state.buffer)
        };
      },
      getCell(x, y) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        if (y < 0 || y >= state.buffer.rows || x < 0 || x >= state.buffer.cols)
          throw new RangeError("Cell out of bounds");
        return getBufferCell(state.buffer, x, y);
      },
      getRow(y) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        if (y < 0 || y >= state.buffer.rows) throw new RangeError("Row out of bounds");
        return getBufferRow(state.buffer, y);
      },
      setScrollbackLimit(limit) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        state.buffer.scrollbackLimit = Math.max(0, Math.floor(limit));
        if (state.buffer.scrollback.length > state.buffer.scrollbackLimit) {
          state.buffer.scrollback.splice(
            0,
            state.buffer.scrollback.length - state.buffer.scrollbackLimit
          );
        }
      },
      getScrollbackLines(count) {
        assertNotDisposed();
        const state = getPlaneState(plane);
        const all = state.buffer.scrollback.map(
          (row) => row.map((cell) => cell.continuation ? " " : cell.ch || " ").join("")
        );
        if (count == null) return all;
        return all.slice(Math.max(0, all.length - Math.max(0, Math.floor(count))));
      },
      setFingerprintFn(fn) {
        assertNotDisposed();
        base.setFingerprintFn(fn);
      },
      getRowFingerprints(y) {
        assertNotDisposed();
        return base.getRowFingerprints(y);
      }
    };
    planeTerminals.set(plane, api);
    return api;
  }
  base = {
    resize(cols2, rows2) {
      assertNotDisposed();
      const prevCols = compositeBuffer.cols;
      const prevRows = compositeBuffer.rows;
      resizeBuffer(compositeBuffer, cols2, rows2);
      for (const state of planeStates.values()) resizePlaneState(state, cols2, rows2);
      if (compositeBuffer.cols !== prevCols || compositeBuffer.rows !== prevRows)
        emitter.emit("resize", { cols: compositeBuffer.cols, rows: compositeBuffer.rows });
    },
    clear(x, y, w, h2) {
      assertNotDisposed();
      clearForPlane("default", x, y, w, h2);
    },
    write(text, opts2) {
      assertNotDisposed();
      createPlaneTerminalApi("default").write(text, opts2);
    },
    writeAnsi(text, opts2) {
      assertNotDisposed();
      createPlaneTerminalApi("default").writeAnsi(text, opts2);
    },
    put(x, y, ch, style) {
      assertNotDisposed();
      putForPlane("default", x, y, ch, style);
    },
    fill(x, y, w, h2, ch, style) {
      assertNotDisposed();
      fillForPlane("default", x, y, w, h2, ch, style);
    },
    scroll(lines) {
      assertNotDisposed();
      scrollForPlane("default", lines);
    },
    setCursor(x, y, visible = true) {
      assertNotDisposed();
      setCursorForPlane("default", x, y, visible);
    },
    batch(fn) {
      assertNotDisposed();
      batchingDepth++;
      try {
        return fn();
      } finally {
        batchingDepth--;
        if (batchingDepth === 0 && pendingCommit) {
          pendingCommit = false;
          const planes = pendingCommitAllPlanes ? null : pendingCommitPlanes;
          pendingCommitAllPlanes = false;
          pendingCommitPlanes = null;
          base.commit({ planes });
        }
      }
    },
    commit(meta) {
      assertNotDisposed();
      if (batchingDepth > 0) {
        pendingCommit = true;
        if (!meta?.planes?.length) {
          pendingCommitAllPlanes = true;
          pendingCommitPlanes = null;
        } else if (!pendingCommitAllPlanes) {
          pendingCommitPlanes = mergePlanes(pendingCommitPlanes, meta.planes);
        }
        return pendingDirtyRowsForPlanes(meta?.planes ?? null);
      }
      const planesToCompose = meta?.planes?.length ? meta.planes : TERMINAL_RENDER_PLANES;
      const pendingScrollOps = takePendingScrollOps(planesToCompose);
      const preparedScroll = prepareCompositeScrollOps(pendingScrollOps);
      let scrollOperations = preparedScroll.scrollOperations;
      let composeAllRows = false;
      const dirtyRows = /* @__PURE__ */ new Set();
      for (const plane of planesToCompose) {
        const state = planeStates.get(plane);
        if (!state) continue;
        const rows2 = collectAndClearDirtyRows(state.buffer);
        if (rows2 === null) {
          composeAllRows = true;
          break;
        }
        for (const y of rows2) dirtyRows.add(y);
      }
      for (const y of preparedScroll.extraDirtyRows) dirtyRows.add(y);
      const normalizedDirtyRows = composeAllRows ? null : Array.from(dirtyRows).sort((a, b) => a - b);
      scrollOperations = dropScrollOpsCoveredByDirtyRows(scrollOperations, normalizedDirtyRows);
      if (scrollOperations) {
        for (const op of scrollOperations)
          scrollBufferRegion(compositeBuffer, op.startY, op.endY, op.delta);
      }
      if (normalizedDirtyRows !== null && normalizedDirtyRows.length === 0) {
        const pendingCompositeRows = collectAndClearDirtyRows(compositeBuffer);
        if (pendingCompositeRows !== null && pendingCompositeRows.length === 0)
          return pendingCompositeRows;
        emitter.emit("commit", {
          dirtyRows: pendingCompositeRows,
          planes: meta?.planes ?? null,
          sync: meta?.sync,
          scrollOperations
        });
        return pendingCompositeRows;
      }
      composeRows(normalizedDirtyRows);
      if (normalizedDirtyRows === null) markAllDirty(compositeBuffer);
      syncCompositeCursor();
      const committedRows = collectAndClearDirtyRows(compositeBuffer);
      if (committedRows !== null && committedRows.length === 0) return committedRows;
      emitter.emit("commit", {
        dirtyRows: committedRows,
        planes: meta?.planes ?? null,
        sync: meta?.sync,
        scrollOperations
      });
      return committedRows;
    },
    on(event, cb) {
      assertNotDisposed();
      return emitter.on(event, cb);
    },
    dispose() {
      disposed = true;
      emitter.clear();
    },
    size() {
      assertNotDisposed();
      return { cols: compositeBuffer.cols, rows: compositeBuffer.rows };
    },
    snapshot() {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      return {
        cols: source.cols,
        rows: source.rows,
        lines: snapshotText(source)
      };
    },
    getCell(x, y) {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      if (y < 0 || y >= source.rows || x < 0 || x >= source.cols)
        throw new RangeError("Cell out of bounds");
      return getBufferCell(source, x, y);
    },
    getRow(y) {
      assertNotDisposed();
      if (batchingDepth === 0) syncCompositeForRead();
      const source = batchingDepth > 0 ? getPlaneState("default").buffer : compositeBuffer;
      if (y < 0 || y >= source.rows) throw new RangeError("Row out of bounds");
      return getBufferRow(source, y);
    },
    setScrollbackLimit(limit) {
      assertNotDisposed();
      const state = getPlaneState("default");
      state.buffer.scrollbackLimit = Math.max(0, Math.floor(limit));
      if (state.buffer.scrollback.length > state.buffer.scrollbackLimit) {
        state.buffer.scrollback.splice(
          0,
          state.buffer.scrollback.length - state.buffer.scrollbackLimit
        );
      }
    },
    getScrollbackLines(count) {
      assertNotDisposed();
      const state = getPlaneState("default");
      const all = state.buffer.scrollback.map(
        (row) => row.map((cell) => cell.continuation ? " " : cell.ch || " ").join("")
      );
      if (count == null) return all;
      return all.slice(Math.max(0, all.length - Math.max(0, Math.floor(count))));
    },
    setFingerprintFn(fn) {
      assertNotDisposed();
      setFingerprintFn(compositeBuffer, fn);
    },
    getRowFingerprints(y) {
      assertNotDisposed();
      return getRowFingerprints(compositeBuffer, y);
    }
  };
  base[TERMINAL_PLANE_INTERNALS] = {
    getPlaneTerminal: createPlaneTerminalApi,
    resetRowsForRender(plane, dirtyRows) {
      const state = getPlaneState(plane);
      const rows2 = normalizeDirtyRows(dirtyRows, state.buffer.rows);
      if (rows2 === null) {
        for (let y = 0; y < state.buffer.rows; y++) clearPlaneCoverageRow(state, y);
        return;
      }
      for (const y of rows2) clearPlaneCoverageRow(state, y);
    },
    getRowCoverageKind(plane, y) {
      const state = getPlaneState(plane);
      if (y < 0 || y >= state.coverage.length) return 0;
      const row = state.coverage[y];
      if (!row?.length) return 0;
      let covered = 0;
      for (let x = 0; x < row.length; x++) {
        if (row[x]) covered++;
      }
      if (covered === 0) return 0;
      if (covered >= row.length) return 2;
      return 1;
    },
    scrollRows(plane, startY, endY, lines) {
      scrollRowsForPlane(plane, startY, endY, lines);
    }
  };
  return base;
}
/**
* @vue/shared v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map2 = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map2[key] = 1;
  return (val) => val in map2;
}
const EMPTY_OBJ = !!(process.env.NODE_ENV !== "production") ? Object.freeze({}) : {};
const EMPTY_ARR = !!(process.env.NODE_ENV !== "production") ? Object.freeze([]) : [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove$1 = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject$1 = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const isBuiltInDirective = /* @__PURE__ */ makeMap(
  "bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text,memo"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return (str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  };
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s = str ? `on${capitalize(str)}` : ``;
    return s;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
function normalizeStyle(value) {
  if (isArray(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
function looseCompareArrays(a, b) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i]);
  }
  return equal;
}
function looseEqual(a, b) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray(a);
  bValidType = isArray(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false;
  }
  aValidType = isObject(a);
  bValidType = isObject(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    const aKeysCount = Object.keys(a).length;
    const bKeysCount = Object.keys(b).length;
    if (aKeysCount !== bKeysCount) {
      return false;
    }
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key);
      const bHasKey = b.hasOwnProperty(key);
      if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
        return false;
      }
    }
  }
  return String(a) === String(b);
}
/**
* @vue/reactivity v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
function warn$2(msg, ...args) {
  console.warn(`[Vue warn] ${msg}`, ...args);
}
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this.__v_skip = true;
    this.parent = activeEffectScope;
    if (!detached && activeEffectScope) {
      this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
        this
      ) - 1;
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume();
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    } else if (!!(process.env.NODE_ENV !== "production")) {
      warn$2(`cannot run an inactive effect scope.`);
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope;
      } else {
        let current = activeEffectScope;
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope;
            break;
          }
          current = current.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function getCurrentScope() {
  return activeEffectScope;
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this);
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      if (!!(process.env.NODE_ENV !== "production") && activeSub !== this) {
        warn$2(
          "Active effect was not restored correctly - this is likely a Vue internal bug."
        );
      }
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed = false) {
  sub.flags |= 8;
  if (isComputed) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (!!(process.env.NODE_ENV !== "production") && dep.subsHead === link) {
    dep.subsHead = nextSub;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
    if (!!(process.env.NODE_ENV !== "production")) {
      this.subsHead = void 0;
    }
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    if (!!(process.env.NODE_ENV !== "production") && activeSub.onTrack) {
      activeSub.onTrack(
        extend(
          {
            effect: activeSub
          },
          debugInfo
        )
      );
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (!!(process.env.NODE_ENV !== "production")) {
        for (let head = this.subsHead; head; head = head.nextSub) {
          if (head.sub.onTrigger && !(head.sub.flags & 8)) {
            head.sub.onTrigger(
              extend(
                {
                  effect: head.sub
                },
                debugInfo
              )
            );
          }
        }
      }
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    if (!!(process.env.NODE_ENV !== "production") && link.dep.subsHead === void 0) {
      link.dep.subsHead = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== "production") ? "Object iterate" : ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== "production") ? "Map keys iterate" : ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  !!(process.env.NODE_ENV !== "production") ? "Array iterate" : ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    if (!!(process.env.NODE_ENV !== "production")) {
      dep.track({
        target,
        type,
        key
      });
    } else {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      if (!!(process.env.NODE_ENV !== "production")) {
        dep.trigger({
          target,
          type,
          key,
          newValue,
          oldValue,
          oldTarget
        });
      } else {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method]();
  if (arr !== self2 && !/* @__PURE__ */ isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = /* @__PURE__ */ toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self2))[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          if (!!(process.env.NODE_ENV !== "production")) {
            warn$2(
              `Set operation on key "${String(key)}" failed: target is readonly.`,
              target[key]
            );
          }
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value, oldValue);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0, oldValue);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    if (!!(process.env.NODE_ENV !== "production")) {
      warn$2(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      );
    }
    return true;
  }
  deleteProperty(target, key) {
    if (!!(process.env.NODE_ENV !== "production")) {
      warn$2(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      );
    }
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    if (!!(process.env.NODE_ENV !== "production")) {
      const key = args[0] ? `on key "${args[0]}" ` : ``;
      warn$2(
        `${capitalize(type)} operation ${key}failed: target is readonly.`,
        /* @__PURE__ */ toRaw(this)
      );
    }
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        } else if (!!(process.env.NODE_ENV !== "production")) {
          checkIdentityKeys(target, has, key);
        }
        const oldValue = get.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value, oldValue);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        } else if (!!(process.env.NODE_ENV !== "production")) {
          checkIdentityKeys(target, has, key);
        }
        const oldValue = get ? get.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0, oldValue);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const oldTarget = !!(process.env.NODE_ENV !== "production") ? isMap(target) ? new Map(target) : new Set(target) : void 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0,
            oldTarget
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
function checkIdentityKeys(target, has, key) {
  const rawKey = /* @__PURE__ */ toRaw(key);
  if (rawKey !== key && has.call(target, rawKey)) {
    const type = toRawType(target);
    warn$2(
      `Reactive ${type} contains both the raw and reactive versions of the same object${type === `Map` ? ` as keys` : ``}, which can lead to inconsistencies. Avoid differentiating between the raw and reactive versions of an object and only use the reactive version if possible.`
    );
  }
}
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
function getTargetType(value) {
  return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject(target)) {
    if (!!(process.env.NODE_ENV !== "production")) {
      warn$2(
        `value cannot be made ${isReadonly2 ? "readonly" : "reactive"}: ${String(
          target
        )}`
      );
    }
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  const targetType = getTargetType(target);
  if (targetType === 0) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
  return createRef(value, true);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    if (!!(process.env.NODE_ENV !== "production")) {
      this.dep.track({
        target: this,
        type: "get",
        key: "value"
      });
    } else {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      if (!!(process.env.NODE_ENV !== "production")) {
        this.dep.trigger({
          target: this,
          type: "set",
          key: "value",
          newValue,
          oldValue
        });
      } else {
        this.dep.trigger();
      }
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    } else if (!!(process.env.NODE_ENV !== "production")) ;
  }
  get value() {
    const link = !!(process.env.NODE_ENV !== "production") ? this.dep.track({
      target: this,
      type: "get",
      key: "value"
    }) : this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    } else if (!!(process.env.NODE_ENV !== "production")) {
      warn$2("Write operation failed: computed value is readonly");
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  if (!!(process.env.NODE_ENV !== "production") && debugOptions) ;
  return cRef;
}
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  } else if (!!(process.env.NODE_ENV !== "production") && !failSilently) {
    warn$2(
      `onWatcherCleanup() was called when there was no active watcher to associate with.`
    );
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const warnInvalidSource = (s) => {
    (options.onWarn || warn$2)(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, a reactive object, or an array of these types.`
    );
  };
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call ? call(s, 2) : s();
      } else {
        !!(process.env.NODE_ENV !== "production") && warnInvalidSource(s);
      }
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
    !!(process.env.NODE_ENV !== "production") && warnInvalidSource(source);
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect.stop();
    if (scope && scope.active) {
      remove$1(scope.effects, effect);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      _cb(...args);
      watchHandle();
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect.flags & 1) || !effect.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect.run();
      if (deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect = new ReactiveEffect(getter);
  effect.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect);
  cleanup = effect.onStop = () => {
    const cleanups = cleanupMap.get(effect);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect);
    }
  };
  if (!!(process.env.NODE_ENV !== "production")) {
    effect.onTrack = options.onTrack;
    effect.onTrigger = options.onTrigger;
  }
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect.run();
  }
  watchHandle.pause = effect.pause.bind(effect);
  watchHandle.resume = effect.resume.bind(effect);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject(value) || value["__v_skip"]) {
    return value;
  }
  seen = seen || /* @__PURE__ */ new Map();
  if ((seen.get(value) || 0) >= depth) {
    return value;
  }
  seen.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen);
    });
  } else if (isPlainObject$1(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
function pushWarningContext(vnode) {
  stack.push(vnode);
}
function popWarningContext() {
  stack.pop();
}
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a, _b;
          return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (/* @__PURE__ */ isRef(value)) {
    value = formatProp(key, /* @__PURE__ */ toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = /* @__PURE__ */ toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
const ErrorTypeStrings$1 = {
  ["sp"]: "serverPrefetch hook",
  ["bc"]: "beforeCreate hook",
  ["c"]: "created hook",
  ["bm"]: "beforeMount hook",
  ["m"]: "mounted hook",
  ["bu"]: "beforeUpdate hook",
  ["u"]: "updated",
  ["bum"]: "beforeUnmount hook",
  ["um"]: "unmounted hook",
  ["a"]: "activated hook",
  ["da"]: "deactivated hook",
  ["ec"]: "errorCaptured hook",
  ["rtc"]: "renderTracked hook",
  ["rtg"]: "renderTriggered hook",
  [0]: "setup function",
  [1]: "render function",
  [2]: "watcher getter",
  [3]: "watcher callback",
  [4]: "watcher cleanup function",
  [5]: "native event handler",
  [6]: "component event handler",
  [7]: "vnode hook",
  [8]: "directive hook",
  [9]: "transition hook",
  [10]: "app errorHandler",
  [11]: "app warnHandler",
  [12]: "ref function",
  [13]: "async component loader",
  [14]: "scheduler flush",
  [15]: "component update",
  [16]: "app unmount cleanup function"
};
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type);
      });
    }
    return res;
  }
  if (isArray(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  } else if (!!(process.env.NODE_ENV !== "production")) {
    warn$1(
      `Invalid value type passed to callWithAsyncErrorHandling(): ${typeof fn}`
    );
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = !!(process.env.NODE_ENV !== "production") ? ErrorTypeStrings$1[type] : `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (!!(process.env.NODE_ENV !== "production")) {
    const info = ErrorTypeStrings$1[type];
    if (contextVNode) {
      pushWarningContext(contextVNode);
    }
    warn$1(`Unhandled error${info ? ` during execution of ${info}` : ``}`);
    if (contextVNode) {
      popWarningContext();
    }
    if (throwInDev) {
      throw err;
    } else {
      console.error(err);
    }
  } else if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
const RECURSION_LIMIT = 100;
function nextTick(fn) {
  const p = currentFlushPromise || resolvedPromise;
  return fn ? p.then(this ? fn.bind(this) : fn) : p;
}
function findInsertionIndex(id) {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = start + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    pendingPostFlushCbs.push(...cb);
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
  if (!!(process.env.NODE_ENV !== "production")) {
    seen = seen || /* @__PURE__ */ new Map();
  }
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      if (!!(process.env.NODE_ENV !== "production") && checkRecursiveUpdates(seen, cb)) {
        continue;
      }
      queue.splice(i, 1);
      i--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }
    activePostFlushCbs = deduped;
    if (!!(process.env.NODE_ENV !== "production")) {
      seen = seen || /* @__PURE__ */ new Map();
    }
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (!!(process.env.NODE_ENV !== "production") && checkRecursiveUpdates(seen, cb)) {
        continue;
      }
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
  if (!!(process.env.NODE_ENV !== "production")) {
    seen = seen || /* @__PURE__ */ new Map();
  }
  const check = !!(process.env.NODE_ENV !== "production") ? (job) => checkRecursiveUpdates(seen, job) : NOOP;
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (!!(process.env.NODE_ENV !== "production") && check(job)) {
          continue;
        }
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs(seen);
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen);
    }
  }
}
function checkRecursiveUpdates(seen, fn) {
  const count = seen.get(fn) || 0;
  if (count > RECURSION_LIMIT) {
    const instance = fn.i;
    const componentName = instance && getComponentName(instance.type);
    handleError(
      `Maximum recursive updates exceeded${componentName ? ` in component <${componentName}>` : ``}. This means you have a reactive effect that is mutating its own dependencies and thus recursively triggering itself. Possible sources include component template, render function, updated hook or watcher source function.`,
      null,
      10
    );
    return true;
  }
  seen.set(fn, count + 1);
  return false;
}
let isHmrUpdating = false;
const setHmrUpdating = (v) => {
  try {
    return isHmrUpdating;
  } finally {
    isHmrUpdating = v;
  }
};
const hmrDirtyComponents = /* @__PURE__ */ new Map();
if (!!(process.env.NODE_ENV !== "production")) {
  getGlobalThis().__VUE_HMR_RUNTIME__ = {
    createRecord: tryWrap(createRecord),
    rerender: tryWrap(rerender),
    reload: tryWrap(reload)
  };
}
const map = /* @__PURE__ */ new Map();
function registerHMR(instance) {
  const id = instance.type.__hmrId;
  let record = map.get(id);
  if (!record) {
    createRecord(id, instance.type);
    record = map.get(id);
  }
  record.instances.add(instance);
}
function unregisterHMR(instance) {
  map.get(instance.type.__hmrId).instances.delete(instance);
}
function createRecord(id, initialDef) {
  if (map.has(id)) {
    return false;
  }
  map.set(id, {
    initialDef: normalizeClassComponent(initialDef),
    instances: /* @__PURE__ */ new Set()
  });
  return true;
}
function normalizeClassComponent(component) {
  return isClassComponent(component) ? component.__vccOpts : component;
}
function rerender(id, newRender) {
  const record = map.get(id);
  if (!record) {
    return;
  }
  record.initialDef.render = newRender;
  [...record.instances].forEach((instance) => {
    if (newRender) {
      instance.render = newRender;
      normalizeClassComponent(instance.type).render = newRender;
    }
    instance.renderCache = [];
    isHmrUpdating = true;
    if (!(instance.job.flags & 8)) {
      instance.update();
    }
    isHmrUpdating = false;
  });
}
function reload(id, newComp) {
  const record = map.get(id);
  if (!record) return;
  newComp = normalizeClassComponent(newComp);
  updateComponentDef(record.initialDef, newComp);
  const instances = [...record.instances];
  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const oldComp = normalizeClassComponent(instance.type);
    let dirtyInstances = hmrDirtyComponents.get(oldComp);
    if (!dirtyInstances) {
      if (oldComp !== record.initialDef) {
        updateComponentDef(oldComp, newComp);
      }
      hmrDirtyComponents.set(oldComp, dirtyInstances = /* @__PURE__ */ new Set());
    }
    dirtyInstances.add(instance);
    instance.appContext.propsCache.delete(instance.type);
    instance.appContext.emitsCache.delete(instance.type);
    instance.appContext.optionsCache.delete(instance.type);
    if (instance.ceReload) {
      dirtyInstances.add(instance);
      instance.ceReload(newComp.styles);
      dirtyInstances.delete(instance);
    } else if (instance.parent) {
      queueJob(() => {
        if (!(instance.job.flags & 8)) {
          isHmrUpdating = true;
          instance.parent.update();
          isHmrUpdating = false;
          dirtyInstances.delete(instance);
        }
      });
    } else if (instance.appContext.reload) {
      instance.appContext.reload();
    } else if (typeof window !== "undefined") {
      window.location.reload();
    } else {
      console.warn(
        "[HMR] Root or manually mounted instance modified. Full reload required."
      );
    }
    if (instance.root.ce && instance !== instance.root) {
      instance.root.ce._removeChildStyle(oldComp);
    }
  }
  queuePostFlushCb(() => {
    hmrDirtyComponents.clear();
  });
}
function updateComponentDef(oldComp, newComp) {
  extend(oldComp, newComp);
  for (const key in oldComp) {
    if (key !== "__file" && !(key in newComp)) {
      delete oldComp[key];
    }
  }
}
function tryWrap(fn) {
  return (id, arg) => {
    try {
      return fn(id, arg);
    } catch (e) {
      console.error(e);
      console.warn(
        `[HMR] Something went wrong during Vue component hot-reload. Full reload required.`
      );
    }
  };
}
let devtools$1;
let buffer = [];
let devtoolsNotInstalled = false;
function emit$1(event, ...args) {
  if (devtools$1) {
    devtools$1.emit(event, ...args);
  } else if (!devtoolsNotInstalled) {
    buffer.push({ event, args });
  }
}
function setDevtoolsHook$1(hook, target) {
  var _a, _b;
  devtools$1 = hook;
  if (devtools$1) {
    devtools$1.enabled = true;
    buffer.forEach(({ event, args }) => devtools$1.emit(event, ...args));
    buffer = [];
  } else if (
    // handle late devtools injection - only do this if we are in an actual
    // browser environment to avoid the timer handle stalling test runner exit
    // (#4815)
    typeof window !== "undefined" && // some envs mock window but not fully
    window.HTMLElement && // also exclude jsdom
    // eslint-disable-next-line no-restricted-syntax
    !((_b = (_a = window.navigator) == null ? void 0 : _a.userAgent) == null ? void 0 : _b.includes("jsdom"))
  ) {
    const replay = target.__VUE_DEVTOOLS_HOOK_REPLAY__ = target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [];
    replay.push((newHook) => {
      setDevtoolsHook$1(newHook, target);
    });
    setTimeout(() => {
      if (!devtools$1) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null;
        devtoolsNotInstalled = true;
        buffer = [];
      }
    }, 3e3);
  } else {
    devtoolsNotInstalled = true;
    buffer = [];
  }
}
function devtoolsInitApp(app2, version2) {
  emit$1("app:init", app2, version2, {
    Fragment,
    Text,
    Comment,
    Static
  });
}
function devtoolsUnmountApp(app2) {
  emit$1("app:unmount", app2);
}
const devtoolsComponentAdded = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:added"
  /* COMPONENT_ADDED */
);
const devtoolsComponentUpdated = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:updated"
  /* COMPONENT_UPDATED */
);
const _devtoolsComponentRemoved = /* @__PURE__ */ createDevtoolsComponentHook(
  "component:removed"
  /* COMPONENT_REMOVED */
);
const devtoolsComponentRemoved = (component) => {
  if (devtools$1 && typeof devtools$1.cleanupBuffer === "function" && // remove the component if it wasn't buffered
  !devtools$1.cleanupBuffer(component)) {
    _devtoolsComponentRemoved(component);
  }
};
// @__NO_SIDE_EFFECTS__
function createDevtoolsComponentHook(hook) {
  return (component) => {
    emit$1(
      hook,
      component.appContext.app,
      component.uid,
      component.parent ? component.parent.uid : void 0,
      component
    );
  };
}
const devtoolsPerfStart = /* @__PURE__ */ createDevtoolsPerformanceHook(
  "perf:start"
  /* PERFORMANCE_START */
);
const devtoolsPerfEnd = /* @__PURE__ */ createDevtoolsPerformanceHook(
  "perf:end"
  /* PERFORMANCE_END */
);
function createDevtoolsPerformanceHook(hook) {
  return (component, type, time) => {
    emit$1(hook, component.appContext.app, component.uid, component, type, time);
  };
}
function devtoolsComponentEmit(component, event, params) {
  emit$1(
    "component:emit",
    component.appContext.app,
    component,
    event,
    params
  );
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    let res;
    try {
      res = fn(...args);
    } finally {
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    if (!!(process.env.NODE_ENV !== "production") || false) {
      devtoolsComponentUpdated(ctx);
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function validateDirectiveName(name) {
  if (isBuiltInDirective(name)) {
    warn$1("Do not use built-in directive ids as custom directive id: " + name);
  }
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (!!(process.env.NODE_ENV !== "production")) {
    if (!currentInstance || currentInstance.isMounted) {
      warn$1(`provide() can only be used inside setup().`);
    }
  }
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else if (!!(process.env.NODE_ENV !== "production")) {
      warn$1(`injection "${String(key)}" not found.`);
    }
  } else if (!!(process.env.NODE_ENV !== "production")) {
    warn$1(`inject() can only be used inside setup() or functional components.`);
  }
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    if (!ctx) {
      !!(process.env.NODE_ENV !== "production") && warn$1(
        `Server rendering context not provided. Make sure to only call useSSRContext() conditionally in the server build.`
      );
    }
    return ctx;
  }
};
function watchEffect(effect2, options) {
  return doWatch(effect2, null, options);
}
function watch(source, cb, options) {
  if (!!(process.env.NODE_ENV !== "production") && !isFunction(cb)) {
    warn$1(
      `\`watch(fn, options?)\` signature has been moved to a separate API. Use \`watchEffect(fn, options?)\` instead. \`watch\` now only supports \`watch(source, cb, options?) signature.`
    );
  }
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  if (!!(process.env.NODE_ENV !== "production") && !cb) {
    if (immediate !== void 0) {
      warn$1(
        `watch() "immediate" option is only respected when using the watch(source, callback, options?) signature.`
      );
    }
    if (deep !== void 0) {
      warn$1(
        `watch() "deep" option is only respected when using the watch(source, callback, options?) signature.`
      );
    }
    if (once !== void 0) {
      warn$1(
        `watch() "once" option is only respected when using the watch(source, callback, options?) signature.`
      );
    }
  }
  const baseWatchOptions = extend({}, options);
  if (!!(process.env.NODE_ENV !== "production")) baseWatchOptions.onWarn = warn$1;
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    setTransitionHooks(vnode.component.subTree, hooks);
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
const knownTemplateRefs = /* @__PURE__ */ new WeakSet();
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  if (!!(process.env.NODE_ENV !== "production") && !owner) {
    warn$1(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. A vnode with ref must be created inside the render function.`
    );
    return;
  }
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = /* @__PURE__ */ toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (!!(process.env.NODE_ENV !== "production")) {
      if (hasOwn(rawSetupState, key) && !/* @__PURE__ */ isRef(rawSetupState[key])) {
        warn$1(
          `Template ref "${key}" used on a non-ref value. It will not work in the production build.`
        );
      }
      if (knownTemplateRefs.has(rawSetupState[key])) {
        return false;
      }
    }
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (!!(process.env.NODE_ENV !== "production") && knownTemplateRefs.has(ref22)) {
      return false;
    }
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (/* @__PURE__ */ isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString(ref3);
    const _isRef = /* @__PURE__ */ isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef(ref3) || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray(existing) && remove$1(existing, refValue);
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else if (!!(process.env.NODE_ENV !== "production")) {
          warn$1("Invalid template ref type:", ref3, `(${typeof ref3})`);
        }
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    } else if (!!(process.env.NODE_ENV !== "production")) {
      warn$1("Invalid template ref type:", ref3, `(${typeof ref3})`);
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove$1(keepAliveRoot[type], injected);
  }, target);
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  } else if (!!(process.env.NODE_ENV !== "production")) {
    const apiName = toHandlerKey(ErrorTypeStrings$1[type].replace(/ hook$/, ""));
    warn$1(
      `${apiName} is called when there is no active component instance to be associated with. Lifecycle injection APIs can only be used during execution of setup(). If you are using async setup(), make sure to register lifecycle hooks before the first await statement.`
    );
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(i.props) : i.props,
    $attrs: (i) => !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(i.attrs) : i.attrs,
    $slots: (i) => !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(i.slots) : i.slots,
    $refs: (i) => !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(i.refs) : i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i)
  })
);
const isReservedPrefix = (key) => key === "_" || key === "$";
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (!!(process.env.NODE_ENV !== "production") && key === "__isVue") {
      return true;
    }
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
        !!(process.env.NODE_ENV !== "production") && markAttrsAccessed();
      } else if (!!(process.env.NODE_ENV !== "production") && key === "$slots") {
        track(instance, "get", key);
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else if (!!(process.env.NODE_ENV !== "production") && currentRenderingInstance && (!isString(key) || // #1091 avoid internal isRef/isVNode checks on component instance leading
    // to infinite warning loop
    key.indexOf("__v") !== 0)) {
      if (data !== EMPTY_OBJ && isReservedPrefix(key[0]) && hasOwn(data, key)) {
        warn$1(
          `Property ${JSON.stringify(
            key
          )} must be accessed via $data because it starts with a reserved character ("$" or "_") and is not proxied on the render context.`
        );
      } else if (instance === currentRenderingInstance) {
        warn$1(
          `Property ${JSON.stringify(key)} was accessed during render but is not defined on instance.`
        );
      }
    }
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (!!(process.env.NODE_ENV !== "production") && setupState.__isScriptSetup && hasOwn(setupState, key)) {
      warn$1(`Cannot mutate <script setup> binding "${key}" from Options API.`);
      return false;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      !!(process.env.NODE_ENV !== "production") && warn$1(`Attempting to mutate prop "${key}". Props are readonly.`);
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      !!(process.env.NODE_ENV !== "production") && warn$1(
        `Attempting to mutate public property "${key}". Properties starting with $ are reserved and readonly.`
      );
      return false;
    } else {
      if (!!(process.env.NODE_ENV !== "production") && key in instance.appContext.config.globalProperties) {
        Object.defineProperty(ctx, key, {
          enumerable: true,
          configurable: true,
          value
        });
      } else {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
if (!!(process.env.NODE_ENV !== "production") && true) {
  PublicInstanceProxyHandlers.ownKeys = (target) => {
    warn$1(
      `Avoid app logic that relies on enumerating keys on a component instance. The keys will be empty in production mode to avoid performance overhead.`
    );
    return Reflect.ownKeys(target);
  };
}
function createDevRenderContext(instance) {
  const target = {};
  Object.defineProperty(target, `_`, {
    configurable: true,
    enumerable: false,
    get: () => instance
  });
  Object.keys(publicPropertiesMap).forEach((key) => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get: () => publicPropertiesMap[key](instance),
      // intercepted by the proxy so no need for implementation,
      // but needed to prevent set errors
      set: NOOP
    });
  });
  return target;
}
function exposePropsOnRenderContext(instance) {
  const {
    ctx,
    propsOptions: [propsOptions]
  } = instance;
  if (propsOptions) {
    Object.keys(propsOptions).forEach((key) => {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => instance.props[key],
        set: NOOP
      });
    });
  }
}
function exposeSetupStateOnRenderContext(instance) {
  const { ctx, setupState } = instance;
  Object.keys(/* @__PURE__ */ toRaw(setupState)).forEach((key) => {
    if (!setupState.__isScriptSetup) {
      if (isReservedPrefix(key[0])) {
        warn$1(
          `setup() return property ${JSON.stringify(
            key
          )} should not start with "$" or "_" which are reserved prefixes for Vue internals.`
        );
        return;
      }
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => setupState[key],
        set: NOOP
      });
    }
  });
}
function normalizePropsOrEmits(props) {
  return isArray(props) ? props.reduce(
    (normalized, p) => (normalized[p] = null, normalized),
    {}
  ) : props;
}
function createDuplicateChecker() {
  const cache = /* @__PURE__ */ Object.create(null);
  return (type, key) => {
    if (cache[key]) {
      warn$1(`${type} property "${key}" is already defined in ${cache[key]}.`);
    } else {
      cache[key] = type;
    }
  };
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = !!(process.env.NODE_ENV !== "production") ? createDuplicateChecker() : null;
  if (!!(process.env.NODE_ENV !== "production")) {
    const [propsOptions] = instance.propsOptions;
    if (propsOptions) {
      for (const key in propsOptions) {
        checkDuplicateProperties("Props", key);
      }
    }
  }
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        if (!!(process.env.NODE_ENV !== "production")) {
          Object.defineProperty(ctx, key, {
            value: methodHandler.bind(publicThis),
            configurable: true,
            enumerable: true,
            writable: true
          });
        } else {
          ctx[key] = methodHandler.bind(publicThis);
        }
        if (!!(process.env.NODE_ENV !== "production")) {
          checkDuplicateProperties("Methods", key);
        }
      } else if (!!(process.env.NODE_ENV !== "production")) {
        warn$1(
          `Method "${key}" has type "${typeof methodHandler}" in the component definition. Did you reference the function correctly?`
        );
      }
    }
  }
  if (dataOptions) {
    if (!!(process.env.NODE_ENV !== "production") && !isFunction(dataOptions)) {
      warn$1(
        `The data option must be a function. Plain object usage is no longer supported.`
      );
    }
    const data = dataOptions.call(publicThis, publicThis);
    if (!!(process.env.NODE_ENV !== "production") && isPromise(data)) {
      warn$1(
        `data() returned a Promise - note data() cannot be async; If you intend to perform data fetching before component renders, use async setup() + <Suspense>.`
      );
    }
    if (!isObject(data)) {
      !!(process.env.NODE_ENV !== "production") && warn$1(`data() should return an object.`);
    } else {
      instance.data = /* @__PURE__ */ reactive(data);
      if (!!(process.env.NODE_ENV !== "production")) {
        for (const key in data) {
          checkDuplicateProperties("Data", key);
          if (!isReservedPrefix(key[0])) {
            Object.defineProperty(ctx, key, {
              configurable: true,
              enumerable: true,
              get: () => data[key],
              set: NOOP
            });
          }
        }
      }
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      if (!!(process.env.NODE_ENV !== "production") && get === NOOP) {
        warn$1(`Computed property "${key}" has no getter.`);
      }
      const set = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : !!(process.env.NODE_ENV !== "production") ? () => {
        warn$1(
          `Write operation failed: computed property "${key}" is readonly.`
        );
      } : NOOP;
      const c = computed({
        get,
        set
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
      if (!!(process.env.NODE_ENV !== "production")) {
        checkDuplicateProperties("Computed", key);
      }
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render && instance.render === NOOP) {
    instance.render = render;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (/* @__PURE__ */ isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
    if (!!(process.env.NODE_ENV !== "production")) {
      checkDuplicateProperties("Inject", key);
    }
  }
}
function callHook(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    } else if (!!(process.env.NODE_ENV !== "production")) {
      warn$1(`Invalid watch handler specified by key "${raw}"`, handler);
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject(raw)) {
    if (isArray(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      } else if (!!(process.env.NODE_ENV !== "production")) {
        warn$1(`Invalid watch handler specified by key "${raw.handler}"`, handler);
      }
    }
  } else if (!!(process.env.NODE_ENV !== "production")) {
    warn$1(`Invalid watch option: "${key}"`, raw);
  }
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions(resolved, base, optionMergeStrategies);
  }
  if (isObject(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") {
      !!(process.env.NODE_ENV !== "production") && warn$1(
        `"expose" option is ignored when declared in mixins or extends. It should only be declared in the base component itself.`
      );
    } else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray(to) && isArray(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render, hydrate) {
  return function createApp(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject(rootProps)) {
      !!(process.env.NODE_ENV !== "production") && warn$1(`root props passed to app.mount() must be an object.`);
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app2 = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
        if (!!(process.env.NODE_ENV !== "production")) {
          warn$1(
            `app.config cannot be replaced. Modify individual options instead.`
          );
        }
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) {
          !!(process.env.NODE_ENV !== "production") && warn$1(`Plugin has already been applied to target app.`);
        } else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app2, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app2, ...options);
        } else if (!!(process.env.NODE_ENV !== "production")) {
          warn$1(
            `A plugin must either be a function or an object with an "install" function.`
          );
        }
        return app2;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          } else if (!!(process.env.NODE_ENV !== "production")) {
            warn$1(
              "Mixin has already been applied to target app" + (mixin.name ? `: ${mixin.name}` : "")
            );
          }
        }
        return app2;
      },
      component(name, component) {
        if (!!(process.env.NODE_ENV !== "production")) {
          validateComponentName(name, context.config);
        }
        if (!component) {
          return context.components[name];
        }
        if (!!(process.env.NODE_ENV !== "production") && context.components[name]) {
          warn$1(`Component "${name}" has already been registered in target app.`);
        }
        context.components[name] = component;
        return app2;
      },
      directive(name, directive) {
        if (!!(process.env.NODE_ENV !== "production")) {
          validateDirectiveName(name);
        }
        if (!directive) {
          return context.directives[name];
        }
        if (!!(process.env.NODE_ENV !== "production") && context.directives[name]) {
          warn$1(`Directive "${name}" has already been registered in target app.`);
        }
        context.directives[name] = directive;
        return app2;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          if (!!(process.env.NODE_ENV !== "production") && rootContainer.__vue_app__) {
            warn$1(
              `There is already an app instance mounted on the host container.
 If you want to mount another app on the same host container, you need to unmount the previous app by calling \`app.unmount()\` first.`
            );
          }
          const vnode = app2._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          if (!!(process.env.NODE_ENV !== "production")) {
            context.reload = () => {
              const cloned = cloneVNode(vnode);
              cloned.el = null;
              render(cloned, rootContainer, namespace);
            };
          }
          {
            render(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app2._container = rootContainer;
          rootContainer.__vue_app__ = app2;
          if (!!(process.env.NODE_ENV !== "production") || false) {
            app2._instance = vnode.component;
            devtoolsInitApp(app2, version);
          }
          return getComponentPublicInstance(vnode.component);
        } else if (!!(process.env.NODE_ENV !== "production")) {
          warn$1(
            `App has already been mounted.
If you want to remount the same app, move your app creation logic into a factory function and create fresh app instances for each mount - e.g. \`const createMyApp = () => createApp(App)\``
          );
        }
      },
      onUnmount(cleanupFn) {
        if (!!(process.env.NODE_ENV !== "production") && typeof cleanupFn !== "function") {
          warn$1(
            `Expected function as first argument to app.onUnmount(), but got ${typeof cleanupFn}`
          );
        }
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app2._instance,
            16
          );
          render(null, app2._container);
          if (!!(process.env.NODE_ENV !== "production") || false) {
            app2._instance = null;
            devtoolsUnmountApp(app2);
          }
          delete app2._container.__vue_app__;
        } else if (!!(process.env.NODE_ENV !== "production")) {
          warn$1(`Cannot unmount an app that is not mounted.`);
        }
      },
      provide(key, value) {
        if (!!(process.env.NODE_ENV !== "production") && key in context.provides) {
          if (hasOwn(context.provides, key)) {
            warn$1(
              `App already provides property with key "${String(key)}". It will be overwritten with the new value.`
            );
          } else {
            warn$1(
              `App already provides property with key "${String(key)}" inherited from its parent element. It will be overwritten with the new value.`
            );
          }
        }
        context.provides[key] = value;
        return app2;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app2;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app2;
  };
}
let currentApp = null;
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  if (!!(process.env.NODE_ENV !== "production")) {
    const {
      emitsOptions,
      propsOptions: [propsOptions]
    } = instance;
    if (emitsOptions) {
      if (!(event in emitsOptions) && true) {
        if (!propsOptions || !(toHandlerKey(camelize(event)) in propsOptions)) {
          warn$1(
            `Component emitted event "${event}" but it is neither declared in the emits option nor as an "${toHandlerKey(camelize(event))}" prop.`
          );
        }
      } else {
        const validator = emitsOptions[event];
        if (isFunction(validator)) {
          const isValid = validator(...rawArgs);
          if (!isValid) {
            warn$1(
              `Invalid event arguments: event validation failed for event "${event}".`
            );
          }
        }
      }
    }
  }
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber);
    }
  }
  if (!!(process.env.NODE_ENV !== "production") || false) {
    devtoolsComponentEmit(instance, event, args);
  }
  if (!!(process.env.NODE_ENV !== "production")) {
    const lowerCaseEvent = event.toLowerCase();
    if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
      warn$1(
        `Event "${lowerCaseEvent}" is emitted in component ${formatComponentName(
          instance,
          instance.type
        )} but the handler is registered for "${event}". Note that HTML attributes are case-insensitive and you cannot use v-on to listen to camelCase events when using in-DOM templates. You should probably use "${hyphenate(
          event
        )}" instead of "${event}".`
      );
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2).replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
let accessedAttrs = false;
function markAttrsAccessed() {
  accessedAttrs = true;
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  if (!!(process.env.NODE_ENV !== "production")) {
    accessedAttrs = false;
  }
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = !!(process.env.NODE_ENV !== "production") && setupState.__isScriptSetup ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render.call(
          thisProxy,
          proxyToUse,
          renderCache,
          !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render2 = Component;
      if (!!(process.env.NODE_ENV !== "production") && attrs === props) {
        markAttrsAccessed();
      }
      result = normalizeVNode(
        render2.length > 1 ? render2(
          !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(props) : props,
          !!(process.env.NODE_ENV !== "production") ? {
            get attrs() {
              markAttrsAccessed();
              return /* @__PURE__ */ shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render2(
          !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  let setRoot = void 0;
  if (!!(process.env.NODE_ENV !== "production") && result.patchFlag > 0 && result.patchFlag & 2048) {
    [root, setRoot] = getChildRoot(result);
  }
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      } else if (!!(process.env.NODE_ENV !== "production") && !accessedAttrs && root.type !== Comment) {
        const allAttrs = Object.keys(attrs);
        const eventAttrs = [];
        const extraAttrs = [];
        for (let i = 0, l = allAttrs.length; i < l; i++) {
          const key = allAttrs[i];
          if (isOn(key)) {
            if (!isModelListener(key)) {
              eventAttrs.push(key[2].toLowerCase() + key.slice(3));
            }
          } else {
            extraAttrs.push(key);
          }
        }
        if (extraAttrs.length) {
          warn$1(
            `Extraneous non-props attributes (${extraAttrs.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text or teleport root nodes.`
          );
        }
        if (eventAttrs.length) {
          warn$1(
            `Extraneous non-emits event listeners (${eventAttrs.join(", ")}) were passed to component but could not be automatically inherited because component renders fragment or text root nodes. If the listener is intended to be a component custom event listener only, declare it using the "emits" option.`
          );
        }
      }
    }
  }
  if (vnode.dirs) {
    if (!!(process.env.NODE_ENV !== "production") && !isElementRoot(root)) {
      warn$1(
        `Runtime directive used on component with non-element root node. The directives will not function as intended.`
      );
    }
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    if (!!(process.env.NODE_ENV !== "production") && !isElementRoot(root)) {
      warn$1(
        `Component inside <Transition> renders non-element root node that cannot be animated.`
      );
    }
    setTransitionHooks(root, vnode.transition);
  }
  if (!!(process.env.NODE_ENV !== "production") && setRoot) {
    setRoot(root);
  } else {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
const getChildRoot = (vnode) => {
  const rawChildren = vnode.children;
  const dynamicChildren = vnode.dynamicChildren;
  const childRoot = filterSingleRoot(rawChildren, false);
  if (!childRoot) {
    return [vnode, void 0];
  } else if (!!(process.env.NODE_ENV !== "production") && childRoot.patchFlag > 0 && childRoot.patchFlag & 2048) {
    return getChildRoot(childRoot);
  }
  const index = rawChildren.indexOf(childRoot);
  const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : -1;
  const setRoot = (updatedRoot) => {
    rawChildren[index] = updatedRoot;
    if (dynamicChildren) {
      if (dynamicIndex > -1) {
        dynamicChildren[dynamicIndex] = updatedRoot;
      } else if (updatedRoot.patchFlag > 0) {
        vnode.dynamicChildren = [...dynamicChildren, updatedRoot];
      }
    }
  };
  return [normalizeVNode(childRoot), setRoot];
};
function filterSingleRoot(children, recurse = true) {
  let singleRoot;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isVNode(child)) {
      if (child.type !== Comment || child.children === "v-if") {
        if (singleRoot) {
          return;
        } else {
          singleRoot = child;
          if (!!(process.env.NODE_ENV !== "production") && recurse && singleRoot.patchFlag > 0 && singleRoot.patchFlag & 2048) {
            return filterSingleRoot(singleRoot.children);
          }
        }
      }
    } else {
      return;
    }
  }
  return singleRoot;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
const isElementRoot = (vnode) => {
  return vnode.shapeFlag & (6 | 1) || vnode.type === Comment;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (!!(process.env.NODE_ENV !== "production") && (prevChildren || nextChildren) && isHmrUpdating) {
    return true;
  }
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject(nextProp) && isObject(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (!!(process.env.NODE_ENV !== "production")) {
    validateProps(rawProps || {}, props, instance);
  }
  if (isStateful) {
    instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function isInHmrContext(instance) {
  while (instance) {
    if (instance.type.__hmrId) return true;
    instance = instance.parent;
  }
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = /* @__PURE__ */ toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    !(!!(process.env.NODE_ENV !== "production") && isInHmrContext(instance)) && (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
  if (!!(process.env.NODE_ENV !== "production")) {
    validateProps(rawProps || {}, props, instance);
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = /* @__PURE__ */ toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (!!(process.env.NODE_ENV !== "production") && !isString(raw[i])) {
        warn$1(`props must be strings when using array syntax.`, raw[i]);
      }
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    if (!!(process.env.NODE_ENV !== "production") && !isObject(raw)) {
      warn$1(`invalid props options`, raw);
    }
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index];
            const typeName = isFunction(type) && type.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  } else if (!!(process.env.NODE_ENV !== "production")) {
    warn$1(`Invalid prop name: "${key}" is a reserved property.`);
  }
  return false;
}
function getType(ctor) {
  if (ctor === null) {
    return "null";
  }
  if (typeof ctor === "function") {
    return ctor.name || "";
  } else if (typeof ctor === "object") {
    const name = ctor.constructor && ctor.constructor.name;
    return name || "";
  }
  return "";
}
function validateProps(rawProps, props, instance) {
  const resolvedValues = /* @__PURE__ */ toRaw(props);
  const options = instance.propsOptions[0];
  const camelizePropsKey = Object.keys(rawProps).map((key) => camelize(key));
  for (const key in options) {
    let opt = options[key];
    if (opt == null) continue;
    validateProp(
      key,
      resolvedValues[key],
      opt,
      !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(resolvedValues) : resolvedValues,
      !camelizePropsKey.includes(key)
    );
  }
}
function validateProp(name, value, prop, props, isAbsent) {
  const { type, required, validator, skipCheck } = prop;
  if (required && isAbsent) {
    warn$1('Missing required prop: "' + name + '"');
    return;
  }
  if (value == null && !required) {
    return;
  }
  if (type != null && type !== true && !skipCheck) {
    let isValid = false;
    const types = isArray(type) ? type : [type];
    const expectedTypes = [];
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i]);
      expectedTypes.push(expectedType || "");
      isValid = valid;
    }
    if (!isValid) {
      warn$1(getInvalidTypeMessage(name, value, expectedTypes));
      return;
    }
  }
  if (validator && !validator(value, props)) {
    warn$1('Invalid prop: custom validator check failed for prop "' + name + '".');
  }
}
const isSimpleType = /* @__PURE__ */ makeMap(
  "String,Number,Boolean,Function,Symbol,BigInt"
);
function assertType(value, type) {
  let valid;
  const expectedType = getType(type);
  if (expectedType === "null") {
    valid = value === null;
  } else if (isSimpleType(expectedType)) {
    const t = typeof value;
    valid = t === expectedType.toLowerCase();
    if (!valid && t === "object") {
      valid = value instanceof type;
    }
  } else if (expectedType === "Object") {
    valid = isObject(value);
  } else if (expectedType === "Array") {
    valid = isArray(value);
  } else {
    valid = value instanceof type;
  }
  return {
    valid,
    expectedType
  };
}
function getInvalidTypeMessage(name, value, expectedTypes) {
  if (expectedTypes.length === 0) {
    return `Prop type [] for prop "${name}" won't match anything. Did you mean to use type Array instead?`;
  }
  let message = `Invalid prop: type check failed for prop "${name}". Expected ${expectedTypes.map(capitalize).join(" | ")}`;
  const expectedType = expectedTypes[0];
  const receivedType = toRawType(value);
  const expectedValue = styleValue(value, expectedType);
  const receivedValue = styleValue(value, receivedType);
  if (expectedTypes.length === 1 && isExplicable(expectedType) && !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`;
  }
  message += `, got ${receivedType} `;
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`;
  }
  return message;
}
function styleValue(value, type) {
  if (type === "String") {
    return `"${value}"`;
  } else if (type === "Number") {
    return `${Number(value)}`;
  } else {
    return `${value}`;
  }
}
function isExplicable(type) {
  const explicitTypes = ["string", "number", "boolean"];
  return explicitTypes.some((elem) => type.toLowerCase() === elem);
}
function isBoolean(...args) {
  return args.some((elem) => elem.toLowerCase() === "boolean");
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (!!(process.env.NODE_ENV !== "production") && currentInstance && !(ctx === null && currentRenderingInstance) && !(ctx && ctx.root !== currentInstance.root)) {
      warn$1(
        `Slot "${key}" invoked outside of the render function: this will not track dependencies used in the slot. Invoke the slot function inside the render function instead.`
      );
    }
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx);
    } else if (value != null) {
      if (!!(process.env.NODE_ENV !== "production") && true) {
        warn$1(
          `Non-function value encountered for slot "${key}". Prefer function slots for better performance.`
        );
      }
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  if (!!(process.env.NODE_ENV !== "production") && !isKeepAlive(instance.vnode) && true) {
    warn$1(
      `Non-function value encountered for default slot. Prefer function slots for better performance.`
    );
  }
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (!!(process.env.NODE_ENV !== "production") && isHmrUpdating) {
        assignSlots(slots, children, optimized);
        trigger(instance, "set", "$slots");
      } else if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
let supported;
let perf;
function startMeasure(instance, type) {
  if (instance.appContext.config.performance && isSupported()) {
    perf.mark(`vue-${type}-${instance.uid}`);
  }
  if (!!(process.env.NODE_ENV !== "production") || false) {
    devtoolsPerfStart(instance, type, isSupported() ? perf.now() : Date.now());
  }
}
function endMeasure(instance, type) {
  if (instance.appContext.config.performance && isSupported()) {
    const startTag = `vue-${type}-${instance.uid}`;
    const endTag = startTag + `:end`;
    const measureName = `<${formatComponentName(instance, instance.type)}> ${type}`;
    perf.mark(endTag);
    perf.measure(measureName, startTag, endTag);
    perf.clearMeasures(measureName);
    perf.clearMarks(startTag);
    perf.clearMarks(endTag);
  }
  if (!!(process.env.NODE_ENV !== "production") || false) {
    devtoolsPerfEnd(instance, type, isSupported() ? perf.now() : Date.now());
  }
}
function isSupported() {
  if (supported !== void 0) {
    return supported;
  }
  if (typeof window !== "undefined" && window.performance) {
    supported = true;
    perf = window.performance;
  } else {
    supported = false;
  }
  return supported;
}
function initFeatureFlags() {
  const needWarn = [];
  if (!!(process.env.NODE_ENV !== "production") && needWarn.length) {
    const multi = needWarn.length > 1;
    console.warn(
      `Feature flag${multi ? `s` : ``} ${needWarn.join(", ")} ${multi ? `are` : `is`} not explicitly defined. You are running the esm-bundler build of Vue, which expects these compile-time feature flags to be globally injected via the bundler config in order to get better tree-shaking in the production bundle.

For more details, see https://link.vuejs.org/feature-flags.`
    );
  }
}
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function baseCreateRenderer(options, createHydrationFns) {
  {
    initFeatureFlags();
  }
  const target = getGlobalThis();
  target.__VUE__ = true;
  if (!!(process.env.NODE_ENV !== "production") || false) {
    setDevtoolsHook$1(target.__VUE_DEVTOOLS_GLOBAL_HOOK__, target);
  }
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!(process.env.NODE_ENV !== "production") && isHmrUpdating ? false : !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        } else if (!!(process.env.NODE_ENV !== "production")) {
          patchStaticNode(n1, n2, container, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (!!(process.env.NODE_ENV !== "production")) {
          warn$1("Invalid VNode type:", type, `(${typeof type})`);
        }
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const patchStaticNode = (n1, n2, container, namespace) => {
    if (n2.children !== n1.children) {
      const anchor = hostNextSibling(n1.anchor);
      removeStaticNode(n1);
      [n2.el, n2.anchor] = hostInsertStaticContent(
        n2.children,
        container,
        anchor,
        namespace
      );
    } else {
      n2.el = n1.el;
      n2.anchor = n1.anchor;
    }
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling2) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling2);
      el = next;
    }
    hostInsert(anchor, container, nextSibling2);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (!!(process.env.NODE_ENV !== "production") || false) {
      def(el, "__vnode", vnode, true);
      def(el, "__vueParentComponent", parentComponent, true);
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      const isHmr = !!(process.env.NODE_ENV !== "production") && isHmrUpdating;
      queuePostRenderEffect(() => {
        let prev;
        if (!!(process.env.NODE_ENV !== "production")) prev = setHmrUpdating(isHmr);
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
          if (!!(process.env.NODE_ENV !== "production")) setHmrUpdating(prev);
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (!!(process.env.NODE_ENV !== "production") && subTree.patchFlag > 0 && subTree.patchFlag & 2048) {
        subTree = filterSingleRoot(subTree.children) || subTree;
      }
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    if (!!(process.env.NODE_ENV !== "production") || false) {
      el.__vnode = n2;
    }
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (!!(process.env.NODE_ENV !== "production") && isHmrUpdating) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
      if (!!(process.env.NODE_ENV !== "production")) {
        traverseStaticChildren(n1, n2);
      }
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (!!(process.env.NODE_ENV !== "production") && // #5523 dev root fragment may inherit directives
    (isHmrUpdating || patchFlag & 2048)) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (!!(process.env.NODE_ENV !== "production")) {
          traverseStaticChildren(n1, n2);
        } else if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (!!(process.env.NODE_ENV !== "production") && instance.type.__hmrId) {
      registerHMR(instance);
    }
    if (!!(process.env.NODE_ENV !== "production")) {
      pushWarningContext(initialVNode);
      startMeasure(instance, `mount`);
    }
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      if (!!(process.env.NODE_ENV !== "production")) {
        startMeasure(instance, `init`);
      }
      setupComponent(instance, false, optimized);
      if (!!(process.env.NODE_ENV !== "production")) {
        endMeasure(instance, `init`);
      }
    }
    if (!!(process.env.NODE_ENV !== "production") && isHmrUpdating) initialVNode.el = null;
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
    if (!!(process.env.NODE_ENV !== "production")) {
      popWarningContext();
      endMeasure(instance, `mount`);
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        if (!!(process.env.NODE_ENV !== "production")) {
          pushWarningContext(n2);
        }
        updateComponentPreRender(instance, n2, optimized);
        if (!!(process.env.NODE_ENV !== "production")) {
          popWarningContext();
        }
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          if (!!(process.env.NODE_ENV !== "production")) {
            startMeasure(instance, `render`);
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          if (!!(process.env.NODE_ENV !== "production")) {
            endMeasure(instance, `render`);
          }
          if (!!(process.env.NODE_ENV !== "production")) {
            startMeasure(instance, `patch`);
          }
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          if (!!(process.env.NODE_ENV !== "production")) {
            endMeasure(instance, `patch`);
          }
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        if (!!(process.env.NODE_ENV !== "production") || false) {
          devtoolsComponentAdded(instance);
        }
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              queuePostRenderEffect(() => {
                if (!instance.isUnmounted) update();
              }, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        if (!!(process.env.NODE_ENV !== "production")) {
          pushWarningContext(next || instance.vnode);
        }
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        if (!!(process.env.NODE_ENV !== "production")) {
          startMeasure(instance, `render`);
        }
        const nextTree = renderComponentRoot(instance);
        if (!!(process.env.NODE_ENV !== "production")) {
          endMeasure(instance, `render`);
        }
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        if (!!(process.env.NODE_ENV !== "production")) {
          startMeasure(instance, `patch`);
        }
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        if (!!(process.env.NODE_ENV !== "production")) {
          endMeasure(instance, `patch`);
        }
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
        if (!!(process.env.NODE_ENV !== "production") || false) {
          devtoolsComponentUpdated(instance);
        }
        if (!!(process.env.NODE_ENV !== "production")) {
          popWarningContext();
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    if (!!(process.env.NODE_ENV !== "production")) {
      effect2.onTrack = instance.rtc ? (e) => invokeArrayFns(instance.rtc, e) : void 0;
      effect2.onTrigger = instance.rtg ? (e) => invokeArrayFns(instance.rtg, e) : void 0;
    }
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          if (!!(process.env.NODE_ENV !== "production") && keyToNewIndexMap.has(nextChild.key)) {
            warn$1(
              `Duplicate keys found during update:`,
              JSON.stringify(nextChild.key),
              `Make sure keys are unique.`
            );
          }
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        transition.beforeEnter(el);
        hostInsert(el, container, anchor);
        queuePostRenderEffect(() => transition.enter(el), parentSuspense);
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          leave(el, () => {
            remove22();
            afterLeave && afterLeave();
          });
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    if (type === Fragment) {
      if (!!(process.env.NODE_ENV !== "production") && vnode.patchFlag > 0 && vnode.patchFlag & 2048 && transition && !transition.persisted) {
        vnode.children.forEach((child) => {
          if (child.type === Comment) {
            hostRemove(child.el);
          } else {
            remove2(child);
          }
        });
      } else {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    if (!!(process.env.NODE_ENV !== "production") && instance.type.__hmrId) {
      unregisterHMR(instance);
    }
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
    if (!!(process.env.NODE_ENV !== "production") || false) {
      devtoolsComponentRemoved(instance);
    }
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render = (vnode, container, namespace) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate;
  return {
    render,
    hydrate,
    createApp: createAppAPI(render)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray(ch1) && isArray(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
      if (!!(process.env.NODE_ENV !== "production")) {
        c2.el && (c2.el.__vnode = c2);
      }
    }
  }
}
function getSequence(arr) {
  const p = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  if (!!(process.env.NODE_ENV !== "production") && n2.shapeFlag & 6 && n1.component) {
    const dirtyInstances = hmrDirtyComponents.get(n2.type);
    if (dirtyInstances && dirtyInstances.has(n1.component)) {
      n1.shapeFlag &= -257;
      n2.shapeFlag &= -513;
      return false;
    }
  }
  return n1.type === n2.type && n1.key === n2.key;
}
const createVNodeWithArgsTransform = (...args) => {
  return _createVNode(
    ...args
  );
};
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || /* @__PURE__ */ isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (!!(process.env.NODE_ENV !== "production") && vnode.key !== vnode.key) {
    warn$1(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = !!(process.env.NODE_ENV !== "production") ? createVNodeWithArgsTransform : _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (!!(process.env.NODE_ENV !== "production") && !type) {
      warn$1(`Invalid vnode type when creating vnode: ${type}.`);
    }
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject(style)) {
      if (/* @__PURE__ */ isProxy(style) && !isArray(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
  if (!!(process.env.NODE_ENV !== "production") && shapeFlag & 4 && /* @__PURE__ */ isProxy(type)) {
    type = /* @__PURE__ */ toRaw(type);
    warn$1(
      `Vue received a Component that was made a reactive object. This can lead to unnecessary performance overhead and should be avoided by marking the component with \`markRaw\` or using \`shallowRef\` instead of \`ref\`.`,
      `
Component that was made reactive: `,
      type
    );
  }
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children: !!(process.env.NODE_ENV !== "production") && patchFlag === -1 && isArray(children) ? children.map(deepCloneVNode) : children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function deepCloneVNode(vnode) {
  const cloned = cloneVNode(vnode);
  if (isArray(vnode.children)) {
    cloned.children = vnode.children.map(deepCloneVNode);
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  if (!!(process.env.NODE_ENV !== "production")) {
    instance.ctx = createDevRenderContext(instance);
  } else {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set) => set(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
const isBuiltInTag = /* @__PURE__ */ makeMap("slot,component");
function validateComponentName(name, { isNativeTag }) {
  if (isBuiltInTag(name) || isNativeTag(name)) {
    warn$1(
      "Do not use built-in or reserved HTML elements as component id: " + name
    );
  }
}
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  if (!!(process.env.NODE_ENV !== "production")) {
    if (Component.name) {
      validateComponentName(Component.name, instance.appContext.config);
    }
    if (Component.components) {
      const names = Object.keys(Component.components);
      for (let i = 0; i < names.length; i++) {
        validateComponentName(names[i], instance.appContext.config);
      }
    }
    if (Component.directives) {
      const names = Object.keys(Component.directives);
      for (let i = 0; i < names.length; i++) {
        validateDirectiveName(names[i]);
      }
    }
    if (Component.compilerOptions && isRuntimeOnly()) {
      warn$1(
        `"compilerOptions" is only supported when using a build of Vue that includes the runtime compiler. Since you are using a runtime-only build, the options should be passed via your build tool config instead.`
      );
    }
  }
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  if (!!(process.env.NODE_ENV !== "production")) {
    exposePropsOnRenderContext(instance);
  }
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        !!(process.env.NODE_ENV !== "production") ? /* @__PURE__ */ shallowReadonly(instance.props) : instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          handleSetupResult(instance, resolvedResult, isSSR);
        }).catch((e) => {
          handleError(e, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
        if (!!(process.env.NODE_ENV !== "production") && !instance.suspense) {
          const name = formatComponentName(instance, Component);
          warn$1(
            `Component <${name}>: setup function returned a promise, but no <Suspense> boundary was found in the parent component tree. A component with async setup() must be nested in a <Suspense> in order to be rendered.`
          );
        }
      }
    } else {
      handleSetupResult(instance, setupResult, isSSR);
    }
  } else {
    finishComponentSetup(instance, isSSR);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject(setupResult)) {
    if (!!(process.env.NODE_ENV !== "production") && isVNode(setupResult)) {
      warn$1(
        `setup() should not return VNodes directly - return a render function instead.`
      );
    }
    if (!!(process.env.NODE_ENV !== "production") || false) {
      instance.devtoolsRawSetupState = setupResult;
    }
    instance.setupState = proxyRefs(setupResult);
    if (!!(process.env.NODE_ENV !== "production")) {
      exposeSetupStateOnRenderContext(instance);
    }
  } else if (!!(process.env.NODE_ENV !== "production") && setupResult !== void 0) {
    warn$1(
      `setup() should return an object. Received: ${setupResult === null ? "null" : typeof setupResult}`
    );
  }
  finishComponentSetup(instance, isSSR);
}
const isRuntimeOnly = () => true;
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    instance.render = Component.render || NOOP;
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
  if (!!(process.env.NODE_ENV !== "production") && !Component.render && instance.render === NOOP && !isSSR) {
    if (Component.template) {
      warn$1(
        `Component provided template option but runtime compilation is not supported in this build of Vue. Configure your bundler to alias "vue" to "vue/dist/vue.esm-bundler.js".`
      );
    } else {
      warn$1(`Component is missing template or render function: `, Component);
    }
  }
}
const attrsProxyHandlers = !!(process.env.NODE_ENV !== "production") ? {
  get(target, key) {
    markAttrsAccessed();
    track(target, "get", "");
    return target[key];
  },
  set() {
    warn$1(`setupContext.attrs is readonly.`);
    return false;
  },
  deleteProperty() {
    warn$1(`setupContext.attrs is readonly.`);
    return false;
  }
} : {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function getSlotsProxy(instance) {
  return new Proxy(instance.slots, {
    get(target, key) {
      track(instance, "get", "$slots");
      return target[key];
    }
  });
}
function createSetupContext(instance) {
  const expose = (exposed) => {
    if (!!(process.env.NODE_ENV !== "production")) {
      if (instance.exposed) {
        warn$1(`expose() should be called only once per setup().`);
      }
      if (exposed != null) {
        let exposedType = typeof exposed;
        if (exposedType === "object") {
          if (isArray(exposed)) {
            exposedType = "array";
          } else if (/* @__PURE__ */ isRef(exposed)) {
            exposedType = "ref";
          }
        }
        if (exposedType !== "object") {
          warn$1(
            `expose() should be passed a plain object, received ${exposedType}.`
          );
        }
      }
    }
    instance.exposed = exposed || {};
  };
  if (!!(process.env.NODE_ENV !== "production")) {
    let attrsProxy;
    let slotsProxy;
    return Object.freeze({
      get attrs() {
        return attrsProxy || (attrsProxy = new Proxy(instance.attrs, attrsProxyHandlers));
      },
      get slots() {
        return slotsProxy || (slotsProxy = getSlotsProxy(instance));
      },
      get emit() {
        return (event, ...args) => instance.emit(event, ...args);
      },
      expose
    });
  } else {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  if (!!(process.env.NODE_ENV !== "production")) {
    const i = getCurrentInstance();
    if (i && i.appContext.config.warnRecursiveComputed) {
      c._warnRecursive = true;
    }
  }
  return c;
};
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l = arguments.length;
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren]);
        }
        return createVNode(type, propsOrChildren);
      } else {
        return createVNode(type, null, propsOrChildren);
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
function initCustomFormatter() {
  if (!!!(process.env.NODE_ENV !== "production") || typeof window === "undefined") {
    return;
  }
  const vueStyle = { style: "color:#3ba776" };
  const numberStyle = { style: "color:#1677ff" };
  const stringStyle = { style: "color:#f5222d" };
  const keywordStyle = { style: "color:#eb2f96" };
  const formatter = {
    __vue_custom_formatter: true,
    header(obj) {
      if (!isObject(obj)) {
        return null;
      }
      if (obj.__isVue) {
        return ["div", vueStyle, `VueInstance`];
      } else if (/* @__PURE__ */ isRef(obj)) {
        pauseTracking();
        const value = obj.value;
        resetTracking();
        return [
          "div",
          {},
          ["span", vueStyle, genRefFlag(obj)],
          "<",
          formatValue(value),
          `>`
        ];
      } else if (/* @__PURE__ */ isReactive(obj)) {
        return [
          "div",
          {},
          ["span", vueStyle, /* @__PURE__ */ isShallow(obj) ? "ShallowReactive" : "Reactive"],
          "<",
          formatValue(obj),
          `>${/* @__PURE__ */ isReadonly(obj) ? ` (readonly)` : ``}`
        ];
      } else if (/* @__PURE__ */ isReadonly(obj)) {
        return [
          "div",
          {},
          ["span", vueStyle, /* @__PURE__ */ isShallow(obj) ? "ShallowReadonly" : "Readonly"],
          "<",
          formatValue(obj),
          ">"
        ];
      }
      return null;
    },
    hasBody(obj) {
      return obj && obj.__isVue;
    },
    body(obj) {
      if (obj && obj.__isVue) {
        return [
          "div",
          {},
          ...formatInstance(obj.$)
        ];
      }
    }
  };
  function formatInstance(instance) {
    const blocks = [];
    if (instance.type.props && instance.props) {
      blocks.push(createInstanceBlock("props", /* @__PURE__ */ toRaw(instance.props)));
    }
    if (instance.setupState !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock("setup", instance.setupState));
    }
    if (instance.data !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock("data", /* @__PURE__ */ toRaw(instance.data)));
    }
    const computed2 = extractKeys(instance, "computed");
    if (computed2) {
      blocks.push(createInstanceBlock("computed", computed2));
    }
    const injected = extractKeys(instance, "inject");
    if (injected) {
      blocks.push(createInstanceBlock("injected", injected));
    }
    blocks.push([
      "div",
      {},
      [
        "span",
        {
          style: keywordStyle.style + ";opacity:0.66"
        },
        "$ (internal): "
      ],
      ["object", { object: instance }]
    ]);
    return blocks;
  }
  function createInstanceBlock(type, target) {
    target = extend({}, target);
    if (!Object.keys(target).length) {
      return ["span", {}];
    }
    return [
      "div",
      { style: "line-height:1.25em;margin-bottom:0.6em" },
      [
        "div",
        {
          style: "color:#476582"
        },
        type
      ],
      [
        "div",
        {
          style: "padding-left:1.25em"
        },
        ...Object.keys(target).map((key) => {
          return [
            "div",
            {},
            ["span", keywordStyle, key + ": "],
            formatValue(target[key], false)
          ];
        })
      ]
    ];
  }
  function formatValue(v, asRaw = true) {
    if (typeof v === "number") {
      return ["span", numberStyle, v];
    } else if (typeof v === "string") {
      return ["span", stringStyle, JSON.stringify(v)];
    } else if (typeof v === "boolean") {
      return ["span", keywordStyle, v];
    } else if (isObject(v)) {
      return ["object", { object: asRaw ? /* @__PURE__ */ toRaw(v) : v }];
    } else {
      return ["span", stringStyle, String(v)];
    }
  }
  function extractKeys(instance, type) {
    const Comp = instance.type;
    if (isFunction(Comp)) {
      return;
    }
    const extracted = {};
    for (const key in instance.ctx) {
      if (isKeyOfType(Comp, key, type)) {
        extracted[key] = instance.ctx[key];
      }
    }
    return extracted;
  }
  function isKeyOfType(Comp, key, type) {
    const opts = Comp[type];
    if (isArray(opts) && opts.includes(key) || isObject(opts) && key in opts) {
      return true;
    }
    if (Comp.extends && isKeyOfType(Comp.extends, key, type)) {
      return true;
    }
    if (Comp.mixins && Comp.mixins.some((m) => isKeyOfType(m, key, type))) {
      return true;
    }
  }
  function genRefFlag(v) {
    if (/* @__PURE__ */ isShallow(v)) {
      return `ShallowRef`;
    }
    if (v.effect) {
      return `ComputedRef`;
    }
    return `Ref`;
  }
  if (window.devtoolsFormatters) {
    window.devtoolsFormatters.push(formatter);
  } else {
    window.devtoolsFormatters = [formatter];
  }
}
const version = "3.5.33";
const warn = !!(process.env.NODE_ENV !== "production") ? warn$1 : NOOP;
!!(process.env.NODE_ENV !== "production") || true ? devtools$1 : void 0;
!!(process.env.NODE_ENV !== "production") || true ? setDevtoolsHook$1 : NOOP;
/**
* vue v3.5.33
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
function initDev() {
  {
    initCustomFormatter();
  }
}
if (!!(process.env.NODE_ENV !== "production")) {
  initDev();
}
function createElement(type) {
  const el = {
    type,
    parent: null,
    children: [],
    props: {},
    style: {}
  };
  el.setAttribute = (key, value) => {
    el.props[key] = value;
  };
  el.removeAttribute = (key) => {
    delete el.props[key];
  };
  return el;
}
function insert(child, parent, anchor) {
  child.parent = parent;
  const list = parent.children;
  if (!anchor) {
    list.push(child);
    return;
  }
  const idx = list.indexOf(anchor);
  if (idx < 0) {
    list.push(child);
    return;
  }
  list.splice(idx, 0, child);
}
function remove(child) {
  const parent = child.parent;
  if (!parent) return;
  const list = parent.children;
  const idx = list.indexOf(child);
  if (idx >= 0) list.splice(idx, 1);
  child.parent = null;
}
function parentNode(node) {
  return node.parent;
}
function nextSibling(node) {
  const parent = node.parent;
  if (!parent) return null;
  const idx = parent.children.indexOf(node);
  if (idx < 0) return null;
  return parent.children[idx + 1] ?? null;
}
function setElementText(el, text) {
  el.textContent = text;
  el.children = [];
}
function createText(text) {
  return { type: "text", parent: null, text };
}
function setText(node, text) {
  node.text = text;
}
function createComment(text) {
  return { type: "comment", parent: null, text };
}
function patchProp(el, key, _prevValue, nextValue) {
  if (key === "style" && nextValue && typeof nextValue === "object") {
    Object.assign(el.style, nextValue);
    return;
  }
  if (key === "class") {
    el.className = typeof nextValue === "string" ? nextValue : "";
    return;
  }
  el.props[key] = nextValue;
}
const rendererOptions = {
  patchProp,
  insert,
  remove,
  createElement,
  createText,
  createComment,
  setText,
  setElementText,
  parentNode,
  nextSibling
};
const renderer = createRenderer(rendererOptions);
function createHeadlessApp(...args) {
  return renderer.createApp(...args);
}
function createHeadlessRoot() {
  return { children: [] };
}
function contains(rect, x, y) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}
function containsRect(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}
function area(rect) {
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}
function sameRect$1(a, b) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
function isVisible(node) {
  return node.visible !== false;
}
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function rectRowRange(rect) {
  const y0 = Math.floor(rect.y);
  const y1 = Math.ceil(rect.y + rect.h) - 1;
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return null;
  if (y1 < y0) return null;
  return { y0, y1 };
}
const SUPPRESS_TERMINAL_POINTER_UP$1 = "__vueTuiSuppressTerminalPointerUp";
let nextId = 0;
function createCliEventManager(options) {
  const nodes = /* @__PURE__ */ new Map();
  const rowBuckets = /* @__PURE__ */ new Map();
  const rowRangeById = /* @__PURE__ */ new Map();
  let focusedId = null;
  let capturedId = null;
  let hoverPath = [];
  const record = options?.record;
  const onFocusChange = options?.onFocusChange;
  const latency = getCliLatencyProfiler();
  const MODAL_FOCUS_Z_THRESHOLD = 100;
  const MODAL_ROOT_MIN_AREA = 40;
  function focusLockTarget() {
    let bestRoot = null;
    let bestAny = null;
    for (const n of nodes.values()) {
      if (!n.focusable || !isVisible(n)) continue;
      const z = n.zIndex ?? 0;
      if (z < MODAL_FOCUS_Z_THRESHOLD) continue;
      const a = area(n.rect);
      if (!bestAny || z > bestAny.zIndex || z === bestAny.zIndex && a > bestAny.area) {
        bestAny = { id: n.id, zIndex: z, area: a };
      }
      if (a >= MODAL_ROOT_MIN_AREA && (!bestRoot || z > bestRoot.zIndex || z === bestRoot.zIndex && a > bestRoot.area)) {
        bestRoot = { id: n.id, zIndex: z, area: a };
      }
    }
    const best = bestRoot ?? bestAny;
    return best ? { id: best.id, zIndex: best.zIndex } : null;
  }
  function resolveLockedFocusTarget(type) {
    const lock = focusLockTarget();
    let target = focusedId ? nodes.get(focusedId) ?? null : null;
    const shouldRetarget = lock && (!target || !isVisible(target) || (target.zIndex ?? 0) < lock.zIndex);
    if (!shouldRetarget || !lock) return target;
    let best = null;
    let bestScore = -Infinity;
    for (const node of nodes.values()) {
      if (!node.focusable || !isVisible(node)) continue;
      const z = node.zIndex ?? 0;
      if (z < lock.zIndex) continue;
      const handlers = node.handlers ?? {};
      const canHandle = type ? typeof handlers[type] === "function" : false;
      const a = area(node.rect);
      const score = z * 1e9 + (canHandle ? 1e6 : 0) - a;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    if (best) {
      setFocus(best.id);
      target = best;
    }
    return target;
  }
  function removeFromRowBuckets(id) {
    const prev = rowRangeById.get(id);
    if (!prev) return;
    for (let y = prev.y0; y <= prev.y1; y++) {
      const bucket = rowBuckets.get(y);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) rowBuckets.delete(y);
    }
    rowRangeById.delete(id);
  }
  function addToRowBuckets(id, node) {
    if (!isVisible(node)) return;
    const range = rectRowRange(node.rect);
    if (!range) return;
    rowRangeById.set(id, range);
    for (let y = range.y0; y <= range.y1; y++) {
      let bucket = rowBuckets.get(y);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Set();
        rowBuckets.set(y, bucket);
      }
      bucket.add(id);
    }
  }
  function updateRowBuckets(id, node) {
    if (!isVisible(node)) {
      removeFromRowBuckets(id);
      return;
    }
    const next = rectRowRange(node.rect);
    const prev = rowRangeById.get(id);
    if (!next) {
      removeFromRowBuckets(id);
      return;
    }
    if (prev && prev.y0 === next.y0 && prev.y1 === next.y1) return;
    removeFromRowBuckets(id);
    rowRangeById.set(id, next);
    for (let y = next.y0; y <= next.y1; y++) {
      let bucket = rowBuckets.get(y);
      if (!bucket) {
        bucket = /* @__PURE__ */ new Set();
        rowBuckets.set(y, bucket);
      }
      bucket.add(id);
    }
  }
  function candidatesAt(cellX, cellY) {
    const list = [];
    const bucket = rowBuckets.get(cellY);
    if (!bucket) return list;
    for (const id of bucket) {
      const node = nodes.get(id);
      if (!node) continue;
      if (!isVisible(node)) continue;
      if (contains(node.rect, cellX, cellY)) list.push(node);
    }
    return list.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
  }
  function pickTarget(list) {
    if (list.length === 0) return null;
    let target = list[0];
    for (const n of list) {
      if (n.zIndex > target.zIndex) target = n;
      else if (n.zIndex === target.zIndex && area(n.rect) <= area(target.rect)) target = n;
    }
    return target;
  }
  function pathOuterToInner(list, target) {
    if (!target) return [];
    const filtered = list.filter(
      (n) => n.id !== target.id && (!n.focusable || !target.focusable || n.zIndex !== target.zIndex || !sameRect$1(n.rect, target.rect))
    );
    return [...filtered, target];
  }
  function ancestorsForTarget(target) {
    const range = rectRowRange(target.rect);
    const seedBucket = range ? rowBuckets.get(range.y0) : null;
    if (!seedBucket) {
      const list2 = [];
      for (const node of nodes.values()) {
        if (!isVisible(node)) continue;
        if (containsRect(node.rect, target.rect)) list2.push(node);
      }
      const sorted2 = list2.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
      return pathOuterToInner(sorted2, target);
    }
    const list = [];
    for (const id of seedBucket) {
      const node = nodes.get(id);
      if (!node) continue;
      if (!isVisible(node)) continue;
      if (containsRect(node.rect, target.rect)) list.push(node);
    }
    const sorted = list.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
    return pathOuterToInner(sorted, target);
  }
  function makeBaseEvent(type, path, time) {
    return {
      type,
      target: null,
      currentTarget: null,
      eventPhase: 2,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      timeStamp: typeof time === "number" ? time : now(),
      __stopped: false,
      stopPropagation() {
        this.__stopped = true;
      },
      preventDefault() {
        this.defaultPrevented = true;
      },
      composedPath() {
        return [...path].reverse();
      }
    };
  }
  function dispatchToNode(handlerKey, node, event) {
    event.currentTarget = node;
    if (!node) return;
    const handler = node.handlers[handlerKey];
    if (handler) {
      try {
        handler(event);
      } catch (err) {
        try {
          const env = process$1?.env;
          if (env?.DIMCODE_DEBUG === "1") {
            const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
            appendFileSync(
              "/tmp/goatchain-debug.log",
              `[${timestamp}] [EVENT-MGR] ERROR in handler ${node.id}.${handlerKey}: ${err}
`
            );
          }
        } catch {
        }
      }
    }
  }
  function dispatchWithPhases(type, path, target, event) {
    event.target = target;
    const captureKey = `${type}Capture`;
    event.eventPhase = 1;
    for (const node of path) {
      dispatchToNode(captureKey, node, event);
      if (event.__stopped) return;
    }
    if (target) {
      event.eventPhase = 2;
      dispatchToNode(type, target, event);
      if (event.__stopped) return;
    }
    if (!event.bubbles) return;
    event.eventPhase = 3;
    for (let i = path.length - 2; i >= 0; i--) {
      dispatchToNode(type, path[i], event);
      if (event.__stopped) return;
    }
  }
  function sharedPrefixLenById(a, b) {
    const min = Math.min(a.length, b.length);
    let i = 0;
    for (; i < min; i++) {
      if (a[i].id !== b[i].id) break;
    }
    return i;
  }
  function updateHover(nextTarget, record2) {
    const nextPath = nextTarget ? ancestorsForTarget(nextTarget) : [];
    const shared = sharedPrefixLenById(hoverPath, nextPath);
    for (let i = hoverPath.length - 1; i >= shared; i--) {
      const target = hoverPath[i] ?? null;
      if (!target) continue;
      const path = hoverPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerleave", path, record2);
      ev.bubbles = false;
      dispatchWithPhases("pointerleave", path, target, ev);
    }
    for (let i = shared; i < nextPath.length; i++) {
      const target = nextPath[i] ?? null;
      if (!target) continue;
      const path = nextPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerenter", path, record2);
      ev.bubbles = false;
      dispatchWithPhases("pointerenter", path, target, ev);
    }
    hoverPath = nextPath;
  }
  function setFocus(nextId2) {
    const lock = focusLockTarget();
    if (lock) {
      if (!nextId2) {
        nextId2 = lock.id;
      } else {
        const want = nodes.get(nextId2) ?? null;
        const wantZ = want?.zIndex ?? 0;
        if (want && isVisible(want) && wantZ < lock.zIndex) {
          return;
        }
      }
    }
    if (focusedId === nextId2) return;
    const prev = focusedId ? nodes.get(focusedId) ?? null : null;
    const nextRaw = nextId2 ? nodes.get(nextId2) ?? null : null;
    const next = nextRaw && isVisible(nextRaw) ? nextRaw : null;
    focusedId = next?.id ?? null;
    onFocusChange?.(prev?.id ?? null, focusedId);
    if (prev) {
      const path = ancestorsForTarget(prev);
      const ev = makeBaseEvent("blur", path);
      dispatchWithPhases("blur", path, prev, ev);
    }
    if (next) {
      const path = ancestorsForTarget(next);
      const ev = makeBaseEvent("focus", path);
      dispatchWithPhases("focus", path, next, ev);
    }
  }
  function buildPointerEvent(type, path, record2) {
    const base = makeBaseEvent(type, path, record2.time);
    return Object.assign(base, {
      clientX: record2.clientX ?? record2.cellX,
      clientY: record2.clientY ?? record2.cellY,
      cellX: record2.cellX,
      cellY: record2.cellY,
      button: record2.type === "wheel" ? void 0 : record2.button,
      buttons: record2.type === "wheel" ? void 0 : record2.buttons,
      ctrlKey: record2.ctrlKey,
      shiftKey: record2.shiftKey,
      altKey: record2.altKey,
      metaKey: record2.metaKey,
      deltaY: record2.type === "wheel" ? record2.deltaY : void 0,
      deltaMode: record2.type === "wheel" ? record2.deltaMode : void 0
    });
  }
  function keyCombo(native) {
    let out2 = "";
    if (native.metaKey) out2 += "Meta+";
    if (native.ctrlKey) out2 += "Ctrl+";
    if (native.altKey) out2 += "Alt+";
    if (native.shiftKey) out2 += "Shift+";
    out2 += native.key;
    return out2;
  }
  function buildKeyboardEvent(type, path, record2) {
    const base = makeBaseEvent(type, path, record2.time);
    return Object.assign(base, {
      key: record2.key,
      code: record2.code ?? "",
      combo: keyCombo(record2),
      ctrlKey: record2.ctrlKey,
      shiftKey: record2.shiftKey,
      altKey: record2.altKey,
      metaKey: record2.metaKey,
      repeat: record2.repeat
    });
  }
  function buildInputEvent(type, path, record2) {
    const base = makeBaseEvent(type, path, record2.time);
    return Object.assign(base, {
      data: record2.data,
      inputType: record2.inputType,
      isComposing: record2.isComposing,
      text: record2.text
    });
  }
  function dispatchPointerEvent(type, record2, targetOverride) {
    const list = candidatesAt(record2.cellX, record2.cellY);
    const target = targetOverride ?? pickTarget(list);
    const path = target ? pathOuterToInner(list, target) : [];
    const ev = buildPointerEvent(type, path, record2);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }
  function dispatchToFocused(type, record2) {
    const target = resolveLockedFocusTarget(type);
    const path = target ? ancestorsForTarget(target) : [];
    const ev = buildKeyboardEvent(type, path, record2);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }
  function dispatchToFocusedText(type, record2) {
    const target = resolveLockedFocusTarget(type);
    const path = target ? [target] : [];
    const ev = buildInputEvent(type, path, record2);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }
  return {
    register(node) {
      const id = node.id ?? `n${nextId++}`;
      const focusable = node.focusable;
      const full = {
        id,
        rect: node.rect,
        zIndex: node.zIndex ?? 0,
        visible: node.visible ?? true,
        focusable,
        selectable: node.selectable ?? !focusable,
        selectionScrollBy: node.selectionScrollBy,
        handlers: node.handlers ?? {}
      };
      if (nodes.has(id)) removeFromRowBuckets(id);
      nodes.set(id, full);
      addToRowBuckets(id, full);
      return full;
    },
    update(id, next) {
      const prev = nodes.get(id);
      if (!prev) return;
      const nextVisible = next.visible ?? prev.visible;
      if (nextVisible === false) {
        if (focusedId === id) setFocus(null);
        if (capturedId === id) capturedId = null;
        if (hoverPath.some((n) => n.id === id)) hoverPath = [];
      }
      nodes.set(id, {
        ...prev,
        ...next,
        rect: next.rect ?? prev.rect,
        zIndex: next.zIndex ?? prev.zIndex,
        visible: nextVisible,
        handlers: next.handlers ?? prev.handlers
      });
      const updated = nodes.get(id);
      if (updated) updateRowBuckets(id, updated);
    },
    unregister(id) {
      if (capturedId === id) capturedId = null;
      if (hoverPath.some((n) => n.id === id)) hoverPath = [];
      removeFromRowBuckets(id);
      nodes.delete(id);
      if (focusedId === id) setFocus(null);
    },
    setMetrics(_next) {
    },
    canSelectAt(cellX, cellY) {
      const list = candidatesAt(cellX, cellY);
      const target = pickTarget(list);
      return target ? Boolean(target.selectable) : true;
    },
    autoScrollSelectionAt(originCellX, originCellY, pointerCellY) {
      const target = pickTarget(candidatesAt(originCellX, originCellY));
      if (!target) return 0;
      const path = ancestorsForTarget(target);
      let owner = null;
      for (let i = path.length - 1; i >= 0; i--) {
        const node = path[i];
        if (typeof node.selectionScrollBy === "function") {
          owner = node;
          break;
        }
      }
      if (!owner) return 0;
      const rect = owner.rect;
      const y = Math.floor(pointerCellY);
      let delta = 0;
      if (y <= rect.y) delta = -1;
      else if (y >= rect.y + rect.h - 1) delta = 1;
      if (!delta) return 0;
      const scrolled = owner.selectionScrollBy?.(delta);
      return scrolled === false ? 0 : delta;
    },
    focus(id) {
      setFocus(id);
    },
    getFocused() {
      return focusedId;
    },
    dispatch(event) {
      record?.(event);
      latency?.recordEventDispatchStart(event);
      let prevented = false;
      try {
        if (event.type === "keydown" || event.type === "keyup") {
          prevented = dispatchToFocused(event.type, event);
          return prevented;
        }
        if (event.type === "pointerdown" || event.type === "pointermove" || event.type === "pointerup" || event.type === "click" || event.type === "dblclick" || event.type === "contextmenu" || event.type === "wheel") {
          if (event.type === "pointerdown") {
            const list = candidatesAt(event.cellX, event.cellY);
            const target = pickTarget(list);
            if (target?.focusable) setFocus(target.id);
            capturedId = target?.id ?? null;
            updateHover(target, event);
            prevented = dispatchPointerEvent("pointerdown", event, target);
            return prevented;
          }
          if (event.type === "pointermove" && capturedId) {
            const target = nodes.get(capturedId) ?? null;
            if (!target) return prevented;
            updateHover(target, event);
            const path = ancestorsForTarget(target);
            const ev = buildPointerEvent("pointermove", path, event);
            dispatchWithPhases("pointermove", path, target, ev);
            prevented = ev.defaultPrevented;
            return prevented;
          }
          if (event.type === "pointermove") {
            const list = candidatesAt(event.cellX, event.cellY);
            const target = pickTarget(list);
            updateHover(target, event);
            prevented = dispatchPointerEvent("pointermove", event, target);
            return prevented;
          }
          if (event.type === "pointerup" && capturedId) {
            if (event[SUPPRESS_TERMINAL_POINTER_UP$1]) {
              capturedId = null;
              return true;
            }
            const target = nodes.get(capturedId) ?? null;
            const path = target ? ancestorsForTarget(target) : [];
            const ev = buildPointerEvent("pointerup", path, event);
            dispatchWithPhases("pointerup", path, target, ev);
            capturedId = null;
            prevented = ev.defaultPrevented;
            return prevented;
          }
          if (event.type === "pointerup") {
            if (event[SUPPRESS_TERMINAL_POINTER_UP$1]) {
              capturedId = null;
              return true;
            }
            prevented = dispatchPointerEvent("pointerup", event);
            capturedId = null;
            return prevented;
          }
          prevented = dispatchPointerEvent(event.type, event);
          return prevented;
        }
        if (event.type === "beforeinput" || event.type === "input" || event.type === "compositionstart" || event.type === "compositionupdate" || event.type === "compositionend" || event.type === "paste") {
          prevented = dispatchToFocusedText(event.type, event);
          return prevented;
        }
        return prevented;
      } finally {
        latency?.recordEventDispatchEnd(event, { defaultPrevented: prevented });
      }
    },
    debugNodes() {
      return Array.from(nodes.values()).map((n) => ({
        id: n.id,
        rect: n.rect,
        zIndex: n.zIndex,
        visible: isVisible(n),
        focusable: Boolean(n.focusable)
      }));
    },
    dispose() {
      rowBuckets.clear();
      rowRangeById.clear();
      nodes.clear();
      focusedId = null;
      capturedId = null;
      hoverPath = [];
    }
  };
}
const FRAME_PERF_REASON_PRIORITY = {
  unknown: 0,
  manual: 1,
  data: 2,
  selection: 3,
  stream: 4,
  resize: 5,
  scroll: 6,
  input: 7
};
function framePerfNow() {
  const p = globalThis.performance;
  if (p && typeof p.now === "function") return p.now();
  return Date.now();
}
function mergeFramePerfReason(prev, next) {
  const a = prev ?? "unknown";
  const b = next ?? "unknown";
  return FRAME_PERF_REASON_PRIORITY[b] > FRAME_PERF_REASON_PRIORITY[a] ? b : a;
}
function createFramePerfStore(limit = 120, opts) {
  const max = Math.max(1, Math.floor(limit));
  const manualEnabled = /* @__PURE__ */ ref(Boolean(opts?.enabled));
  const leaseCount = /* @__PURE__ */ ref(0);
  const enabled2 = computed({
    get: () => manualEnabled.value || leaseCount.value > 0,
    set: (next) => {
      manualEnabled.value = Boolean(next);
    }
  });
  const samples = [];
  function acquire(_reason) {
    leaseCount.value++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leaseCount.value = Math.max(0, leaseCount.value - 1);
    };
  }
  function push(sample) {
    if (!enabled2.value) return;
    samples.push(sample);
    if (samples.length > max) samples.splice(0, samples.length - max);
  }
  function latest() {
    return samples.at(-1) ?? null;
  }
  function list() {
    return samples.slice();
  }
  function clear() {
    samples.length = 0;
  }
  return { enabled: enabled2, acquire, push, latest, list, clear };
}
function createTraceStore(opts) {
  const enabled2 = /* @__PURE__ */ ref(Boolean(opts?.enabled));
  const records = /* @__PURE__ */ shallowReactive([]);
  const max = Math.max(10, Math.floor(opts?.max ?? 400));
  function push(record) {
    if (!enabled2.value) return;
    records.push(record);
    if (records.length > max) records.splice(0, records.length - max);
  }
  function clear() {
    records.splice(0, records.length);
  }
  function snapshot() {
    return records.slice();
  }
  return { enabled: enabled2, records, push, clear, snapshot };
}
function defaultNow() {
  const p = globalThis.performance;
  if (p && typeof p.now === "function") return p.now();
  return Date.now();
}
function parseEnabled(v) {
  return String(v ?? "").trim() === "1";
}
function parseLogFormat(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "json" ? "json" : "text";
}
function parseLogDest(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "file") return "file";
  if (s === "both") return "both";
  return "stdout";
}
function formatClockTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const mmm = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}
function createTuiProfiler(name) {
  const env = process$1?.env;
  if (!parseEnabled(env?.DIMCODE_PROFILE_TUI)) return null;
  const format = parseLogFormat(env?.DIMCODE_PROFILE_TUI_FORMAT);
  const logDest = parseLogDest(env?.DIMCODE_PROFILE_TUI_LOG_DEST);
  const logPath = String(env?.DIMCODE_PROFILE_TUI_LOG_PATH ?? "").trim();
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
  const invalidatePlaneCounts = /* @__PURE__ */ new Map();
  const renderPlaneCounts = /* @__PURE__ */ new Map();
  const logEveryMs = Number(env?.DIMCODE_PROFILE_TUI_LOG_EVERY_MS ?? 1e3);
  const now2 = defaultNow;
  let lastLogAt = now2();
  function incrementPlaneCount(target, key) {
    const normalized = String(key ?? "all").trim() || "all";
    target.set(normalized, (target.get(normalized) ?? 0) + 1);
  }
  function emit2(line) {
    const dest = logDest;
    if ((dest === "file" || dest === "both") && logPath) {
      try {
        appendFileSync(logPath, `${line}
`);
      } catch {
      }
    }
    if (dest === "stdout" || dest === "both") {
      console.log(line);
    }
  }
  function flushLog() {
    const at = now2();
    const elapsed = at - lastLogAt;
    if (elapsed <= 0) return;
    lastLogAt = at;
    const rps = renders ? renders * 1e3 / elapsed : 0;
    const ips = invalidates ? invalidates * 1e3 / elapsed : 0;
    const avgMs = renders ? totalRenderMs / renders : 0;
    const avgRows = renders ? totalRows / renders : 0;
    const avgNodes = renders ? totalNodes / renders : 0;
    const wps = writes ? writes * 1e3 / elapsed : 0;
    const avgWriteMs = writes ? totalWriteMs / writes : 0;
    const bps = totalBytes ? totalBytes * 1e3 / elapsed : 0;
    const avgBytes = writes ? totalBytes / writes : 0;
    if (format === "json") {
      emit2(
        JSON.stringify({
          tag: "DIMCODE_PROFILE_TUI",
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
            render: Object.fromEntries(renderPlaneCounts)
          },
          writeMode: {
            stream: streamWrites,
            sync: syncWrites,
            chunked: chunkedWrites
          }
        })
      );
    } else {
      emit2(
        `[${formatClockTime(Date.now())}] [DIMCODE_PROFILE_TUI] ${name} elapsedMs=${elapsed.toFixed(0)} rps=${rps.toFixed(1)} ips=${ips.toFixed(1)} avgMs=${avgMs.toFixed(2)} maxMs=${maxRenderMs.toFixed(2)} avgRows=${avgRows.toFixed(1)} avgNodes=${avgNodes.toFixed(1)} full=${fullRenders} sorted=${sortedRenders}${writes ? ` wps=${wps.toFixed(1)} avgWriteMs=${avgWriteMs.toFixed(2)} maxWriteMs=${maxWriteMs.toFixed(2)} avgBytes=${avgBytes.toFixed(0)} bps=${bps.toFixed(0)} mode(stream/sync/chunked)=${streamWrites}/${syncWrites}/${chunkedWrites}` : ""}`
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
    Number.isFinite(logEveryMs) ? Math.max(100, logEveryMs) : 1e3
  );
  timer.unref?.();
  return {
    now: now2,
    recordInvalidate(info) {
      invalidates++;
      incrementPlaneCount(invalidatePlaneCounts, info?.plane ?? "all");
    },
    recordRender(info) {
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
      writes++;
      totalWriteMs += info.durationMs;
      totalBytes += Math.max(0, Math.floor(info.bytes));
      if (info.durationMs > maxWriteMs) maxWriteMs = info.durationMs;
      if (info.mode === "stream") streamWrites++;
      else if (info.mode === "sync") syncWrites++;
      else chunkedWrites++;
    }
  };
}
const LOG_FILE = "/tmp/goatchain-debug.log";
let enabled = false;
function createDebugLogger(enable = false) {
  enabled = enable;
  if (enabled) {
    try {
      writeFileSync(
        LOG_FILE,
        `=== GoatChain Debug Log Started at ${(/* @__PURE__ */ new Date()).toISOString()} ===

`
      );
    } catch {
    }
  }
  return {
    render: (message) => log("[RENDER]", message),
    stream: (message) => log("[STREAM]", message),
    error: (message, ...args) => {
      if (!enabled) return;
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
      const fullMessage = `[${timestamp}] [ERROR] ${message}${args.length ? ` ${JSON.stringify(args)}` : ""}`;
      write(`${fullMessage}
`);
    }
  };
}
function log(category, message) {
  if (!enabled) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, -1);
  write(`[${timestamp}] ${category} ${message}
`);
}
function write(data) {
  if (!enabled) return;
  try {
    appendFileSync(LOG_FILE, data);
  } catch {
  }
}
function isDebugEnabled() {
  const env = process$1?.env;
  return env?.DIMCODE_DEBUG === "1" || env?.DEBUG === "1";
}
let debugLog = null;
function getDebugLog() {
  if (!debugLog) {
    debugLog = createDebugLogger(isDebugEnabled());
  }
  return debugLog;
}
let writeSync = null;
try {
  const fs = globalThis.require?.("node:fs") ?? globalThis.require?.("fs");
  if (fs?.writeSync) {
    writeSync = (fd, data) => {
      const buffer2 = Buffer.from(data, "utf8");
      fs.writeSync(fd, buffer2);
    };
  }
} catch {
}
const SYNC_START = "\x1B[?2026h";
const SYNC_END = "\x1B[?2026l";
const OSC8_OPEN = (href) => `\x1B]8;;${href}\x07`;
const OSC8_CLOSE = "\x1B]8;;\x07";
function createStdoutRenderer(terminal, options) {
  const output = options?.output ?? process$1.stdout;
  if (!output) throw new Error("createStdoutRenderer requires a Node stdout-like output");
  const out2 = output;
  const clear = options?.clear ?? true;
  const hideCursor = options?.hideCursor ?? true;
  const altScreen = options?.altScreen ?? Boolean(out2.isTTY);
  let defaultBg = options?.defaultBg == null || options?.defaultBg === "transparent" ? void 0 : options?.defaultBg ?? "black";
  let palette = options?.palette ?? null;
  const trackResize = options?.trackResize ?? true;
  const getImeAnchor = options?.getImeAnchor;
  const cliLatency = getCliLatencyProfiler();
  const profiler = createTuiProfiler("stdout-renderer");
  function resolveUseSyncOutput() {
    if (options?.useSyncOutput != null) return options.useSyncOutput;
    const env2 = process$1?.env ?? {};
    const term2 = String(env2.TERM ?? "").toLowerCase();
    const termProgram2 = String(env2.TERM_PROGRAM ?? "").toLowerCase();
    const termProgramVersion = env2.TERM_PROGRAM_VERSION;
    const isGhostty2 = "GHOSTTY_RESOURCES_DIR" in env2;
    const isProblematicTerminal = isGhostty2 || termProgram2.includes("apple_terminal") || term2.includes("screen") && !term2.includes("tmux");
    if (isProblematicTerminal) {
      return false;
    }
    const isGoodTerminal = termProgram2.includes("iterm") && termProgramVersion && // iTerm2 3.5+ supports DEC 2026
    compareVersion(String(termProgramVersion), "3.5.0") >= 0;
    if (isGoodTerminal) {
      return true;
    }
    return false;
  }
  function compareVersion(a, b) {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);
    const maxLen = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < maxLen; i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  }
  const useSyncOutput = resolveUseSyncOutput();
  const isGhostty = "GHOSTTY_RESOURCES_DIR" in (process$1?.env ?? {});
  const env = process$1?.env ?? {};
  const chunkSize = 8 * 1024;
  const chunkThresholdBytes = 64 * 1024;
  const syncMaxBytes = 128 * 1024;
  const dirtyFullThreshold = 0.6;
  const termProgram = String(env.TERM_PROGRAM ?? "").trim().toLowerCase();
  const term = String(env.TERM ?? "").trim().toLowerCase();
  const isVscodeTerminal = termProgram === "vscode" || "VSCODE_PID" in env || "VSCODE_IPC_HOOK_CLI" in env;
  const useConservativeDirtyRowRendering = out2.isTTY !== false && !isVscodeTerminal && (isGhostty || "KITTY_WINDOW_ID" in env || "ALACRITTY_WINDOW_ID" in env || "ALACRITTY_LOG" in env || "WEZTERM_PANE" in env || "WEZTERM_EXECUTABLE" in env || termProgram.includes("kitty") || termProgram.includes("alacritty") || termProgram.includes("wezterm") || term.includes("kitty") || term.includes("alacritty"));
  const enableOsc8Links = out2.isTTY !== false && !isVscodeTerminal;
  let disposed = false;
  let lastFrameTime = 0;
  let pendingRender = false;
  let renderTimer = null;
  let writeEmaMs = 0;
  let lastCursorX = null;
  let lastCursorY = null;
  let accumulatedAllRows = false;
  let accumulatedDirtyBits = null;
  let accumulatedDirtyCount = 0;
  let accumulatedDirtyMin = Number.POSITIVE_INFINITY;
  let accumulatedDirtyMax = -1;
  let accumulatedScrollOperations = null;
  let accumulatedSkipUnchangedDirtyRows = true;
  const MIN_FRAME_MS = !out2.isTTY ? 0 : 16;
  function clampCellToViewport(cell, size) {
    const maxX = Math.max(0, Math.floor(size.cols) - 1);
    const maxY = Math.max(0, Math.floor(size.rows) - 1);
    const x0 = Math.floor(cell.cellX);
    const y0 = Math.floor(cell.cellY);
    const x = Math.min(maxX, Math.max(0, x0));
    const y = Math.min(maxY, Math.max(0, y0));
    return { x, y };
  }
  function resolveColorMode() {
    const opt = options?.colorMode ?? "auto";
    if (opt !== "auto") return opt;
    const env2 = process$1?.env ?? {};
    return detectTerminalColorCapability({
      env: env2,
      isTTY: Boolean(out2.isTTY),
      platform: String(process$1?.platform ?? "")
    }).mode;
  }
  const colorMode = resolveColorMode();
  const enableDim = colorMode === "truecolor";
  const COLOR_INDEX = {
    black: 1,
    red: 2,
    green: 3,
    yellow: 4,
    blue: 5,
    magenta: 6,
    cyan: 7,
    white: 8,
    blackBright: 9,
    redBright: 10,
    greenBright: 11,
    yellowBright: 12,
    blueBright: 13,
    magentaBright: 14,
    cyanBright: 15,
    whiteBright: 16
  };
  const BUILTIN_COLOR_INDEX = { ...COLOR_INDEX };
  let nextColorIdx = 17;
  const MAX_COLOR_INDEX = 255;
  function colorIndex(color) {
    if (!color) return 0;
    let idx = COLOR_INDEX[color];
    if (idx !== void 0) return idx;
    if (nextColorIdx > MAX_COLOR_INDEX) return MAX_COLOR_INDEX;
    idx = nextColorIdx++;
    COLOR_INDEX[color] = idx;
    return idx;
  }
  let styleKeyCache = /* @__PURE__ */ new WeakMap();
  const HREF_STYLE_FLAG = 1 << 21;
  function styleKey(style) {
    const cached = styleKeyCache.get(style);
    if (cached !== void 0) return cached;
    const key = colorIndex(style.fg) | colorIndex(style.bg ?? defaultBg) << 8 | (style.bold ? 1 << 16 : 0) | (enableDim && style.dim ? 1 << 17 : 0) | (style.italic ? 1 << 18 : 0) | (style.underline ? 1 << 19 : 0) | (style.inverse ? 1 << 20 : 0) | (style.href ? HREF_STYLE_FLAG : 0);
    styleKeyCache.set(style, key);
    return key;
  }
  function styleKeyFromParts(style) {
    return colorIndex(style.fg) | colorIndex(style.bg ?? defaultBg) << 8 | (style.bold ? 1 << 16 : 0) | (enableDim && style.dim ? 1 << 17 : 0) | (style.italic ? 1 << 18 : 0) | (style.underline ? 1 << 19 : 0) | (style.inverse ? 1 << 20 : 0) | (style.href ? HREF_STYLE_FLAG : 0);
  }
  function normalizeHref(value) {
    return typeof value === "string" && value ? value : null;
  }
  function resolveAnsiColorRgb(name) {
    return ansiColorRgb(name, palette);
  }
  function openColor(fg) {
    if (!fg) return "";
    if (fg === "transparent") return "\x1B[39m";
    if (fg.startsWith("#")) {
      const rgb2 = ansiHexToRgb(fg);
      if (!rgb2) return "";
      if (colorMode === "ansi8") return ansi8FgOpen(rgbToAnsi16(rgb2));
      if (colorMode === "ansi16") return ansi16FgOpen(rgbToAnsi16(rgb2));
      if (colorMode === "ansi256") return ansi256FgOpen(rgbToAnsi256(rgb2));
      return truecolorFgOpen(rgb2);
    }
    if (!isAnsiColorName(fg)) return "";
    if (colorMode === "ansi8") return ansi8FgOpen(fg);
    if (colorMode === "ansi16") return ansi16FgOpen(fg);
    const rgb = resolveAnsiColorRgb(fg);
    if (!rgb) return "";
    if (colorMode === "ansi256") return ansi256FgOpen(rgbToAnsi256(rgb));
    return truecolorFgOpen(rgb);
  }
  function openBg(bg) {
    if (!bg) return defaultBg == null ? "\x1B[49m" : "";
    if (bg === "transparent") return "\x1B[49m";
    if (bg.startsWith("#")) {
      const rgb2 = ansiHexToRgb(bg);
      if (!rgb2) return "";
      if (colorMode === "ansi8") return ansi8BgOpen(rgbToAnsi16(rgb2));
      if (colorMode === "ansi16") return ansi16BgOpen(rgbToAnsi16(rgb2));
      if (colorMode === "ansi256") return ansi256BgOpen(rgbToAnsi256(rgb2));
      return truecolorBgOpen(rgb2);
    }
    if (!isAnsiColorName(bg)) return "";
    if (colorMode === "ansi8") return ansi8BgOpen(bg);
    if (colorMode === "ansi16") return ansi16BgOpen(bg);
    const rgb = resolveAnsiColorRgb(bg);
    if (!rgb) return "";
    if (colorMode === "ansi256") return ansi256BgOpen(rgbToAnsi256(rgb));
    return truecolorBgOpen(rgb);
  }
  function openStyle(style) {
    let result = "";
    result += openColor(style.fg);
    result += openBg(style.bg ?? defaultBg);
    if (style.bold) result += SGR_BOLD;
    if (enableDim && style.dim) result += SGR_DIM;
    if (style.italic) result += SGR_ITALIC;
    if (style.underline) result += SGR_UNDERLINE;
    if (style.inverse) result += SGR_INVERSE;
    return result;
  }
  let lastRenderedRows = 0;
  let fpCols = 0;
  let fpRows = 0;
  let currentFP = new Uint32Array(0);
  let prevFP = new Uint32Array(0);
  let currentHrefIds = new Uint32Array(0);
  let prevHrefIds = new Uint32Array(0);
  let fpPrevValid = false;
  let prevOverlayBlockedRows = [];
  let prevOverlayPartialRows = [];
  const hrefIndex = /* @__PURE__ */ new Map();
  let nextHrefId = 1;
  function ensureFingerprints(cols2, rows2) {
    if (cols2 === fpCols && rows2 === fpRows) return;
    fpCols = cols2;
    fpRows = rows2;
    const len = cols2 * rows2;
    currentFP = new Uint32Array(len);
    prevFP = new Uint32Array(len);
    currentHrefIds = new Uint32Array(len);
    prevHrefIds = new Uint32Array(len);
    fpPrevValid = false;
    prevOverlayBlockedRows = [];
    prevOverlayPartialRows = [];
  }
  function charHash10(ch) {
    if (ch.length <= 1) return (ch.charCodeAt(0) || 0) & 1023;
    let h2 = 33052;
    for (let i = 0; i < ch.length; i++) {
      h2 ^= ch.charCodeAt(i);
      h2 = h2 * 257 & 65535;
    }
    return h2 & 1023;
  }
  function hrefId(href) {
    if (!href) return 0;
    const cached = hrefIndex.get(href);
    if (cached != null) return cached;
    const id = nextHrefId++;
    hrefIndex.set(href, id);
    return id;
  }
  function cellFingerprint(ch, style) {
    return styleKey(style) << 10 | charHash10(ch);
  }
  function fingerprintRow(row, y, cols2) {
    const rowFP = terminal.getRowFingerprints(y);
    const base = y * fpCols;
    if (rowFP && rowFP.length >= cols2) {
      currentFP.set(rowFP.subarray(0, cols2), base);
    } else {
      for (let x = 0; x < cols2; x++) {
        const cell = row[x];
        currentFP[base + x] = cellFingerprint(cell.ch, cell.style);
      }
    }
    for (let x = 0; x < cols2; x++) {
      const cell = row[x];
      currentHrefIds[base + x] = hrefId(normalizeHref(cell.style.href));
    }
  }
  const rowCursorToCol1 = [];
  const rowClearToEol = [];
  const rowTextPartsScratch = [];
  const needsWideCursorFix = (cell, ch) => {
    const w = cell.width ?? 1;
    return w === 2 && ch.length > 1;
  };
  const ensureRowEscapes = (rows2) => {
    if (rowCursorToCol1.length >= rows2) return;
    const start = rowCursorToCol1.length;
    rowCursorToCol1.length = rows2;
    rowClearToEol.length = rows2;
    for (let y = start; y < rows2; y++) {
      rowCursorToCol1[y] = `\x1B[${y + 1};1H`;
      rowClearToEol[y] = `\x1B[${y + 1};1H\x1B[K`;
    }
  };
  const expandSpanStart = (row, startX) => {
    let x = Math.max(0, Math.min(row.length, startX));
    while (x > 0 && row[x]?.continuation) x--;
    return x;
  };
  const expandSpanEnd = (row, endXExclusive) => {
    let x = Math.max(0, Math.min(row.length, endXExclusive));
    while (x < row.length && row[x]?.continuation) x++;
    if (x > 0) {
      const cell = row[x - 1];
      if (cell?.width === 2 && !cell.continuation) x = Math.min(row.length, x + 1);
    }
    return x;
  };
  const resolveChangedSpan = (row, y, cols2) => {
    if (!fpCols || y >= fpRows || !fpPrevValid)
      return row.length ? { startX: 0, endXExclusive: row.length } : null;
    const base = y * fpCols;
    let startX = -1;
    let endXExclusive = -1;
    for (let x = 0; x < cols2; x++) {
      if (currentFP[base + x] === prevFP[base + x] && currentHrefIds[base + x] === prevHrefIds[base + x])
        continue;
      if (startX === -1) startX = x;
      endXExclusive = x + 1;
    }
    if (startX === -1) return null;
    const expandedStart = expandSpanStart(row, startX);
    const expandedEnd = expandSpanEnd(row, endXExclusive);
    return expandedEnd > expandedStart ? { startX: expandedStart, endXExclusive: expandedEnd } : null;
  };
  const resolveChangedSpanAgainstFill = (row, y, cols2, fillFingerprint) => {
    if (!fpCols || y >= fpRows) return row.length ? { startX: 0, endXExclusive: row.length } : null;
    const base = y * fpCols;
    let startX = -1;
    let endXExclusive = -1;
    for (let x = 0; x < cols2; x++) {
      if (currentFP[base + x] === fillFingerprint) continue;
      if (startX === -1) startX = x;
      endXExclusive = x + 1;
    }
    if (startX === -1) return null;
    const expandedStart = expandSpanStart(row, startX);
    const expandedEnd = expandSpanEnd(row, endXExclusive);
    return expandedEnd > expandedStart ? { startX: expandedStart, endXExclusive: expandedEnd } : null;
  };
  const resolveChangedSpanAgainstReference = (row, y, cols2) => {
    if (!fpCols || y >= fpRows) return row.length ? { startX: 0, endXExclusive: row.length } : null;
    const rowFP = terminal.getRowFingerprints(y);
    const base = y * fpCols;
    let startX = -1;
    let endXExclusive = -1;
    for (let x = 0; x < cols2; x++) {
      const rowHrefId = hrefId(normalizeHref(row[x].style.href));
      const fingerprint = rowFP && rowFP.length >= cols2 ? rowFP[x] : cellFingerprint(row[x].ch, row[x].style);
      if (fingerprint === currentFP[base + x] && rowHrefId === currentHrefIds[base + x]) continue;
      if (startX === -1) startX = x;
      endXExclusive = x + 1;
    }
    if (startX === -1) return null;
    const expandedStart = expandSpanStart(row, startX);
    const expandedEnd = expandSpanEnd(row, endXExclusive);
    return expandedEnd > expandedStart ? { startX: expandedStart, endXExclusive: expandedEnd } : null;
  };
  const rowMatchesPreviousFrame = (y, cols2) => {
    if (!fpCols || y < 0 || y >= fpRows || !fpPrevValid) return false;
    const rowFP = terminal.getRowFingerprints(y);
    const row = rowFP && rowFP.length >= cols2 ? null : terminal.getRow(y);
    const base = y * fpCols;
    for (let x = 0; x < cols2; x++) {
      const rowHrefId = hrefId(
        normalizeHref((row ?? terminal.getRow(y))[x].style.href)
      );
      const fingerprint = rowFP && rowFP.length >= cols2 ? rowFP[x] : cellFingerprint(row[x].ch, row[x].style);
      if (fingerprint !== prevFP[base + x] || rowHrefId !== prevHrefIds[base + x]) return false;
    }
    return true;
  };
  const rowHasNonDefaultBlankCell = (source, y, cols2) => {
    if (!fpCols || y < 0 || y >= fpRows) return false;
    const blankFP = styleKeyFromParts({ bg: defaultBg }) << 10 | charHash10(" ");
    const base = y * fpCols;
    const limit = Math.min(cols2, fpCols);
    for (let x = 0; x < limit; x++) {
      if (source[base + x] !== blankFP) return true;
    }
    return false;
  };
  function overlayPlaneCoverageRows(totalRows) {
    const blockedRows = [];
    const partialRows = [];
    for (let y = 0; y < totalRows; y++) {
      const kind = getPlaneRowCoverageKind(terminal, "overlay", y);
      if (!kind) continue;
      blockedRows.push(y);
      if (kind === 1) partialRows.push(y);
    }
    return { blockedRows, partialRows };
  }
  const enableScrollRegions = (() => {
    const raw = String(env.DIMCODE_TUI_SCROLL_REGIONS ?? "").trim();
    if (raw === "0" || raw === "false") return false;
    if (isGhostty || isVscodeTerminal) return false;
    return out2.isTTY !== false;
  })();
  function prepareExplicitScrollOperations(operations, blockedRows) {
    if (!operations.length || !blockedRows?.size) {
      return {
        operations,
        hiddenRows: /* @__PURE__ */ new Set(),
        trimmed: false,
        blockedInterior: false
      };
    }
    const hiddenRows = /* @__PURE__ */ new Set();
    const prepared = [];
    let trimmed = false;
    for (const op of operations) {
      let startY = op.startY;
      let endY = op.endY;
      while (startY < endY && blockedRows.has(startY)) {
        hiddenRows.add(startY);
        startY++;
        trimmed = true;
      }
      while (endY > startY && blockedRows.has(endY - 1)) {
        hiddenRows.add(endY - 1);
        endY--;
        trimmed = true;
      }
      for (let y = startY; y < endY; y++) {
        if (!blockedRows.has(y)) continue;
        return {
          operations: null,
          hiddenRows,
          trimmed,
          blockedInterior: true
        };
      }
      if (endY <= startY || Math.abs(op.delta) >= endY - startY) {
        return {
          operations: null,
          hiddenRows,
          trimmed,
          blockedInterior: false
        };
      }
      prepared.push(
        startY === op.startY && endY === op.endY ? op : { startY, endY, delta: op.delta }
      );
    }
    return {
      operations: prepared,
      hiddenRows,
      trimmed,
      blockedInterior: false
    };
  }
  function largestDirtyBand(rows2, blockedRows) {
    if (rows2.length === 0) return null;
    const blocked = blockedRows?.length ? new Set(blockedRows) : null;
    let bestStart = -1;
    let bestEnd = -1;
    let bandStart = -1;
    let prev = -1;
    for (let i = 0; i < rows2.length; i++) {
      const y = rows2[i];
      if (blocked?.has(y)) {
        if (bandStart !== -1 && prev + 1 - bandStart > bestEnd - bestStart) {
          bestStart = bandStart;
          bestEnd = prev + 1;
        }
        bandStart = -1;
        prev = -1;
        continue;
      }
      if (bandStart === -1) {
        bandStart = y;
        prev = y;
        if (bestStart === -1) {
          bestStart = y;
          bestEnd = y + 1;
        }
        continue;
      }
      if (y === prev + 1) {
        prev = y;
        continue;
      }
      if (prev + 1 - bandStart > bestEnd - bestStart) {
        bestStart = bandStart;
        bestEnd = prev + 1;
      }
      bandStart = y;
      prev = y;
    }
    if (bandStart !== -1 && prev + 1 - bandStart > bestEnd - bestStart) {
      bestStart = bandStart;
      bestEnd = prev + 1;
    }
    if (bestStart === -1) return null;
    const outsideRows = [];
    for (const y of rows2) {
      if (blocked?.has(y) || y < bestStart || y >= bestEnd) {
        outsideRows.push(y);
      }
    }
    return { start: bestStart, end: bestEnd, outsideRows };
  }
  function detectScrollShift(cols2, dirtyRows, blockedRows) {
    if (!fpPrevValid || !fpCols || cols2 !== fpCols) return null;
    const band = largestDirtyBand(dirtyRows, blockedRows);
    if (!band || band.end - band.start < 3) return null;
    const maxDelta = Math.min(12, Math.max(5, band.end - band.start - 1));
    for (let delta = -maxDelta; delta <= maxDelta; delta++) {
      if (delta === 0) continue;
      let matches = 0;
      let checked = 0;
      let mismatches = 0;
      for (let y = band.start; y < band.end; y++) {
        const srcY = y + delta;
        if (srcY < band.start || srcY >= band.end) continue;
        const informative = rowHasNonDefaultBlankCell(currentFP, y, cols2) || rowHasNonDefaultBlankCell(prevFP, srcY, cols2);
        if (!informative) continue;
        checked++;
        const curBase = y * fpCols;
        const prevBase = srcY * fpCols;
        let rowMatch = true;
        for (let x = 0; x < cols2; x++) {
          if (currentFP[curBase + x] !== prevFP[prevBase + x] || currentHrefIds[curBase + x] !== prevHrefIds[prevBase + x]) {
            rowMatch = false;
            break;
          }
        }
        if (rowMatch) {
          matches++;
        } else {
          mismatches++;
        }
      }
      if (checked > 0 && matches >= 3 && mismatches <= Math.ceil(checked * 0.2)) {
        const absDelta = Math.abs(delta);
        let newRowStart;
        let newRowEnd;
        if (delta > 0) {
          newRowStart = Math.max(band.start, band.end - absDelta);
          newRowEnd = band.end;
        } else {
          newRowStart = band.start;
          newRowEnd = Math.min(band.end, band.start + absDelta);
        }
        const extraDirty = [...band.outsideRows];
        for (let y = band.start; y < band.end; y++) {
          const srcY = y + delta;
          if (srcY < band.start || srcY >= band.end) continue;
          const curBase = y * fpCols;
          const prevBase = srcY * fpCols;
          let rowMatch = true;
          for (let x = 0; x < cols2; x++) {
            if (currentFP[curBase + x] !== prevFP[prevBase + x] || currentHrefIds[curBase + x] !== prevHrefIds[prevBase + x]) {
              rowMatch = false;
              break;
            }
          }
          if (!rowMatch) extraDirty.push(y);
        }
        return {
          regionStart: band.start,
          regionEnd: band.end,
          delta,
          newRowStart,
          newRowEnd,
          extraDirtyRows: extraDirty
        };
      }
    }
    return null;
  }
  function writeChunked(data) {
    if (!isGhostty) {
      if (data.length <= chunkSize) {
        out2.write(data);
        return;
      }
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        out2.write(chunk);
      }
      return;
    }
    if (isDebugEnabled()) {
      getDebugLog().render(`writeChunked: sync chunked write of ${data.length} bytes`);
    }
    try {
      if (data.length <= chunkSize) {
        out2.write(data);
      } else {
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          out2.write(chunk);
        }
      }
      if (isDebugEnabled()) getDebugLog().render(`writeChunked: chunked write completed`);
    } catch (e) {
      if (isDebugEnabled()) getDebugLog().error(`writeChunked: write error`, e);
    }
  }
  function doRender(dirtyRows, scrollOperations, skipUnchangedDirtyRows = false) {
    if (isDebugEnabled()) {
      getDebugLog().render(`doRender() START: dirtyRows=${dirtyRows?.length ?? "null"}`);
    }
    if (disposed) return;
    cliLatency?.recordStdoutRenderStart();
    pendingRender = false;
    accumulatedAllRows = false;
    accumulatedDirtyBits = null;
    accumulatedDirtyCount = 0;
    accumulatedDirtyMin = Number.POSITIVE_INFINITY;
    accumulatedDirtyMax = -1;
    accumulatedScrollOperations = null;
    accumulatedSkipUnchangedDirtyRows = true;
    lastFrameTime = Date.now();
    const renderStart = performance.now();
    const size = terminal.size();
    ensureRowEscapes(Math.max(size.rows, lastRenderedRows));
    ensureFingerprints(size.cols, size.rows);
    const bgSeq = openBg(defaultBg);
    const bgOnlyStyle = { bg: defaultBg };
    const bgKey = styleKeyFromParts({ bg: defaultBg });
    const blankFP = bgKey << 10 | charHash10(" ");
    const cellFP = (cell) => cellFingerprint(cell.ch, cell.style);
    const lastOccupiedColumnInRow = (row, cols2) => {
      const limit = Math.min(row.length, cols2);
      for (let x = limit - 1; x >= 0; x--) {
        if (cellFP(row[x]) !== blankFP) return x;
      }
      return -1;
    };
    const lastOccupiedColumnInReference = (source, y, cols2) => {
      if (!fpCols || y < 0 || y >= fpRows) return -1;
      const limit = Math.min(fpCols, cols2);
      const base = y * fpCols;
      for (let x = limit - 1; x >= 0; x--) {
        if (source[base + x] !== blankFP) return x;
      }
      return -1;
    };
    const shouldRewriteRowTail = (row, y, cols2, reference) => lastOccupiedColumnInRow(row, cols2) < lastOccupiedColumnInReference(reference, y, cols2);
    let dirtySorted = true;
    const normalizedScrollOperations = (() => {
      if (!scrollOperations?.length) return null;
      const outOps = [];
      for (const op of scrollOperations) {
        const startY = Math.max(0, Math.min(size.rows, Math.floor(op.startY)));
        const endY = Math.max(0, Math.min(size.rows, Math.floor(op.endY)));
        const delta = Math.trunc(op.delta);
        if (endY <= startY || delta === 0 || Math.abs(delta) >= endY - startY) continue;
        outOps.push({ startY, endY, delta });
      }
      if (!outOps.length) return null;
      outOps.sort((a, b) => a.startY - b.startY);
      return outOps;
    })();
    let rowsToRender = (() => {
      if (!dirtyRows || dirtyRows.length === 0) return null;
      const outRows = [];
      outRows.length = dirtyRows.length;
      let outLen = 0;
      let sorted = true;
      let prev = -1;
      for (let i = 0; i < dirtyRows.length; i++) {
        const y = Math.floor(dirtyRows[i] ?? -1);
        if (y < 0 || y >= size.rows) continue;
        if (y <= prev) sorted = false;
        prev = y;
        outRows[outLen++] = y;
      }
      outRows.length = outLen;
      if (!outRows.length) return null;
      dirtySorted = sorted;
      if (!sorted) outRows.sort((a, b) => a - b);
      return outRows;
    })();
    if (fpPrevValid && rowsToRender) {
      currentFP.set(prevFP);
      currentHrefIds.set(prevHrefIds);
    }
    const frameParts = [];
    frameParts.push(!isGhostty && useSyncOutput ? SYNC_START : "");
    frameParts.push("\x1B[?7l");
    frameParts.push(SGR_RESET, bgSeq);
    let lastRenderedY = -1;
    let lastRenderWasFullRow = false;
    let hasFrameOutput = false;
    let activeStyleKey = null;
    let activeStyle = {
      fg: null,
      bg: defaultBg,
      bold: false,
      dim: false,
      italic: false,
      underline: false,
      inverse: false,
      href: null
    };
    const normalizeStyle2 = (style) => {
      return {
        fg: style.fg ?? null,
        bg: style.bg ?? defaultBg,
        bold: Boolean(style.bold),
        dim: enableDim && Boolean(style.dim),
        italic: Boolean(style.italic),
        underline: Boolean(style.underline),
        inverse: Boolean(style.inverse),
        href: normalizeHref(style.href)
      };
    };
    const emitStyle = (nextStyle, nextKey) => {
      const next = normalizeStyle2(nextStyle);
      if (activeStyleKey === nextKey && activeStyle.href === next.href) return;
      if (enableOsc8Links && activeStyle.href !== next.href) {
        if (activeStyle.href) frameParts.push(OSC8_CLOSE);
        if (next.href) frameParts.push(OSC8_OPEN(next.href));
      }
      const requiresReset = activeStyle.bold && !next.bold || activeStyle.dim && !next.dim || activeStyle.italic && !next.italic || activeStyle.underline && !next.underline || activeStyle.inverse && !next.inverse || activeStyle.fg != null && next.fg == null;
      if (requiresReset) {
        frameParts.push(SGR_RESET, openStyle(nextStyle));
        activeStyleKey = nextKey;
        activeStyle = next;
        return;
      }
      if (activeStyle.fg !== next.fg && next.fg != null) frameParts.push(openColor(next.fg));
      if (activeStyle.bg !== next.bg) frameParts.push(openBg(next.bg));
      if (!activeStyle.bold && next.bold) frameParts.push(SGR_BOLD);
      if (!activeStyle.dim && next.dim) frameParts.push(SGR_DIM);
      if (!activeStyle.italic && next.italic) frameParts.push(SGR_ITALIC);
      if (!activeStyle.underline && next.underline) frameParts.push(SGR_UNDERLINE);
      if (!activeStyle.inverse && next.inverse) frameParts.push(SGR_INVERSE);
      activeStyleKey = nextKey;
      activeStyle = next;
    };
    const renderRow = (y, row, startX = 0, endXExclusive = row.length, clearToEol = true) => {
      const spanStart = Math.max(0, Math.min(row.length, Math.floor(startX)));
      const spanEnd = Math.max(spanStart, Math.min(row.length, Math.floor(endXExclusive)));
      if (spanStart >= spanEnd && !clearToEol) {
        return;
      }
      hasFrameOutput = true;
      {
        if (spanStart === 0 && lastRenderWasFullRow && y === lastRenderedY + 1) {
          frameParts.push("\r\n");
        } else {
          frameParts.push(
            spanStart === 0 ? rowCursorToCol1[y] : `\x1B[${y + 1};${spanStart + 1}H`
          );
        }
      }
      let currentKey = null;
      let currentStyle = null;
      const currentTextParts = rowTextPartsScratch;
      currentTextParts.length = 0;
      for (let x = spanStart; x < spanEnd; x++) {
        const cell = row[x];
        if (cell.continuation) continue;
        const ch = cell.ch || " ";
        const nextStyle = cell.style;
        const key = nextStyle === currentStyle && currentKey != null ? currentKey : styleKey(nextStyle);
        if (currentKey == null) {
          currentKey = key;
          currentStyle = nextStyle;
          currentTextParts.push(ch);
          if (needsWideCursorFix(cell, ch)) {
            currentTextParts.push(`\x1B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
          }
          continue;
        }
        if (key === currentKey && normalizeHref(nextStyle.href) === normalizeHref(currentStyle?.href)) {
          currentTextParts.push(ch);
          if (needsWideCursorFix(cell, ch)) {
            currentTextParts.push(`\x1B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
          }
          continue;
        }
        if (activeStyleKey !== currentKey) {
          emitStyle(currentStyle, currentKey);
        }
        frameParts.push(currentTextParts.join(""));
        currentKey = key;
        currentStyle = nextStyle;
        currentTextParts.length = 0;
        currentTextParts.push(ch);
        if (needsWideCursorFix(cell, ch))
          currentTextParts.push(`\x1B[${y + 1};${x + 1 + (cell.width ?? 1)}H`);
      }
      if (currentKey != null) {
        if (activeStyleKey !== currentKey) {
          emitStyle(currentStyle, currentKey);
        }
        frameParts.push(currentTextParts.join(""));
      }
      if (clearToEol) {
        if (activeStyleKey !== bgKey) {
          emitStyle(bgOnlyStyle, bgKey);
        }
        frameParts.push("\x1B[K");
      }
      lastRenderedY = y;
      lastRenderWasFullRow = spanStart === 0 && clearToEol;
    };
    const overlayCoverage = overlayPlaneCoverageRows(size.rows);
    const overlayRows = Array.from(
      /* @__PURE__ */ new Set([...overlayCoverage.blockedRows, ...prevOverlayBlockedRows])
    ).sort((a, b) => a - b);
    const overlayRowSet = overlayRows.length ? new Set(overlayRows) : null;
    const overlayPartialRows = Array.from(
      /* @__PURE__ */ new Set([...overlayCoverage.partialRows, ...prevOverlayPartialRows])
    ).sort((a, b) => a - b);
    const overlayPartialRowSet = overlayPartialRows.length ? new Set(overlayPartialRows) : null;
    const overlayTouchedRowSet = (() => {
      if (!overlayRowSet && !overlayPartialRowSet) return null;
      return /* @__PURE__ */ new Set([
        ...overlayRowSet ? Array.from(overlayRowSet) : [],
        ...overlayPartialRowSet ? Array.from(overlayPartialRowSet) : []
      ]);
    })();
    let explicitScrollOperations = normalizedScrollOperations;
    let hiddenExplicitDirtyRows = null;
    let allowInferredScrollRegions = true;
    if (explicitScrollOperations && overlayRows.length) {
      const preparedExplicit = prepareExplicitScrollOperations(
        explicitScrollOperations,
        overlayRowSet
      );
      hiddenExplicitDirtyRows = preparedExplicit.hiddenRows.size ? preparedExplicit.hiddenRows : null;
      if (preparedExplicit.operations) {
        explicitScrollOperations = preparedExplicit.operations;
        if (preparedExplicit.trimmed && isDebugEnabled()) {
          getDebugLog().render(
            ` Explicit scroll ops clipped around overlay rows: ${normalizedScrollOperations.map((op, index) => `${op.startY}-${op.endY - 1}:${op.delta}->${explicitScrollOperations[index].startY}-${explicitScrollOperations[index].endY - 1}:${explicitScrollOperations[index].delta}`).join(", ")}`
          );
        }
      } else {
        allowInferredScrollRegions = false;
        const expandedRows = new Set(rowsToRender ?? []);
        for (const op of explicitScrollOperations) {
          for (let y = op.startY; y < op.endY; y++) expandedRows.add(y);
        }
        rowsToRender = Array.from(expandedRows).sort((a, b) => a - b);
        dirtySorted = true;
        explicitScrollOperations = null;
        hiddenExplicitDirtyRows = null;
        if (isDebugEnabled()) {
          getDebugLog().render(
            preparedExplicit.blockedInterior ? " Explicit scroll ops split by interior overlay rows; falling back to region repaint" : " Explicit scroll ops could not be clipped safely; falling back to region repaint"
          );
        }
      }
    }
    const scrollRowsCandidate = rowsToRender;
    if (explicitScrollOperations && rowsToRender && (!enableScrollRegions || !fpPrevValid)) {
      const expandedRows = new Set(rowsToRender);
      for (const op of explicitScrollOperations) {
        for (let y = op.startY; y < op.endY; y++) {
          if (hiddenExplicitDirtyRows?.has(y)) continue;
          expandedRows.add(y);
        }
      }
      rowsToRender = Array.from(expandedRows).sort((a, b) => a - b);
      dirtySorted = true;
      explicitScrollOperations = null;
      hiddenExplicitDirtyRows = null;
      if (isDebugEnabled()) {
        getDebugLog().render(
          enableScrollRegions ? " Explicit scroll ops fell back to region repaint because previous fingerprints are unavailable" : " Explicit scroll ops fell back to region repaint because scroll regions are disabled"
        );
      }
    }
    const denseDirtyRows = Boolean(
      rowsToRender && rowsToRender.length >= size.rows * dirtyFullThreshold
    );
    if (denseDirtyRows) {
      rowsToRender = null;
    }
    let profiledRowCount = rowsToRender ? rowsToRender.length : size.rows;
    const useScrollRegions = enableScrollRegions && fpPrevValid && scrollRowsCandidate && scrollRowsCandidate.length >= 3 && allowInferredScrollRegions;
    let scrollHandled = false;
    if (enableScrollRegions && explicitScrollOperations && scrollRowsCandidate && fpPrevValid) {
      if (currentFP.length === prevFP.length) {
        currentFP.set(prevFP);
        currentHrefIds.set(prevHrefIds);
      }
      const insertedRows = /* @__PURE__ */ new Set();
      const explicitRowsToRender = /* @__PURE__ */ new Set();
      for (const y of scrollRowsCandidate) {
        if (hiddenExplicitDirtyRows?.has(y)) continue;
        explicitRowsToRender.add(y);
      }
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Explicit scroll ops: ${explicitScrollOperations.map((op) => `${op.startY}-${op.endY - 1}:${op.delta}`).join(", ")}`
        );
      }
      for (const op of explicitScrollOperations) {
        hasFrameOutput = true;
        frameParts.push(`\x1B[${op.startY + 1};${op.endY}r`);
        if (op.delta > 0) {
          frameParts.push(`\x1B[${op.endY};1H`);
          frameParts.push(`\x1B[${op.delta}S`);
          for (let y = op.startY; y < op.endY - op.delta; y++) {
            const dstBase = y * fpCols;
            const srcBase = (y + op.delta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x];
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x];
            }
          }
          for (let y = op.endY - op.delta; y < op.endY; y++) {
            const base = y * fpCols;
            insertedRows.add(y);
            explicitRowsToRender.add(y);
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        } else {
          const absDelta = -op.delta;
          frameParts.push(`\x1B[${op.startY + 1};1H`);
          frameParts.push(`\x1B[${absDelta}T`);
          for (let y = op.endY - 1; y >= op.startY + absDelta; y--) {
            const dstBase = y * fpCols;
            const srcBase = (y - absDelta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x];
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x];
            }
          }
          for (let y = op.startY; y < op.startY + absDelta; y++) {
            const base = y * fpCols;
            insertedRows.add(y);
            explicitRowsToRender.add(y);
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        }
        frameParts.push("\x1B[r");
      }
      const explicitDirtyRows = Array.from(explicitRowsToRender).sort((a, b) => a - b);
      const overlayDirtyRows = overlayTouchedRowSet ? explicitDirtyRows.filter((y) => overlayTouchedRowSet.has(y)) : [];
      for (const y of explicitDirtyRows) {
        const row = terminal.getRow(y);
        const overlayRow = overlayTouchedRowSet?.has(y);
        if (overlayRow || useConservativeDirtyRowRendering) {
          fingerprintRow(row, y, size.cols);
          renderRow(y, row);
          continue;
        }
        const span = (() => {
          if (insertedRows.has(y)) {
            fingerprintRow(row, y, size.cols);
            return resolveChangedSpanAgainstFill(row, y, size.cols, blankFP);
          }
          return resolveChangedSpanAgainstReference(row, y, size.cols);
        })();
        if (!span) {
          if (!skipUnchangedDirtyRows) fingerprintRow(row, y, size.cols);
          if (!skipUnchangedDirtyRows) {
            renderRow(y, row);
          }
          continue;
        }
        const rewriteTail = !insertedRows.has(y) && shouldRewriteRowTail(row, y, size.cols, currentFP);
        fingerprintRow(row, y, size.cols);
        renderRow(
          y,
          row,
          span.startX,
          rewriteTail ? row.length : span.endXExclusive,
          rewriteTail || span.endXExclusive >= row.length
        );
      }
      if (isDebugEnabled() && overlayDirtyRows.length) {
        getDebugLog().render(` Explicit scroll ops overlay rows: [${overlayDirtyRows.join(", ")}]`);
      }
      profiledRowCount = explicitDirtyRows.length;
      scrollHandled = true;
    } else if (useScrollRegions && scrollRowsCandidate) {
      for (let y = 0; y < size.rows; y++) {
        fingerprintRow(terminal.getRow(y), y, size.cols);
      }
      const shift = detectScrollShift(size.cols, scrollRowsCandidate, overlayRows);
      if (shift) {
        if (currentFP.length === prevFP.length) {
          currentFP.set(prevFP);
          currentHrefIds.set(prevHrefIds);
        }
        hasFrameOutput = true;
        if (isDebugEnabled()) {
          getDebugLog().render(
            ` Scroll region: delta=${shift.delta}, region=${shift.regionStart}-${shift.regionEnd - 1}, new rows=${shift.newRowStart}-${shift.newRowEnd - 1}`
          );
        }
        frameParts.push(`\x1B[${shift.regionStart + 1};${shift.regionEnd}r`);
        if (shift.delta > 0) {
          frameParts.push(`\x1B[${shift.regionEnd};1H`);
          frameParts.push(`\x1B[${shift.delta}S`);
        } else {
          frameParts.push(`\x1B[${shift.regionStart + 1};1H`);
          frameParts.push(`\x1B[${-shift.delta}T`);
        }
        frameParts.push("\x1B[r");
        if (shift.delta > 0) {
          for (let y = shift.regionStart; y < shift.regionEnd - shift.delta; y++) {
            const dstBase = y * fpCols;
            const srcBase = (y + shift.delta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x];
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x];
            }
          }
          for (let y = shift.regionEnd - shift.delta; y < shift.regionEnd; y++) {
            const base = y * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        } else {
          const absDelta = -shift.delta;
          for (let y = shift.regionEnd - 1; y >= shift.regionStart + absDelta; y--) {
            const dstBase = y * fpCols;
            const srcBase = (y - absDelta) * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[dstBase + x] = prevFP[srcBase + x];
              currentHrefIds[dstBase + x] = prevHrefIds[srcBase + x];
            }
          }
          for (let y = shift.regionStart; y < shift.regionStart + absDelta; y++) {
            const base = y * fpCols;
            for (let x = 0; x < size.cols; x++) {
              currentFP[base + x] = blankFP;
              currentHrefIds[base + x] = 0;
            }
          }
        }
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) {
          const row = terminal.getRow(y);
          fingerprintRow(row, y, size.cols);
          renderRow(y, row);
        }
        const extraDirtyRows = overlayRowSet ? shift.extraDirtyRows.filter(
          (y) => !overlayRowSet.has(y) || Boolean(overlayPartialRowSet?.has(y))
        ) : shift.extraDirtyRows;
        for (const y of extraDirtyRows) {
          const row = terminal.getRow(y);
          const overlayRow = overlayTouchedRowSet?.has(y);
          if (overlayRow || useConservativeDirtyRowRendering) {
            fingerprintRow(row, y, size.cols);
            renderRow(y, row);
            continue;
          }
          const span = resolveChangedSpanAgainstReference(row, y, size.cols);
          if (!span) {
            if (!skipUnchangedDirtyRows) {
              fingerprintRow(row, y, size.cols);
              renderRow(y, row);
            }
            continue;
          }
          const rewriteTail = shouldRewriteRowTail(row, y, size.cols, currentFP);
          renderRow(
            y,
            row,
            span.startX,
            rewriteTail ? row.length : span.endXExclusive,
            rewriteTail || span.endXExclusive >= row.length
          );
          fingerprintRow(row, y, size.cols);
        }
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) {
          fingerprintRow(terminal.getRow(y), y, size.cols);
        }
        const renderedRows = /* @__PURE__ */ new Set();
        for (let y = shift.newRowStart; y < shift.newRowEnd; y++) renderedRows.add(y);
        for (const y of extraDirtyRows) renderedRows.add(y);
        profiledRowCount = renderedRows.size;
        scrollHandled = true;
      }
    }
    if (!scrollHandled && denseDirtyRows && scrollRowsCandidate && useScrollRegions) {
      rowsToRender = scrollRowsCandidate;
      profiledRowCount = rowsToRender.length;
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Dense dirty rows fell back to partial render: ${rowsToRender.length} rows`
        );
      }
    }
    if (scrollHandled) ;
    else if (!rowsToRender) {
      if (isDebugEnabled()) getDebugLog().render(` Full render: ${size.rows} rows`);
      for (let y = 0; y < size.rows; y++) {
        const row = terminal.getRow(y);
        fingerprintRow(row, y, size.cols);
        renderRow(y, row);
      }
    } else {
      const overlayDirtyRows = overlayTouchedRowSet ? rowsToRender.filter((y) => overlayTouchedRowSet.has(y)) : [];
      if (isDebugEnabled()) {
        getDebugLog().render(
          ` Partial render: ${rowsToRender.length} dirty rows: [${rowsToRender.join(", ")}]${overlayDirtyRows.length ? ` (overlay-full-row: [${overlayDirtyRows.join(", ")}])` : ""}`
        );
      }
      for (const y of rowsToRender) {
        const row = terminal.getRow(y);
        fingerprintRow(row, y, size.cols);
        const overlayRow = overlayTouchedRowSet?.has(y);
        if (overlayRow || useConservativeDirtyRowRendering) {
          renderRow(y, row);
          continue;
        }
        const span = resolveChangedSpan(row, y, size.cols);
        if (!span) {
          if (!skipUnchangedDirtyRows) renderRow(y, row);
          continue;
        }
        const rewriteTail = shouldRewriteRowTail(row, y, size.cols, prevFP);
        renderRow(
          y,
          row,
          span.startX,
          rewriteTail ? row.length : span.endXExclusive,
          rewriteTail || span.endXExclusive >= row.length
        );
      }
    }
    if (!rowsToRender && lastRenderedRows > size.rows) {
      const extraRows = lastRenderedRows - size.rows;
      if (activeStyleKey !== bgKey) {
        frameParts.push(SGR_RESET, bgSeq);
        activeStyleKey = bgKey;
      }
      for (let i = 0; i < extraRows; i++) {
        hasFrameOutput = true;
        frameParts.push(rowClearToEol[size.rows + i]);
      }
    }
    if (!rowsToRender) lastRenderedRows = size.rows;
    const tmpFP = prevFP;
    prevFP = currentFP;
    currentFP = tmpFP;
    const tmpHrefIds = prevHrefIds;
    prevHrefIds = currentHrefIds;
    currentHrefIds = tmpHrefIds;
    fpPrevValid = true;
    prevOverlayBlockedRows = overlayCoverage.blockedRows;
    prevOverlayPartialRows = overlayCoverage.partialRows;
    let emittedCursorPos = null;
    if (getImeAnchor) {
      const anchor = getImeAnchor();
      if (anchor) {
        const { x, y } = clampCellToViewport(anchor, size);
        if (hasFrameOutput || x !== lastCursorX || y !== lastCursorY) {
          hasFrameOutput = true;
          emittedCursorPos = { x, y };
          frameParts.push(`\x1B[${y + 1};${x + 1}H`);
        }
      }
    }
    if (!hasFrameOutput) {
      if (isDebugEnabled()) getDebugLog().render(" No-op frame skipped");
      cliLatency?.recordStdoutNoOutput();
      return;
    }
    if (enableOsc8Links && activeStyle.href) frameParts.push(OSC8_CLOSE);
    frameParts.push(SGR_RESET);
    frameParts.push("\x1B[?7h");
    frameParts.push(!isGhostty && useSyncOutput ? SYNC_END : "");
    const frame = frameParts.join("");
    if (profiler) {
      profiler.recordRender({
        durationMs: profiler.now() - renderStart,
        rows: profiledRowCount,
        nodes: 0,
        fullRepaint: !rowsToRender && !scrollHandled,
        sorted: dirtySorted
      });
    }
    if (isDebugEnabled()) {
      const countResets = (s) => {
        let count = 0;
        let i = 0;
        while (true) {
          i = s.indexOf("\x1B[0m", i);
          if (i === -1) return count;
          count++;
          i += 4;
        }
      };
      const countCursorMoves = (s) => {
        let count = 0;
        for (let i = 0; i < s.length; i++) {
          if (s.charCodeAt(i) !== 27) continue;
          if (s[i + 1] !== "[") continue;
          let j = i + 2;
          let hasDigits = false;
          while (j < s.length) {
            const c = s.charCodeAt(j);
            if (c >= 48 && c <= 57) {
              hasDigits = true;
              j++;
              continue;
            }
            break;
          }
          if (!hasDigits || s[j] !== ";") continue;
          j++;
          hasDigits = false;
          while (j < s.length) {
            const c = s.charCodeAt(j);
            if (c >= 48 && c <= 57) {
              hasDigits = true;
              j++;
              continue;
            }
            break;
          }
          if (hasDigits && s[j] === "H") {
            count++;
            i = j;
          }
        }
        return count;
      };
      const frameSize = frame.length;
      const cursorSeqCount = countCursorMoves(frame);
      const resetCount = countResets(frame);
      const buildTime = (performance.now() - renderStart).toFixed(2);
      getDebugLog().render(
        ` Frame built: ${frameSize} bytes, ${cursorSeqCount} cursor sequences, ${resetCount} resets, ${buildTime}ms`
      );
      getDebugLog().render(
        ` Terminal: ${isGhostty ? "GHOSTTY" : "other"}, useSyncOutput: ${useSyncOutput}`
      );
    }
    const writeStart = performance.now();
    const resolveWriteMode = (frameSizeBytes) => {
      if (isGhostty) return "chunked";
      const canWriteSync = Boolean(writeSync && out2.fd === 1);
      const preferChunked = frameSizeBytes >= chunkThresholdBytes || writeEmaMs >= 24;
      if (preferChunked) return "chunked";
      if (canWriteSync && frameSizeBytes <= syncMaxBytes) return "sync";
      return "stream";
    };
    const writeMode = resolveWriteMode(frame.length);
    if (isDebugEnabled()) getDebugLog().render(`Before write()`);
    try {
      if (writeMode === "chunked") {
        if (isDebugEnabled()) {
          getDebugLog().render(
            ` Using chunked write (chunkSize=${chunkSize}, threshold=${chunkThresholdBytes}, emaMs=${writeEmaMs.toFixed(2)})`
          );
        }
        writeChunked(frame);
      } else if (writeMode === "sync" && writeSync && out2.fd === 1) {
        if (isDebugEnabled()) getDebugLog().render(` Using writeSync`);
        try {
          writeSync(1, frame);
        } catch {
          if (isDebugEnabled()) {
            getDebugLog().render(` writeSync failed, falling back to stream write`);
          }
          out2.write(frame);
        }
      } else {
        if (isDebugEnabled()) getDebugLog().render(` Using stream write`);
        out2.write(frame);
      }
      if (isDebugEnabled()) {
        const writeTime = (performance.now() - writeStart).toFixed(2);
        getDebugLog().render(` Write completed in ${writeTime}ms`);
      }
    } catch (writeError) {
      if (isDebugEnabled()) getDebugLog().error(`Write ERROR:`, writeError);
      if (!isGhostty && useSyncOutput) {
        try {
          out2.write(`\x1B[?7h${SYNC_END}`);
        } catch {
        }
      }
      throw writeError;
    }
    {
      const writeMs = performance.now() - writeStart;
      writeEmaMs = writeEmaMs === 0 ? writeMs : writeEmaMs * 0.85 + writeMs * 0.15;
      if (emittedCursorPos) {
        lastCursorX = emittedCursorPos.x;
        lastCursorY = emittedCursorPos.y;
      } else {
        lastCursorX = null;
        lastCursorY = null;
      }
      if (profiler) {
        profiler.recordWrite({
          durationMs: writeMs,
          bytes: frame.length,
          mode: writeMode === "sync" ? "sync" : writeMode === "chunked" ? "chunked" : "stream"
        });
      }
      cliLatency?.recordStdoutWrite({
        durationMs: writeMs,
        bytes: frame.length,
        mode: writeMode === "sync" ? "sync" : writeMode === "chunked" ? "chunked" : "stream"
      });
    }
    if (isDebugEnabled()) {
      const totalTime = (performance.now() - renderStart).toFixed(2);
      getDebugLog().render(` Total render time: ${totalTime}ms`);
      getDebugLog().render(`doRender() END`);
    }
  }
  function render(dirtyRows, sync, scrollOperations, skipUnchangedDirtyRows = false) {
    if (disposed) return;
    if (isDebugEnabled()) {
      getDebugLog().render(
        `render() called: dirtyRows=${dirtyRows?.length ?? "null"}, pending=${pendingRender}, elapsed=${Date.now() - lastFrameTime}ms`
      );
    }
    const isSmallSyncPatch = Boolean(
      sync && dirtyRows?.length && dirtyRows.length <= 12 && !scrollOperations?.length
    );
    if (isSmallSyncPatch) skipUnchangedDirtyRows = false;
    if (dirtyRows?.length && skipUnchangedDirtyRows && fpPrevValid && !scrollOperations?.length && dirtyRows.length < terminal.size().rows) {
      const cols2 = terminal.size().cols;
      const nextDirtyRows = dirtyRows.filter((y) => !rowMatchesPreviousFrame(y, cols2));
      if (nextDirtyRows.length === 0) {
        if (isDebugEnabled()) {
          getDebugLog().render(`Skipped unchanged dirty commit: ${dirtyRows.length} rows`);
        }
        return;
      }
      dirtyRows = nextDirtyRows;
    }
    const ensureDirtyBits = (rowCount) => {
      if (!accumulatedDirtyBits || accumulatedDirtyBits.length !== rowCount) {
        accumulatedDirtyBits = new Uint8Array(rowCount);
        accumulatedDirtyCount = 0;
        accumulatedDirtyMin = Number.POSITIVE_INFINITY;
        accumulatedDirtyMax = -1;
      }
      return accumulatedDirtyBits;
    };
    const buildAccumulatedRows = () => {
      if (accumulatedAllRows) return null;
      if (!accumulatedDirtyBits || accumulatedDirtyCount === 0) return dirtyRows ?? null;
      const out22 = [];
      out22.length = accumulatedDirtyCount;
      let outLen = 0;
      const minY = Math.max(0, accumulatedDirtyMin);
      const maxY = Math.min(accumulatedDirtyBits.length - 1, accumulatedDirtyMax);
      for (let y = minY; y <= maxY; y++) {
        if (accumulatedDirtyBits[y]) {
          out22[outLen++] = y;
        }
      }
      out22.length = outLen;
      return outLen ? out22 : null;
    };
    const buildAccumulatedScrollOperations = () => {
      return accumulatedScrollOperations?.length ? accumulatedScrollOperations : null;
    };
    const mergeScrollOperations = (next) => {
      if (!next?.length || accumulatedAllRows) return;
      const merged = accumulatedScrollOperations ? accumulatedScrollOperations.slice() : [];
      for (const op of next) {
        const startY = Math.floor(op.startY);
        const endY = Math.floor(op.endY);
        const delta = Math.trunc(op.delta);
        if (endY <= startY || delta === 0) continue;
        const existingIndex = merged.findIndex(
          (existing) => existing.startY === startY && existing.endY === endY
        );
        if (existingIndex >= 0) {
          const existing = merged[existingIndex];
          const nextDelta = existing.delta + delta;
          if (nextDelta === 0) merged.splice(existingIndex, 1);
          else merged[existingIndex] = { startY, endY, delta: nextDelta };
        } else {
          merged.push({ startY, endY, delta });
        }
      }
      accumulatedScrollOperations = merged.length ? merged : null;
    };
    if (!dirtyRows || dirtyRows.length === 0) {
      accumulatedAllRows = true;
      accumulatedDirtyBits = null;
      accumulatedDirtyCount = 0;
      accumulatedDirtyMin = Number.POSITIVE_INFINITY;
      accumulatedDirtyMax = -1;
      accumulatedScrollOperations = null;
      accumulatedSkipUnchangedDirtyRows = false;
    } else if (!accumulatedAllRows) {
      const rowCount = terminal.size().rows;
      const bits = ensureDirtyBits(rowCount);
      for (let i = 0; i < dirtyRows.length; i++) {
        const y = Math.floor(dirtyRows[i] ?? -1);
        if (y < 0 || y >= rowCount) continue;
        if (!bits[y]) {
          bits[y] = 1;
          accumulatedDirtyCount++;
          if (y < accumulatedDirtyMin) accumulatedDirtyMin = y;
          if (y > accumulatedDirtyMax) accumulatedDirtyMax = y;
        }
      }
      mergeScrollOperations(scrollOperations);
      accumulatedSkipUnchangedDirtyRows &&= skipUnchangedDirtyRows;
    }
    const now2 = Date.now();
    const elapsed = now2 - lastFrameTime;
    const queuedDelayMs = Math.max(0, MIN_FRAME_MS - elapsed);
    if (pendingRender && !sync) {
      cliLatency?.recordStdoutQueued(queuedDelayMs);
      return;
    }
    if (sync) {
      if (pendingRender) {
        pendingRender = false;
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
      }
      const rows2 = buildAccumulatedRows();
      const pendingScrolls = buildAccumulatedScrollOperations();
      cliLatency?.recordStdoutQueued(0);
      doRender(rows2, pendingScrolls, accumulatedSkipUnchangedDirtyRows);
      return;
    }
    if (elapsed >= MIN_FRAME_MS) {
      const rows2 = buildAccumulatedRows();
      const pendingScrolls = buildAccumulatedScrollOperations();
      cliLatency?.recordStdoutQueued(0);
      doRender(rows2, pendingScrolls, accumulatedSkipUnchangedDirtyRows);
    } else {
      pendingRender = true;
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        renderTimer = null;
        if (!disposed) {
          const rows2 = buildAccumulatedRows();
          const pendingScrolls = buildAccumulatedScrollOperations();
          doRender(rows2, pendingScrolls, accumulatedSkipUnchangedDirtyRows);
        }
      }, queuedDelayMs);
      cliLatency?.recordStdoutQueued(queuedDelayMs);
    }
  }
  terminal.setFingerprintFn((ch, style) => {
    return cellFingerprint(ch, style);
  });
  if (altScreen && out2.isTTY) out2.write("\x1B[?1049h");
  if (hideCursor) out2.write("\x1B[?25l");
  if (clear) {
    out2.write(`${SGR_RESET}${openBg(defaultBg)}\x1B[2J\x1B[H${SGR_RESET}`);
  }
  const off = terminal.on("commit", ({ dirtyRows, scrollOperations, sync }) => {
    if (isDebugEnabled()) {
      getDebugLog().render(
        `Commit event: dirtyRows=${dirtyRows?.length ?? "null"}, rows=${dirtyRows?.join(",") ?? "all"}${scrollOperations?.length ? `, scrollOps=${scrollOperations.map((op) => `${op.startY}-${op.endY - 1}:${op.delta}`).join("|")}` : ""}${sync ? " (sync)" : ""}`
      );
    }
    render(dirtyRows, sync, scrollOperations, true);
  });
  const resizeSource = options?.output ?? process$1.stdout;
  const canTrackResize = Boolean(
    trackResize && out2.isTTY && typeof resizeSource?.on === "function"
  );
  const onResize = () => {
    const cols2 = Number(resizeSource?.columns);
    const rows2 = Number(resizeSource?.rows);
    if (!Number.isFinite(cols2) || !Number.isFinite(rows2)) return;
    const size = terminal.size();
    if (cols2 === size.cols && rows2 === size.rows) return;
    terminal.resize(cols2, rows2);
    render();
  };
  if (canTrackResize) {
    try {
      resizeSource.on("resize", onResize);
      onResize();
    } catch {
    }
  }
  render();
  function setCursor(x, y) {
    if (disposed) return;
    const size = terminal.size();
    const { x: cx, y: cy } = clampCellToViewport(
      { cellX: x, cellY: y },
      { cols: size.cols, rows: size.rows }
    );
    out2.write(`\x1B[${cy + 1};${cx + 1}H`);
    lastCursorX = cx;
    lastCursorY = cy;
  }
  function showCursor(visible) {
    if (disposed) return;
    out2.write(visible ? "\x1B[?25h" : "\x1B[?25l");
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
    accumulatedAllRows = false;
    accumulatedDirtyBits = null;
    accumulatedDirtyCount = 0;
    accumulatedDirtyMin = Number.POSITIVE_INFINITY;
    accumulatedDirtyMax = -1;
    off();
    if (canTrackResize && typeof resizeSource?.off === "function") {
      try {
        resizeSource.off("resize", onResize);
      } catch {
      }
    } else if (canTrackResize && typeof resizeSource?.removeListener === "function") {
      try {
        resizeSource.removeListener("resize", onResize);
      } catch {
      }
    }
    if (hideCursor) out2.write("\x1B[?25h");
    if (altScreen && out2.isTTY) out2.write("\x1B[?1049l");
  }
  const updateTheme = (next) => {
    if (disposed) return;
    if ("defaultBg" in next) {
      const nextBg = next.defaultBg === null ? void 0 : next.defaultBg === "transparent" ? void 0 : next.defaultBg;
      if (nextBg !== defaultBg) defaultBg = nextBg;
    }
    if ("palette" in next) palette = next.palette ?? null;
    styleKeyCache = /* @__PURE__ */ new WeakMap();
    for (const key of Object.keys(COLOR_INDEX)) {
      if (!(key in BUILTIN_COLOR_INDEX)) delete COLOR_INDEX[key];
    }
    nextColorIdx = 17;
    fpRows = 0;
    fpPrevValid = false;
    prevOverlayBlockedRows = [];
    prevOverlayPartialRows = [];
    render();
  };
  return { render, dispose, setCursor, showCursor, updateTheme };
}
const HEADLESS_RENDERER_CAPABILITIES = Object.freeze({
  syncFlush: false,
  scrollOperations: true,
  domRows: false
});
const EMPTY_STATE = Object.freeze({
  active: false,
  anchor: null,
  focus: null,
  text: "",
  hasRange: false
});
function clampPoint(point, cols2, rows2) {
  return {
    x: Math.max(0, Math.min(Math.max(0, cols2 - 1), Math.floor(point.x))),
    y: Math.max(0, Math.min(Math.max(0, rows2 - 1), Math.floor(point.y)))
  };
}
function comparePoints(a, b) {
  return a.y - b.y || a.x - b.x;
}
function pointKey(point) {
  return `${point.x}:${point.y}`;
}
function providerPointsDiffer(a, b) {
  return Boolean(
    a && b && a.providerId === b.providerId && pointKey(a.point) !== pointKey(b.point)
  );
}
function terminalSelectionRowSpans(range, cols2, rows2) {
  if (cols2 <= 0 || rows2 <= 0) return [];
  const anchor = clampPoint(range.anchor, cols2, rows2);
  const focus = clampPoint(range.focus, cols2, rows2);
  if (pointKey(anchor) === pointKey(focus)) return [];
  const start = comparePoints(anchor, focus) <= 0 ? anchor : focus;
  const end = start === anchor ? focus : anchor;
  const spans = [];
  for (let y = start.y; y <= end.y; y++) {
    const x0 = y === start.y ? start.x : 0;
    const x1 = y === end.y ? end.x + 1 : cols2;
    if (x1 > x0) spans.push({ y, x0, x1 });
  }
  return spans;
}
function selectedRowText(row, x0, x1, cols2) {
  let out2 = "";
  for (let x = x0; x < x1; x++) {
    const cell = row[x];
    if (!cell || cell.continuation) continue;
    out2 += cell.ch || " ";
  }
  return x1 >= cols2 ? out2.trimEnd() : out2;
}
function copyPayload(text, ok, error) {
  return {
    text,
    rows: text ? text.split("\n").length : 0,
    chars: text.length,
    ok,
    ...error === void 0 ? {} : { error }
  };
}
function createTerminalSelectionController(options) {
  const state = /* @__PURE__ */ shallowRef(EMPTY_STATE);
  let range = null;
  let providerAnchor = null;
  let providerFocus = null;
  let overlayRows = /* @__PURE__ */ new Map();
  let dirtyRows = /* @__PURE__ */ new Set();
  const readOptions = () => ({
    autoCopy: true,
    copyOnMouseUp: true,
    style: { inverse: true },
    ...options.getOptions?.() ?? {}
  });
  const markDirty2 = (prev, next) => {
    const rows2 = /* @__PURE__ */ new Set();
    for (const y of prev) rows2.add(y);
    for (const y of next) rows2.add(y);
    if (rows2.size) options.onDirtyRows?.(Array.from(rows2).sort((a, b) => a - b));
  };
  const providers = () => options.getTextProviders?.() ?? [];
  const providerById = (id) => providers().find((provider) => provider.id === id) ?? null;
  const providerForCell = (point) => {
    let best = null;
    let bestArea = Infinity;
    for (const provider of providers()) {
      const rect = provider.rect;
      if (point.x < rect.x || point.y < rect.y || point.x >= rect.x + rect.w || point.y >= rect.y + rect.h) {
        continue;
      }
      const area2 = Math.max(0, rect.w) * Math.max(0, rect.h);
      if (area2 < bestArea) {
        best = provider;
        bestArea = area2;
      }
    }
    return best;
  };
  const providerPointForCell = (provider, point) => {
    const providerPoint = provider.pointForCell?.(point) ?? point;
    return providerPoint ? { providerId: provider.id, point: providerPoint } : null;
  };
  const textFromTerminalBuffer = (nextRange) => {
    const size = options.terminal.size();
    const spans = terminalSelectionRowSpans(nextRange, size.cols, size.rows);
    const lines = [];
    for (const span of spans) {
      lines.push(selectedRowText(options.terminal.getRow(span.y), span.x0, span.x1, size.cols));
    }
    return lines.join("\n");
  };
  const selectedText = () => {
    if (!range) return "";
    if (providerAnchor && providerFocus && providerAnchor.providerId === providerFocus.providerId) {
      const provider2 = providerById(providerAnchor.providerId);
      if (provider2) {
        return provider2.getText({
          anchor: providerAnchor.point,
          focus: providerFocus.point,
          mode: range.mode
        });
      }
    }
    const provider = providers().find((candidate) => candidate.canHandle(range));
    if (provider) return provider.getText(range);
    return textFromTerminalBuffer(range);
  };
  const setResolvedText = (text) => {
    if (!range || !state.value.active || state.value.text === text) return;
    state.value = { ...state.value, text };
  };
  const rebuild = (nextRange, nextProviderAnchor, nextProviderFocus) => {
    const previousRows = dirtyRows;
    const size = options.terminal.size();
    const nextOverlayRows = /* @__PURE__ */ new Map();
    const nextDirtyRows = /* @__PURE__ */ new Set();
    let hasRange = false;
    if (nextRange) {
      const selectionStyle = readOptions().style;
      const spans = terminalSelectionRowSpans(nextRange, size.cols, size.rows);
      hasRange = spans.length > 0 || providerPointsDiffer(nextProviderAnchor, nextProviderFocus);
      for (const span of spans) {
        const row = options.terminal.getRow(span.y);
        const cells = [];
        for (let x = span.x0; x < span.x1; x++) {
          const cell = row[x];
          if (!cell || cell.continuation) continue;
          const { href: _href, ...baseStyle } = cell.style;
          cells.push({
            x,
            ch: cell.ch || " ",
            style: { ...baseStyle, ...selectionStyle }
          });
        }
        nextOverlayRows.set(span.y, cells);
        nextDirtyRows.add(span.y);
      }
    }
    range = nextRange;
    providerAnchor = nextProviderAnchor;
    providerFocus = nextProviderFocus;
    overlayRows = nextOverlayRows;
    dirtyRows = nextDirtyRows;
    state.value = nextRange ? {
      active: true,
      anchor: nextRange.anchor,
      focus: nextRange.focus,
      text: "",
      hasRange
    } : EMPTY_STATE;
    markDirty2(previousRows, nextDirtyRows);
  };
  const controller = {
    state,
    start(point, startOptions) {
      const size = options.terminal.size();
      const focus = clampPoint(point, size.cols, size.rows);
      const anchor = startOptions?.extend && range?.anchor ? clampPoint(range.anchor, size.cols, size.rows) : focus;
      const anchorProvider = providerForCell(anchor);
      const focusProvider = providerForCell(focus);
      const nextProviderAnchor = startOptions?.extend && providerAnchor ? providerAnchor : anchorProvider ? providerPointForCell(anchorProvider, anchor) : null;
      const nextProviderFocus = nextProviderAnchor && focusProvider?.id === nextProviderAnchor.providerId ? providerPointForCell(focusProvider, focus) : null;
      rebuild({ anchor, focus, mode: "linear" }, nextProviderAnchor, nextProviderFocus);
    },
    update(point) {
      if (!range) return;
      const size = options.terminal.size();
      const focus = clampPoint(point, size.cols, size.rows);
      const focusProvider = providerAnchor ? providerById(providerAnchor.providerId) : null;
      rebuild(
        {
          ...range,
          focus
        },
        providerAnchor,
        focusProvider ? providerPointForCell(focusProvider, focus) : null
      );
    },
    async finish() {
      if (!range) return;
      const text = selectedText();
      if (!text) {
        controller.clear();
        return;
      }
      setResolvedText(text);
      const current = readOptions();
      if (current.autoCopy && current.copyOnMouseUp) await controller.copy();
    },
    clear() {
      if (!range && !dirtyRows.size) return;
      rebuild(null, null, null);
    },
    async copy() {
      const text = state.value.text || selectedText();
      if (!text) return false;
      setResolvedText(text);
      if (!options.clipboard.supported) {
        options.onCopy?.(copyPayload(text, false, new Error("Clipboard unavailable")));
        return false;
      }
      try {
        await options.clipboard.writeText(text);
        options.onCopy?.(copyPayload(text, true));
        return true;
      } catch (error) {
        options.onCopy?.(copyPayload(text, false, error));
        return false;
      }
    },
    paint(dirtyRowsHint) {
      const rows2 = dirtyRowsHint ?? Array.from(overlayRows.keys());
      for (const y of rows2) {
        const cells = overlayRows.get(y);
        if (!cells) continue;
        for (const cell of cells) options.overlayTerminal.put(cell.x, y, cell.ch, cell.style);
      }
    }
  };
  return controller;
}
function base64EncodeBytes(bytes) {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out2 = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = a << 16 | b << 8 | c;
    out2 += table[triple >> 18 & 63] ?? "";
    out2 += table[triple >> 12 & 63] ?? "";
    out2 += i + 1 < bytes.length ? table[triple >> 6 & 63] ?? "" : "=";
    out2 += i + 2 < bytes.length ? table[triple & 63] ?? "" : "=";
  }
  return out2;
}
function base64EncodeText(text) {
  if (typeof TextEncoder !== "undefined") return base64EncodeBytes(new TextEncoder().encode(text));
  const bin = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return base64EncodeBytes(bytes);
}
function createOsc52ClipboardProvider(options = {}) {
  const stdout = globalThis.process?.stdout;
  const write2 = options.write ?? ((sequence) => {
    stdout?.write?.(sequence);
  });
  const supported2 = options.supported ?? Boolean(options.write || stdout?.write && stdout.isTTY);
  const target = options.target ?? "c";
  return {
    supported: supported2,
    async readText() {
      if (!options.readText) throw new Error("Clipboard read not available in this runtime");
      return options.readText();
    },
    async writeText(text) {
      if (!supported2) throw new Error("Clipboard not available in this runtime");
      await write2(`\x1B]52;${target};${base64EncodeText(text)}\x07`);
    }
  };
}
function isAbsoluteRawPath(path) {
  const value = String(path ?? "").trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("\\\\")) return true;
  return /^[A-Z]:[\\/]/i.test(value);
}
function joinPreservingBackslashes(base, next) {
  const left = String(base ?? "");
  const right = String(next ?? "");
  if (!left) return right;
  if (!right) return left;
  if (isAbsoluteRawPath(right)) return right;
  if (left.endsWith("/") || left.endsWith("\\")) return `${left}${right}`;
  return `${left}/${right}`;
}
function resolveDefaultTInputPath(info) {
  const workspaceAbs = normalizePath(String(info.workspace ?? ""));
  const raw = String(info.input ?? "").replace(/\r/g, "").trim();
  if (!raw) return resolvePath(workspaceAbs, ".");
  const homeMatch = raw.match(/^~(?:[\\/](.*))?$/);
  if (homeMatch && info.homeDir) {
    const rest = homeMatch[1] ?? "";
    if (info.preserveBackslash) return joinPreservingBackslashes(info.homeDir, rest);
    return resolvePath(normalizePath(info.homeDir), rest);
  }
  if (info.preserveBackslash) {
    if (isAbsoluteRawPath(raw)) return raw;
    return joinPreservingBackslashes(workspaceAbs, raw);
  }
  const normalized = raw.replace(/\\/g, "/");
  if (isAbsolutePath(normalized)) return normalizePath(normalized);
  return resolvePath(workspaceAbs, normalized);
}
function pathToTerminalFileHref(pathLike) {
  const raw = String(pathLike ?? "").trim();
  if (!raw) return void 0;
  if (raw.startsWith("file://")) return raw;
  const normalizedRaw = raw.replace(/\\/g, "/");
  const normalized = normalizePath(normalizedRaw);
  if (!isAbsolutePath(normalized)) return void 0;
  try {
    if (/^[A-Z]:\//i.test(normalized)) {
      return new URL(`file:///${normalized}`).toString();
    }
    return new URL(`file://${normalized}`).toString();
  } catch {
    return void 0;
  }
}
const importNodeModule = new Function("specifier", "return import(specifier)");
function getProcessLike() {
  return globalThis.process;
}
function isTerminalLike() {
  const proc = getProcessLike();
  return Boolean(proc?.stdout?.isTTY) && typeof proc?.versions?.node === "string";
}
function getHomeDir() {
  const env = getProcessLike()?.env ?? {};
  return String(env.HOME || env.USERPROFILE || "");
}
function getPlatform() {
  return String(getProcessLike()?.platform || "");
}
async function loadNodeSpawn() {
  const override = globalThis.__VT_NODE_SPAWN__;
  if (typeof override === "function") return override;
  try {
    const mod = await importNodeModule("node:child_process");
    return typeof mod?.spawn === "function" ? mod.spawn : null;
  } catch {
    return null;
  }
}
function normalizeClipboardPathList(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return "";
  return text.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}
async function runClipboardCommand(cmd, args) {
  const spawn = await loadNodeSpawn();
  if (!spawn) return null;
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true
      });
      let out2 = "";
      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on?.("data", (chunk) => {
        out2 += String(chunk);
      });
      child.on?.("error", () => resolve(null));
      child.on?.("close", (code) => resolve(code === 0 ? out2 : null));
    } catch {
      resolve(null);
    }
  });
}
async function readTerminalClipboardText() {
  const platform = getPlatform();
  if (!platform) return "";
  try {
    if (platform === "darwin") {
      const filePaths = await runClipboardCommand("osascript", [
        "-e",
        "set out to {}",
        "-e",
        "try",
        "-e",
        "set copiedItems to the clipboard as «class furl»",
        "-e",
        "if class of copiedItems is list then",
        "-e",
        "repeat with copiedItem in copiedItems",
        "-e",
        "set end of out to (copiedItem as text)",
        "-e",
        "end repeat",
        "-e",
        "else",
        "-e",
        "set end of out to (copiedItems as text)",
        "-e",
        "end if",
        "-e",
        "end try",
        "-e",
        "set AppleScript's text item delimiters to linefeed",
        "-e",
        "out as text"
      ]);
      const normalizedPaths = normalizeClipboardPathList(filePaths ?? "");
      if (normalizedPaths) return normalizedPaths;
      return await runClipboardCommand("pbpaste", []) ?? "";
    }
    if (platform === "win32") {
      const clipboardScript = [
        "$files = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue",
        "if ($files -and $files.Count -gt 0) { $files | ForEach-Object { $_ }; exit 0 }",
        "$text = Get-Clipboard -Raw",
        "if ($null -ne $text) { [Console]::Out.Write($text) }"
      ].join("; ");
      const powershellArgs = ["-NoProfile", "-Command", clipboardScript];
      let text2 = await runClipboardCommand("powershell.exe", powershellArgs);
      if (text2 == null) text2 = await runClipboardCommand("powershell", powershellArgs);
      if (text2 == null) text2 = await runClipboardCommand("pwsh", powershellArgs);
      return text2 ?? "";
    }
    let text = await runClipboardCommand("wl-paste", ["--no-newline"]);
    if (text == null) {
      text = await runClipboardCommand("xclip", ["-selection", "clipboard", "-o"]);
    }
    if (text == null) text = await runClipboardCommand("xsel", ["--clipboard", "--output"]);
    return text ?? "";
  } catch {
    return "";
  }
}
function createTInputHostPlugin(adapterOrFactory) {
  return {
    name: "tinput-host",
    install(ctx) {
      const adapter = typeof adapterOrFactory === "function" ? adapterOrFactory() : adapterOrFactory;
      ctx.registerHostAdapter(adapter);
    }
  };
}
function createDefaultTInputHostAdapter() {
  return {
    isTerminalLike: isTerminalLike(),
    resolvePath(info) {
      return resolveDefaultTInputPath({
        ...info,
        homeDir: getHomeDir() || info.homeDir
      });
    },
    pathToHref: pathToTerminalFileHref,
    async readClipboardText() {
      if (!isTerminalLike()) return "";
      return readTerminalClipboardText();
    },
    async writeClipboardText(text) {
      if (!text) return false;
      const clipboard = createOsc52ClipboardProvider();
      if (!clipboard.supported) return false;
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  };
}
const defaultTInputHostPlugin = createTInputHostPlugin(
  () => createDefaultTInputHostAdapter()
);
const TerminalContextKey = Symbol("TerminalContext");
const LayoutContextKey = Symbol("LayoutContext");
const VisibilityContextKey = Symbol("VisibilityContext");
const EventZIndexContextKey = Symbol("EventZIndex");
const RenderPlaneContextKey = Symbol(
  "RenderPlane"
);
const ImeAnchorContextKey = Symbol(
  "ImeAnchor"
);
const TInputPluginsContextKey = Symbol(
  "TInputPlugins"
);
const TPathPickerProviderContextKey = Symbol("TPathPickerProvider");
const DialogContextKey = Symbol("DialogContext");
function warnDev$1(message) {
  const nodeEnv = globalThis.process?.env?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}
const TRenderPlane = /* @__PURE__ */ defineComponent({
  name: "TRenderPlane",
  props: {
    plane: {
      type: String,
      default: "default"
    }
  },
  setup(props, { slots }) {
    const parentCtx = inject(TerminalContextKey, null);
    if (!parentCtx) throw new Error("TRenderPlane is missing TerminalContext");
    const initialPlane = props.plane;
    const planeRef = /* @__PURE__ */ ref(initialPlane);
    const terminal = getPlaneTerminal(parentCtx.terminal, initialPlane);
    let warnedPlaneMutation = false;
    watch(
      () => props.plane,
      (next) => {
        if (next === initialPlane || warnedPlaneMutation) return;
        warnedPlaneMutation = true;
        warnDev$1(
          `[vue-tui] TRenderPlane.plane is immutable after mount: ${initialPlane} -> ${next}. Key TRenderPlane by plane if you need to move a subtree.`
        );
      }
    );
    const withPlane = (plane, options) => {
      const hasPlane = options && Object.prototype.hasOwnProperty.call(options, "plane");
      return {
        ...options,
        plane: hasPlane ? options.plane : plane
      };
    };
    const scheduler = {
      invalidate: (options) => parentCtx.scheduler.invalidate(withPlane(initialPlane, options)),
      flush: () => parentCtx.scheduler.flush(),
      flushNow: () => parentCtx.scheduler.flushNow(),
      configure: (options) => parentCtx.scheduler.configure(options),
      // Frame task ids remain scheduler-global even inside TRenderPlane.
      // Components should include plane/instance information in their ids
      // when they need isolation across planes.
      queueFrameTask: (task) => {
        const queuedPlane = initialPlane;
        return parentCtx.scheduler.queueFrameTask({
          ...task,
          run: (ctx) => task.run({
            ...ctx,
            invalidate: (options) => ctx.invalidate(withPlane(queuedPlane, options)),
            reportDroppedUpdates: (count) => ctx.reportDroppedUpdates?.(count),
            reportMailboxDeliveryAttempt: (attempt) => ctx.reportMailboxDeliveryAttempt?.(attempt)
          })
        });
      },
      // Cancellation uses the same scheduler-global id space as queueFrameTask.
      cancelFrameTask: (id) => parentCtx.scheduler.cancelFrameTask?.(id),
      requestLive: (reason) => parentCtx.scheduler.requestLive(reason),
      dropLive: (reason) => parentCtx.scheduler.dropLive(reason),
      isInsideFrame: () => parentCtx.scheduler.isInsideFrame()
    };
    const runtime = {
      mount: (component, runtimeProps, options) => parentCtx.runtime.mount(component, runtimeProps, {
        plane: options?.plane ?? initialPlane
      })
    };
    provide(RenderPlaneContextKey, planeRef);
    provide(TerminalContextKey, {
      ...parentCtx,
      terminal,
      scheduler,
      runtime
    });
    return () => slots.default?.() ?? null;
  }
});
const RenderStackKey = Symbol("RenderStack");
let renderPassDepth = 0;
const renderPassTextWidthCache = /* @__PURE__ */ new Map();
function withTextRenderPass(fn) {
  renderPassDepth++;
  try {
    if (renderPassDepth === 1) renderPassTextWidthCache.clear();
    return fn();
  } finally {
    renderPassDepth--;
    if (renderPassDepth === 0) renderPassTextWidthCache.clear();
  }
}
function isAscii(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) return false;
  }
  return true;
}
function needsGraphemeSegmentation(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 8205) return true;
    if (cp >= 65024 && cp <= 65039 || cp >= 917760 && cp <= 917999) return true;
    if (cp >= 768 && cp <= 879 || cp >= 6832 && cp <= 6911 || cp >= 7616 && cp <= 7679 || cp >= 8400 && cp <= 8447 || cp >= 65056 && cp <= 65071) {
      return true;
    }
    if (cp >= 127995 && cp <= 127999) return true;
    if (cp >= 127462 && cp <= 127487) return true;
  }
  return false;
}
let graphemeSegmenter = null;
try {
  graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
} catch {
  graphemeSegmenter = null;
}
function forEachGrapheme(text, cb) {
  if (!text) return;
  const seg = graphemeSegmenter;
  if (!seg || !needsGraphemeSegmentation(text)) {
    for (const ch of text) {
      const r = cb(ch);
      if (r === false) return;
    }
    return;
  }
  for (const part of seg.segment(text)) {
    const r = cb(part.segment);
    if (r === false) return;
  }
}
function sanitizeInlineText(text) {
  if (!text) return "";
  if (!/[\n\r\t]/.test(text)) return text;
  return text.replace(/[\n\r\t]/g, " ");
}
function sanitizeTextBlock(text) {
  if (!text) return "";
  if (!/[\t\x00-\x08\x0B-\x1F\x7F]/.test(text)) return text;
  const out2 = [];
  out2.length = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 13)
      continue;
    if (cp === 9) {
      out2.push(" ");
      continue;
    }
    if (cp <= 31 && cp !== 10 || cp === 127) continue;
    out2.push(ch);
  }
  return out2.join("");
}
function textCellWidth(text) {
  if (!text) return 0;
  if (isAscii(text)) return text.length;
  if (renderPassDepth > 0) {
    const cached2 = renderPassTextWidthCache.get(text);
    if (cached2 != null) return cached2;
  }
  const cached = textWidthCacheGet(text);
  if (cached != null) return cached;
  let cells = 0;
  forEachGrapheme(text, (g) => {
    cells += charCellWidth(g);
  });
  if (renderPassDepth > 0) renderPassTextWidthCache.set(text, cells);
  textWidthCacheSet(text, cells);
  return cells;
}
const spaceCache = /* @__PURE__ */ new Map();
const MAX_CACHED_SPACES = 256;
function spaces(count) {
  count = Math.max(0, Math.floor(count));
  if (count === 0) return "";
  const cached = spaceCache.get(count);
  if (cached) return cached;
  const v = " ".repeat(count);
  if (spaceCache.size >= MAX_CACHED_SPACES) spaceCache.clear();
  spaceCache.set(count, v);
  return v;
}
const repeatCharCache = /* @__PURE__ */ new Map();
const MAX_REPEAT_CHAR_KEYS = 8;
const MAX_CACHED_REPEAT_CHAR = 256;
function repeatChar(ch, count) {
  count = Math.max(0, Math.floor(count));
  if (count === 0) return "";
  let bucket = repeatCharCache.get(ch);
  if (!bucket) {
    if (repeatCharCache.size >= MAX_REPEAT_CHAR_KEYS) repeatCharCache.clear();
    bucket = /* @__PURE__ */ new Map();
    repeatCharCache.set(ch, bucket);
  }
  const cached = bucket.get(count);
  if (cached) return cached;
  const v = ch.repeat(count);
  if (bucket.size >= MAX_CACHED_REPEAT_CHAR) bucket.clear();
  bucket.set(count, v);
  return v;
}
function sliceByCells(text, maxCells) {
  maxCells = Math.max(0, Math.floor(maxCells));
  if (maxCells <= 0) return "";
  if (text && isAscii(text)) return text.slice(0, maxCells);
  const out2 = [];
  let cells = 0;
  forEachGrapheme(text, (g) => {
    const w = charCellWidth(g);
    if (cells + w > maxCells) return false;
    out2.push(g);
    cells += w;
    return void 0;
  });
  return out2.length ? out2.join("") : "";
}
function sliceByCellsRange(text, startCells, endCells) {
  startCells = Math.max(0, Math.floor(startCells));
  endCells = Math.max(0, Math.floor(endCells));
  if (endCells <= startCells) return "";
  if (!text) return "";
  if (isAscii(text)) return text.slice(startCells, endCells);
  const out2 = [];
  let cells = 0;
  forEachGrapheme(text, (g) => {
    const w = charCellWidth(g);
    const next = cells + w;
    if (cells >= endCells) return false;
    if (next <= startCells) {
      cells = next;
      return void 0;
    }
    if (cells < startCells && next > startCells) {
      out2.push(spaces(Math.min(next, endCells) - startCells));
      cells = next;
      return void 0;
    }
    if (next > endCells) {
      out2.push(spaces(endCells - cells));
      return false;
    }
    out2.push(g);
    cells = next;
    return void 0;
  });
  return out2.length ? out2.join("") : "";
}
function padEndByCells(text, width) {
  width = Math.max(0, Math.floor(width));
  const cells = text && isAscii(text) ? text.length : textCellWidth(text);
  if (cells >= width) return text;
  return `${text}${spaces(width - cells)}`;
}
const inlineLineCacheByWidth = /* @__PURE__ */ new Map();
const wrapCacheByWidth = /* @__PURE__ */ new Map();
const MAX_WRAP_CACHE_BUCKETS = 32;
const MAX_WRAP_CACHE_PER_WIDTH = 256;
function getWrapBucket(width) {
  let bucket = wrapCacheByWidth.get(width);
  if (bucket) return bucket;
  if (wrapCacheByWidth.size >= MAX_WRAP_CACHE_BUCKETS) wrapCacheByWidth.clear();
  bucket = /* @__PURE__ */ new Map();
  wrapCacheByWidth.set(width, bucket);
  return bucket;
}
const textWidthCache = /* @__PURE__ */ new Map();
const MAX_TEXT_WIDTH_CACHE = 1024;
function textWidthCacheGet(text) {
  const cached = textWidthCache.get(text);
  if (cached == null) return null;
  textWidthCache.delete(text);
  textWidthCache.set(text, cached);
  return cached;
}
function textWidthCacheSet(text, cells) {
  textWidthCache.set(text, cells);
  if (textWidthCache.size > MAX_TEXT_WIDTH_CACHE) {
    const firstKey = textWidthCache.keys().next().value;
    if (firstKey != null) textWidthCache.delete(firstKey);
  }
}
function clearTextCaches() {
  wrapCacheByWidth.clear();
  spaceCache.clear();
  repeatCharCache.clear();
  textWidthCache.clear();
  inlineLineCacheByWidth.clear();
}
function wrapByCells(text, width) {
  width = Math.max(1, Math.floor(width));
  const bucket = getWrapBucket(width);
  if (text && isAscii(text)) {
    const cached2 = bucket.get(text);
    if (cached2) return cached2;
    const out22 = [];
    for (const rawLine of text.replace(/\r/g, "").split("\n")) {
      if (rawLine.length === 0) {
        out22.push("");
        continue;
      }
      for (let i = 0; i < rawLine.length; i += width) out22.push(rawLine.slice(i, i + width));
    }
    if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
    bucket.set(text, out22);
    return out22;
  }
  const cached = bucket.get(text);
  if (cached) return cached;
  const out2 = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    if (rawLine.length === 0) {
      out2.push("");
      continue;
    }
    const seg = graphemeSegmenter;
    if (seg && needsGraphemeSegmentation(rawLine)) {
      let lineStart = 0;
      let cells = 0;
      for (const part of seg.segment(rawLine)) {
        const g = part.segment;
        const gIdx = part.index;
        const w = charCellWidth(g);
        if (cells > 0 && cells + w > width) {
          out2.push(rawLine.slice(lineStart, gIdx));
          lineStart = gIdx;
          cells = 0;
        }
        cells += w;
        if (cells >= width) {
          const end = gIdx + g.length;
          out2.push(rawLine.slice(lineStart, end));
          lineStart = end;
          cells = 0;
        }
      }
      if (lineStart < rawLine.length) out2.push(rawLine.slice(lineStart));
    } else {
      let lineStart = 0;
      let pos = 0;
      let cells = 0;
      for (const ch of rawLine) {
        const w = charCellWidth(ch);
        if (cells > 0 && cells + w > width) {
          out2.push(rawLine.slice(lineStart, pos));
          lineStart = pos;
          cells = 0;
        }
        pos += ch.length;
        cells += w;
        if (cells >= width) {
          out2.push(rawLine.slice(lineStart, pos));
          lineStart = pos;
          cells = 0;
        }
      }
      if (lineStart < rawLine.length) out2.push(rawLine.slice(lineStart));
    }
  }
  const res = out2.length ? out2 : [""];
  if (bucket.size >= MAX_WRAP_CACHE_PER_WIDTH) bucket.clear();
  bucket.set(text, res);
  return res;
}
const renderMgrDebugLog = createDebugLogger(isDebugEnabled());
const ROW_BUCKET_CANDIDATE_RATIO_FALLBACK = 0.6;
const ROW_BUCKET_DIRTY_RATIO_FALLBACK = 0.6;
const ROW_BUCKET_DIRTY_RATIO_MIN_ROWS = 16;
const LARGE_RECT_BUCKET_RATIO = 0.5;
function warnDev(message) {
  const nodeEnv = globalThis.process?.env?.NODE_ENV;
  if (nodeEnv === "production") return;
  console.warn(message);
}
let nextStackId = 0;
let nextNodeId = 0;
function createDirtyPlaneState(rows2) {
  return {
    allRowsDirty: false,
    dirtyRowBits: new Uint8Array(rows2),
    dirtyRowCount: 0,
    dirtyMinY: Number.POSITIVE_INFINITY,
    dirtyMaxY: -1
  };
}
function isEmptyRect(rect) {
  return rect.w <= 0 || rect.h <= 0;
}
function sameRect(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
function createRenderManager(terminal) {
  let orderCounter = 0;
  const nodes = /* @__PURE__ */ new Map();
  const planeDirtyStates = /* @__PURE__ */ new Map();
  const initialSize = terminal.size();
  let terminalRows = initialSize.rows;
  let allRows = Array.from({ length: terminalRows }, (_, index) => index);
  let sortedNodes = [];
  let sortedNodesByPlane = /* @__PURE__ */ new Map();
  let sortedNodeIndexById = /* @__PURE__ */ new Map();
  let sortedPlaneNodeIndexById = /* @__PURE__ */ new Map();
  let sortedDirty = true;
  const rowBuckets = /* @__PURE__ */ new Map();
  const globalNodeIdsByPlane = /* @__PURE__ */ new Map();
  const largeNodeIdsByPlane = /* @__PURE__ */ new Map();
  let renderedRowsScratch = new Uint8Array(terminalRows);
  const touchedRenderedRowsScratch = [];
  const dirtyRowsScratch = [];
  let candidateMarksScratch = new Uint32Array(0);
  let candidateGeneration = 1;
  const candidateNodesScratch = [];
  const warnedLocalDirtyRows = /* @__PURE__ */ new Set();
  const stackPathCache = /* @__PURE__ */ new WeakMap();
  const profiler = createTuiProfiler("render-manager");
  terminal.on("resize", ({ rows: rows2 }) => {
    terminalRows = rows2;
    allRows = Array.from({ length: terminalRows }, (_, index) => index);
    for (const state of planeDirtyStates.values()) {
      state.allRowsDirty = true;
      state.dirtyRowBits = new Uint8Array(terminalRows);
      state.dirtyRowCount = 0;
      state.dirtyMinY = Number.POSITIVE_INFINITY;
      state.dirtyMaxY = -1;
    }
    rebuildRowBuckets();
    clearTextCaches();
  });
  const rootStack = Object.freeze({
    id: `s${nextStackId++}`,
    parent: null,
    zIndex: 0,
    order: 0
  });
  function getDirtyState(plane) {
    let state = planeDirtyStates.get(plane);
    if (!state) {
      state = createDirtyPlaneState(terminalRows);
      planeDirtyStates.set(plane, state);
    }
    return state;
  }
  function clearDirtyState(state) {
    state.allRowsDirty = false;
    state.dirtyRowBits.fill(0);
    state.dirtyRowCount = 0;
    state.dirtyMinY = Number.POSITIVE_INFINITY;
    state.dirtyMaxY = -1;
  }
  function createStack(parent, zIndex) {
    return Object.freeze({
      id: `s${nextStackId++}`,
      parent,
      zIndex: Number.isFinite(zIndex) ? zIndex : 0,
      order: ++orderCounter
    });
  }
  function rectToYBounds(rect) {
    if (!rect) return { y0: 0, y1: 0 };
    const y0 = Math.floor(rect.y);
    const y1 = Math.max(y0, Math.floor(rect.y + rect.h));
    return { y0, y1 };
  }
  function removeFromRowBuckets(node) {
    const largeIds = largeNodeIdsByPlane.get(node.plane);
    largeIds?.delete(node.id);
    if (largeIds?.size === 0) largeNodeIdsByPlane.delete(node.plane);
    if (!node.rect) {
      const globalIds = globalNodeIdsByPlane.get(node.plane);
      globalIds?.delete(node.id);
      if (globalIds?.size === 0) globalNodeIdsByPlane.delete(node.plane);
      return;
    }
    const buckets = rowBuckets.get(node.plane);
    if (!buckets) return;
    const startY = Math.max(0, node.rectY0);
    const endY = Math.min(terminalRows, node.rectY1);
    for (let y = startY; y < endY; y++) {
      const ids = buckets.get(y);
      ids?.delete(node.id);
      if (ids?.size === 0) buckets.delete(y);
    }
    if (buckets.size === 0) rowBuckets.delete(node.plane);
  }
  function addToRowBuckets(node) {
    if (!node.rect) {
      let globalIds = globalNodeIdsByPlane.get(node.plane);
      if (!globalIds) {
        globalIds = /* @__PURE__ */ new Set();
        globalNodeIdsByPlane.set(node.plane, globalIds);
      }
      globalIds.add(node.id);
      return;
    }
    const startY = Math.max(0, node.rectY0);
    const endY = Math.min(terminalRows, node.rectY1);
    if (endY <= startY) return;
    if (endY - startY >= terminalRows * LARGE_RECT_BUCKET_RATIO) {
      let largeIds = largeNodeIdsByPlane.get(node.plane);
      if (!largeIds) {
        largeIds = /* @__PURE__ */ new Set();
        largeNodeIdsByPlane.set(node.plane, largeIds);
      }
      largeIds.add(node.id);
      return;
    }
    let buckets = rowBuckets.get(node.plane);
    if (!buckets) {
      buckets = /* @__PURE__ */ new Map();
      rowBuckets.set(node.plane, buckets);
    }
    for (let y = startY; y < endY; y++) {
      let ids = buckets.get(y);
      if (!ids) {
        ids = /* @__PURE__ */ new Set();
        buckets.set(y, ids);
      }
      ids.add(node.id);
    }
  }
  function rebuildRowBuckets() {
    rowBuckets.clear();
    globalNodeIdsByPlane.clear();
    largeNodeIdsByPlane.clear();
    for (const node of nodes.values()) addToRowBuckets(node);
  }
  function shouldPromoteToFullPlaneDirty(dirtyRows, planeNodes) {
    return planeNodes > 1 && dirtyRows >= ROW_BUCKET_DIRTY_RATIO_MIN_ROWS && terminalRows > 0 && dirtyRows / terminalRows >= ROW_BUCKET_DIRTY_RATIO_FALLBACK && dirtyRows >= planeNodes * ROW_BUCKET_DIRTY_RATIO_FALLBACK;
  }
  function ensureRenderedRowsScratch() {
    if (renderedRowsScratch.length !== terminalRows) {
      renderedRowsScratch = new Uint8Array(terminalRows);
      touchedRenderedRowsScratch.length = 0;
    }
    return renderedRowsScratch;
  }
  function clearRenderedRowsScratch(rows2) {
    for (const y of touchedRenderedRowsScratch) rows2[y] = 0;
    touchedRenderedRowsScratch.length = 0;
  }
  function markRenderedRow(rows2, y) {
    if (y < 0 || y >= terminalRows || rows2[y] === 1) return false;
    rows2[y] = 1;
    touchedRenderedRowsScratch.push(y);
    return true;
  }
  function warnIfRowsLookLocal(node, rows2) {
    if (!node.rect || node.rectY0 === 0 || warnedLocalDirtyRows.has(node.id)) return;
    const height = node.rectY1 - node.rectY0;
    if (height <= 0) return;
    let sawRow = false;
    let sawAboveRect = false;
    for (let i = 0; i < rows2.length; i++) {
      const y = Math.floor(rows2[i] ?? -1);
      if (!Number.isFinite(y) || y < 0 || y >= height) return;
      sawRow = true;
      if (y < node.rectY0) sawAboveRect = true;
    }
    if (!sawRow || !sawAboveRect) return;
    warnedLocalDirtyRows.add(node.id);
    warnDev(
      `[vue-tui] RenderManager markDirtyRows()/dirtyRowsHint rows must be absolute terminal rows for the node's plane. Received rows that look local to a node at y=${node.rectY0}; these rows will be ignored for this node. Add the node y offset before marking dirty rows.`
    );
  }
  function ensureCandidateMarks(size) {
    if (candidateMarksScratch.length < size) {
      candidateMarksScratch = new Uint32Array(size);
    }
    return candidateMarksScratch;
  }
  function beginCandidateCollection(planeNodes) {
    candidateNodesScratch.length = 0;
    const marks = ensureCandidateMarks(planeNodes.length);
    candidateGeneration++;
    if (candidateGeneration === 4294967295) {
      marks.fill(0);
      candidateGeneration = 1;
    }
    return marks;
  }
  function markCandidateNode(planeNodes, marks, node) {
    if (!node) return;
    const index = sortedPlaneNodeIndexById.get(node.id);
    if (index == null || planeNodes[index]?.id !== node.id) return;
    if (marks[index] === candidateGeneration) return;
    marks[index] = candidateGeneration;
    candidateNodesScratch.push(node);
  }
  function sortCandidateNodesByPlaneOrder() {
    for (let i = 1; i < candidateNodesScratch.length; i++) {
      const node = candidateNodesScratch[i];
      const nodeIndex = sortedPlaneNodeIndexById.get(node.id) ?? 0;
      let j = i - 1;
      while (j >= 0 && (sortedPlaneNodeIndexById.get(candidateNodesScratch[j].id) ?? 0) > nodeIndex) {
        candidateNodesScratch[j + 1] = candidateNodesScratch[j];
        j--;
      }
      candidateNodesScratch[j + 1] = node;
    }
  }
  function markRect(plane, rect) {
    const state = getDirtyState(plane);
    if (!rect) {
      state.allRowsDirty = true;
      return;
    }
    const y0 = Math.floor(rect.y);
    const y1 = Math.max(y0, Math.floor(rect.y + rect.h));
    const startY = Math.max(0, y0);
    const endY = Math.min(terminalRows, y1);
    const span = endY - startY;
    if (span > 0 && span >= Math.floor(terminalRows * 0.75)) {
      state.allRowsDirty = true;
      return;
    }
    for (let y = startY; y < endY; y++) {
      if (state.dirtyRowBits[y] === 0) {
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }
  }
  function markRowsForNode(node, rows2) {
    if (!rows2.length) return false;
    warnIfRowsLookLocal(node, rows2);
    const state = getDirtyState(node.plane);
    let accepted = false;
    for (let i = 0; i < rows2.length; i++) {
      const y = Math.floor(rows2[i] ?? -1);
      if (!Number.isFinite(y)) continue;
      if (y < 0 || y >= terminalRows) continue;
      if (node.rect && (y < node.rectY0 || y >= node.rectY1)) continue;
      accepted = true;
      if (state.dirtyRowBits[y] === 0) {
        state.dirtyRowBits[y] = 1;
        state.dirtyRowCount++;
        if (y < state.dirtyMinY) state.dirtyMinY = y;
        if (y > state.dirtyMaxY) state.dirtyMaxY = y;
      }
    }
    return accepted;
  }
  function unsafeScrollPlaneRows(plane, startY, endY, delta) {
    scrollPlaneRows(terminal, plane, startY, endY, delta);
  }
  function invalidatePlane(plane) {
    getDirtyState(plane).allRowsDirty = true;
  }
  function register(node) {
    const id = `r${nextNodeId++}`;
    const rect = node.rect ?? null;
    const { y0, y1 } = rectToYBounds(rect);
    const full = Object.freeze({
      id,
      stack: node.stack,
      plane: node.plane ?? "default",
      zIndex: node.zIndex ?? 0,
      order: ++orderCounter,
      rect,
      rectY0: y0,
      rectY1: y1,
      paint: node.paint
    });
    nodes.set(id, full);
    addToRowBuckets(full);
    markRect(full.plane, full.rect);
    sortedDirty = true;
    return full;
  }
  function update(id, next) {
    const prev = nodes.get(id);
    if (!prev) return;
    const sortChanged = next.stack && next.stack !== prev.stack || typeof next.zIndex === "number" && next.zIndex !== prev.zIndex;
    const nextPlane = next.plane ?? prev.plane;
    const planeChanged = nextPlane !== prev.plane;
    const hasRect = Object.prototype.hasOwnProperty.call(next, "rect");
    const nextRect = hasRect ? next.rect ?? null : prev.rect;
    const rectChanged = !sameRect(prev.rect, nextRect);
    const bucketChanged = planeChanged || rectChanged;
    const { y0, y1 } = rectToYBounds(nextRect);
    const dirtyRowsHint = next.dirtyRowsHint;
    const canUseDirtyRowsHint = !sortChanged && !rectChanged && nextPlane === prev.plane && dirtyRowsHint != null && dirtyRowsHint.length > 0;
    if (canUseDirtyRowsHint) {
      markRowsForNode(prev, dirtyRowsHint);
    } else {
      markRect(prev.plane, prev.rect);
      markRect(nextPlane, nextRect);
    }
    if (bucketChanged) removeFromRowBuckets(prev);
    const full = Object.freeze({
      ...prev,
      stack: next.stack ?? prev.stack,
      plane: nextPlane,
      zIndex: next.zIndex ?? prev.zIndex,
      rect: nextRect,
      rectY0: y0,
      rectY1: y1,
      paint: next.paint ?? prev.paint
    });
    nodes.set(id, full);
    if (bucketChanged) addToRowBuckets(full);
    if (sortChanged || planeChanged) {
      sortedDirty = true;
    } else if (!sortedDirty) {
      const sortedIndex = sortedNodeIndexById.get(id);
      if (sortedIndex != null) sortedNodes[sortedIndex] = full;
      const planeNodes = sortedNodesByPlane.get(nextPlane);
      const planeIndex = sortedPlaneNodeIndexById.get(id);
      if (planeNodes && planeIndex != null) planeNodes[planeIndex] = full;
    }
  }
  function markDirtyRows(id, rows2) {
    if (!rows2.length) return false;
    const node = nodes.get(id);
    if (!node) return false;
    return markRowsForNode(node, rows2);
  }
  function unregister(id) {
    const prev = nodes.get(id);
    if (prev) {
      markRect(prev.plane, prev.rect);
      removeFromRowBuckets(prev);
      warnedLocalDirtyRows.delete(id);
    }
    nodes.delete(id);
    sortedDirty = true;
  }
  function getStackPath(stack2) {
    const cached = stackPathCache.get(stack2);
    if (cached) return cached;
    const out2 = [];
    let cur = stack2;
    while (cur) {
      out2.push({ zIndex: cur.zIndex, order: cur.order, id: cur.id });
      cur = cur.parent;
    }
    out2.reverse();
    stackPathCache.set(stack2, out2);
    return out2;
  }
  function compareNodes(a, b) {
    if (a.id === b.id) return 0;
    const ap = getStackPath(a.stack);
    const bp = getStackPath(b.stack);
    const stackLen = Math.min(ap.length, bp.length);
    for (let i = 0; i < stackLen; i++) {
      const as = ap[i];
      const bs = bp[i];
      if (as.id === bs.id) continue;
      if (as.zIndex !== bs.zIndex) return as.zIndex - bs.zIndex;
      return as.order - bs.order;
    }
    if (ap.length !== bp.length) return ap.length - bp.length;
    if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
    return a.order - b.order;
  }
  function hasPendingDirtyWork(requestedPlanes) {
    for (const plane of requestedPlanes) {
      const state = planeDirtyStates.get(plane);
      if (!state) continue;
      if (state.allRowsDirty || state.dirtyRowCount > 0) return true;
    }
    return false;
  }
  function render(options) {
    const renderStart = profiler?.now();
    const activePlanes = options?.activePlanes ?? null;
    const requestedPlanes = activePlanes ?? TERMINAL_RENDER_PLANES;
    const env = globalThis.process?.env;
    function intersectsDirtyRows(y0, y1, rows2) {
      if (y1 <= y0 || rows2.length === 0) return false;
      let lo = 0;
      let hi = rows2.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if ((rows2[mid] ?? 0) < y0) lo = mid + 1;
        else hi = mid;
      }
      const y = rows2[lo];
      return y != null && y < y1;
    }
    if (env?.DIMCODE_DEBUG === "1") renderMgrDebugLog.render("[RENDER-MANAGER] render() called");
    if (!hasPendingDirtyWork(requestedPlanes)) {
      if (env?.DIMCODE_DEBUG === "1")
        renderMgrDebugLog.render("[RENDER-MANAGER] render() skipped (no dirty rows)");
      return null;
    }
    const sortedThisRender = sortedDirty;
    if (sortedDirty) {
      sortedNodes = Array.from(nodes.values()).sort(compareNodes);
      sortedNodesByPlane = /* @__PURE__ */ new Map();
      sortedNodeIndexById = /* @__PURE__ */ new Map();
      sortedPlaneNodeIndexById = /* @__PURE__ */ new Map();
      for (let i = 0; i < sortedNodes.length; i++) {
        const node = sortedNodes[i];
        sortedNodeIndexById.set(node.id, i);
        const planeNodes = sortedNodesByPlane.get(node.plane);
        if (planeNodes) {
          sortedPlaneNodeIndexById.set(node.id, planeNodes.length);
          planeNodes.push(node);
        } else {
          sortedPlaneNodeIndexById.set(node.id, 0);
          sortedNodesByPlane.set(node.plane, [node]);
        }
      }
      sortedDirty = false;
    }
    let scannedNodes = 0;
    let paintedNodes = 0;
    let fullRepaint = false;
    const processedPlanes = [];
    const rowBucketFallbacks = [];
    const renderedRows = ensureRenderedRowsScratch();
    clearRenderedRowsScratch(renderedRows);
    let renderedRowCount = 0;
    const markRenderedRows = (rows2) => {
      if (rows2 === null) {
        for (let y = 0; y < terminalRows; y++) {
          if (markRenderedRow(renderedRows, y)) renderedRowCount++;
        }
        return;
      }
      for (const y of rows2) {
        if (markRenderedRow(renderedRows, y)) renderedRowCount++;
      }
    };
    withTextRenderPass(
      () => terminal.batch(() => {
        for (const plane of requestedPlanes) {
          const state = planeDirtyStates.get(plane);
          if (!state || !state.allRowsDirty && state.dirtyRowCount === 0) continue;
          const planeNodes = sortedNodesByPlane.get(plane) ?? [];
          let isFullPlaneRepaint = state.allRowsDirty;
          let rows2 = allRows;
          if (!isFullPlaneRepaint && shouldPromoteToFullPlaneDirty(state.dirtyRowCount, planeNodes.length)) {
            isFullPlaneRepaint = true;
            state.allRowsDirty = true;
            rowBucketFallbacks.push({
              plane,
              reason: "dirty-ratio",
              dirtyRows: state.dirtyRowCount,
              planeNodes: planeNodes.length
            });
          }
          if (!isFullPlaneRepaint) {
            dirtyRowsScratch.length = 0;
            rows2 = dirtyRowsScratch;
            const startY = Number.isFinite(state.dirtyMinY) ? state.dirtyMinY : 0;
            const endY = state.dirtyMaxY;
            for (let y = startY; y <= endY; y++) {
              if (state.dirtyRowBits[y] === 1) rows2.push(y);
            }
          }
          if (!isFullPlaneRepaint && rows2.length === 0) {
            clearDirtyState(state);
            continue;
          }
          resetPlaneRowsForRender(terminal, plane, isFullPlaneRepaint ? null : rows2);
          const paintRows = isFullPlaneRepaint ? void 0 : rows2;
          let needsIntersectFilter = false;
          const candidateNodes = isFullPlaneRepaint ? planeNodes : (() => {
            const marks = beginCandidateCollection(planeNodes);
            const buckets = rowBuckets.get(plane);
            for (const y of rows2) {
              const rowIds = buckets?.get(y);
              if (!rowIds) continue;
              for (const id of rowIds) {
                markCandidateNode(planeNodes, marks, nodes.get(id));
              }
            }
            const largeIds = largeNodeIdsByPlane.get(plane);
            if (largeIds) {
              for (const id of largeIds) {
                const node = nodes.get(id);
                if (!node) continue;
                if (intersectsDirtyRows(node.rectY0, node.rectY1, rows2)) {
                  markCandidateNode(planeNodes, marks, node);
                }
              }
            }
            const globalIds = globalNodeIdsByPlane.get(plane);
            if (globalIds) {
              for (const id of globalIds) markCandidateNode(planeNodes, marks, nodes.get(id));
            }
            sortCandidateNodesByPlaneOrder();
            if (candidateNodesScratch.length < planeNodes.length && candidateNodesScratch.length > planeNodes.length * ROW_BUCKET_CANDIDATE_RATIO_FALLBACK) {
              needsIntersectFilter = true;
              rowBucketFallbacks.push({
                plane,
                reason: "candidate-ratio",
                dirtyRows: rows2.length,
                planeNodes: planeNodes.length,
                candidates: candidateNodesScratch.length
              });
              return planeNodes;
            }
            return candidateNodesScratch;
          })();
          scannedNodes += candidateNodes.length;
          for (const node of candidateNodes) {
            if (!node.rect) {
              node.paint(paintRows);
              paintedNodes++;
              continue;
            }
            if (isEmptyRect(node.rect)) continue;
            if (needsIntersectFilter && !intersectsDirtyRows(node.rectY0, node.rectY1, rows2)) {
              continue;
            }
            node.paint(paintRows);
            paintedNodes++;
          }
          processedPlanes.push(plane);
          fullRepaint ||= isFullPlaneRepaint;
          markRenderedRows(isFullPlaneRepaint ? null : rows2);
          clearDirtyState(state);
        }
      })
    );
    if (processedPlanes.length === 0) return null;
    if (profiler && renderStart != null) {
      profiler.recordRender({
        durationMs: profiler.now() - renderStart,
        rows: renderedRowCount,
        nodes: scannedNodes,
        fullRepaint,
        sorted: sortedThisRender,
        activePlanes: processedPlanes
      });
    }
    if (env?.DIMCODE_DEBUG === "1")
      renderMgrDebugLog.render("[RENDER-MANAGER] terminal.batch() completed");
    const stats = {
      rows: renderedRowCount,
      scannedNodes,
      paintedNodes,
      candidatePlanes: processedPlanes
    };
    if (rowBucketFallbacks.length) {
      return {
        ...stats,
        rowBucketFallbacks
      };
    }
    return stats;
  }
  return {
    rootStack,
    createStack,
    invalidatePlane,
    unsafeScrollPlaneRows,
    register,
    update,
    markDirtyRows,
    unregister,
    render
  };
}
const EMPTY_FRAME_TASK_RUN_STATS = Object.freeze({
  frameTaskCount: 0,
  coalescedFrameTasks: 0,
  frameTaskQueueDepthBeforeRun: 0,
  frameTaskQueueDepthAfterRun: 0,
  remainingFrameTasks: 0,
  droppedUpdates: 0,
  reason: "unknown",
  sync: false,
  requestMore: false
});
const SCHEDULED_SENTINEL = Symbol("scheduled-frame-task");
const HIGH_TASK_WARN_THRESHOLD = 128;
const PRIORITY_RANK = {
  low: 0,
  normal: 1,
  high: 2
};
function normalizePriority(priority) {
  return priority ?? "normal";
}
function mergePriority$1(prev, next) {
  return PRIORITY_RANK[next] > PRIORITY_RANK[prev] ? next : prev;
}
function mergeFrameTasks(prev, next) {
  return {
    ...next,
    reason: mergeFramePerfReason(prev.reason, next.reason),
    priority: mergePriority$1(normalizePriority(prev.priority), normalizePriority(next.priority)),
    sync: prev.sync === true || next.sync === true
  };
}
function orderedQueuedTasks(tasks) {
  const high = [];
  const normal = [];
  const low = [];
  for (const entry of tasks) {
    const priority = normalizePriority(entry.task.priority);
    if (priority === "high") high.push(entry);
    else if (priority === "low") low.push(entry);
    else normal.push(entry);
  }
  return [...high, ...normal, ...low];
}
function highPriorityTaskCount(tasks) {
  let count = 0;
  for (const entry of tasks) {
    if (normalizePriority(entry.task.priority) === "high") count++;
  }
  return count;
}
function createSchedulerFrameTasks(options) {
  let targetFps = 30;
  let maxFps = 60;
  let frameBudgetMs = 8;
  let insideFrame = false;
  let frameTaskFrameId = 0;
  let frameTaskToken = 0;
  let scheduledFrame = null;
  let scheduledLiveOnly = false;
  let runningScheduledFrame = false;
  let pendingScheduleMicrotask = false;
  let pendingScheduleRequestMore = false;
  const frameTasksById = /* @__PURE__ */ new Map();
  const anonymousFrameTasks = [];
  const liveReasons = /* @__PURE__ */ new Map();
  function hasPendingFrameTasks() {
    return frameTasksById.size > 0 || anonymousFrameTasks.length > 0;
  }
  function remainingFrameTasks() {
    return frameTasksById.size + anonymousFrameTasks.length;
  }
  function liveIntervalMs() {
    const fps = Math.max(1, Math.min(maxFps, targetFps));
    return 1e3 / fps;
  }
  function taskIntervalMs() {
    return 1e3 / Math.max(1, maxFps);
  }
  function requestFrame(cb, liveOnly) {
    const g = globalThis;
    if (!liveOnly && typeof g.requestAnimationFrame === "function" && typeof g.cancelAnimationFrame === "function") {
      return { kind: "raf", id: g.requestAnimationFrame(cb) };
    }
    const id = setTimeout(() => cb(framePerfNow()), liveOnly ? liveIntervalMs() : taskIntervalMs());
    return { kind: "timer", id };
  }
  function cancelFrame(handle) {
    if (handle.kind === "raf") {
      globalThis.cancelAnimationFrame?.(handle.id);
      return;
    }
    clearTimeout(handle.id);
  }
  function scheduleFrame(liveOnly) {
    if (!options.isActive()) return;
    if (scheduledFrame) {
      if (scheduledLiveOnly && !liveOnly) cancelScheduledFrame();
      else return;
    }
    const token = ++frameTaskToken;
    scheduledLiveOnly = liveOnly;
    scheduledFrame = SCHEDULED_SENTINEL;
    const handle = requestFrame((time) => {
      if (token !== frameTaskToken) return;
      scheduledFrame = null;
      scheduledLiveOnly = false;
      runScheduledFrame(time);
    }, liveOnly);
    if (scheduledFrame === SCHEDULED_SENTINEL) scheduledFrame = handle;
  }
  function cancelScheduledFrame() {
    frameTaskToken++;
    const handle = scheduledFrame;
    scheduledFrame = null;
    scheduledLiveOnly = false;
    pendingScheduleMicrotask = false;
    pendingScheduleRequestMore = false;
    if (handle && handle !== SCHEDULED_SENTINEL) cancelFrame(handle);
  }
  function addQueuedTask(entry) {
    const task = entry.task;
    if (!task.id) {
      anonymousFrameTasks.push(entry);
      return;
    }
    const existing = frameTasksById.get(task.id);
    frameTasksById.set(
      task.id,
      existing ? {
        task: mergeFrameTasks(existing.task, task),
        coalesced: existing.coalesced + entry.coalesced + 1
      } : entry
    );
  }
  function requeueDeferredTasks(tasks) {
    if (!tasks.length) return;
    const queuedById = new Map(frameTasksById);
    const queuedAnonymous = anonymousFrameTasks.splice(0);
    frameTasksById.clear();
    for (const task of tasks) addQueuedTask(task);
    for (const task of queuedById.values()) addQueuedTask(task);
    anonymousFrameTasks.push(...queuedAnonymous);
  }
  function takeOrderedTasks() {
    const tasks = orderedQueuedTasks([...frameTasksById.values(), ...anonymousFrameTasks]);
    frameTasksById.clear();
    anonymousFrameTasks.length = 0;
    return tasks;
  }
  function runPendingFrameTasks(optionsForRun) {
    if (!options.isActive()) return EMPTY_FRAME_TASK_RUN_STATS;
    const force = optionsForRun?.force === true;
    const frameTaskQueueDepthBeforeRun = remainingFrameTasks();
    const tasks = takeOrderedTasks();
    if (!tasks.length) return EMPTY_FRAME_TASK_RUN_STATS;
    const highTaskCount = highPriorityTaskCount(tasks);
    if (globalThis.__VT_DEBUG_PERF__ && highTaskCount > HIGH_TASK_WARN_THRESHOLD) {
      console.warn(
        `[vue-tui] high-priority frame task queue is large (${highTaskCount}/${frameTaskQueueDepthBeforeRun}). Use stable task ids or createFrameMailbox() for latest-only producers.`
      );
    }
    const startedAt = framePerfNow();
    const currentFrameId = ++frameTaskFrameId;
    let requestMore = false;
    let frameTaskCount = 0;
    let coalescedFrameTasks = 0;
    let droppedUpdates = 0;
    let frameReason = "unknown";
    let shouldSync = false;
    const deferredTasks = [];
    let didThrow = false;
    let error;
    let mailboxFailure;
    let currentMailboxAttempt;
    const ctx = {
      frameId: currentFrameId,
      startedAt,
      now: framePerfNow,
      budgetMs: frameBudgetMs,
      remainingMs: () => Math.max(0, frameBudgetMs - (framePerfNow() - startedAt)),
      requestMore: () => {
        requestMore = true;
      },
      invalidate: (invalidateOptions) => {
        frameReason = mergeFramePerfReason(frameReason, invalidateOptions?.reason);
        if ((invalidateOptions?.priority ?? "normal") === "high") shouldSync = true;
        options.invalidate(invalidateOptions);
      },
      reportDroppedUpdates: (count) => {
        if (!Number.isFinite(count) || count <= 0) return;
        droppedUpdates += Math.floor(count);
      },
      reportMailboxDeliveryAttempt: (attempt) => {
        currentMailboxAttempt = {
          id: attempt.id,
          queued: attempt.queued,
          dropped: attempt.dropped
        };
      }
    };
    insideFrame = true;
    try {
      for (let i = 0; i < tasks.length; i++) {
        const entry = tasks[i];
        const task = entry.task;
        const priority = normalizePriority(task.priority);
        if (!force && frameTaskCount > 0 && priority !== "high" && ctx.remainingMs() <= 0) {
          deferredTasks.push(...tasks.slice(i));
          requestMore = true;
          break;
        }
        frameTaskCount++;
        coalescedFrameTasks += entry.coalesced;
        frameReason = mergeFramePerfReason(frameReason, task.reason);
        shouldSync = shouldSync || task.sync === true || priority === "high";
        currentMailboxAttempt = void 0;
        try {
          task.run(ctx);
        } catch (taskError) {
          didThrow = true;
          error = taskError;
          mailboxFailure = currentMailboxAttempt;
          if (i < tasks.length - 1) {
            deferredTasks.push(...tasks.slice(i + 1));
            requestMore = true;
          }
          break;
        }
        if (!force && priority !== "high" && ctx.remainingMs() <= 0 && i < tasks.length - 1) {
          deferredTasks.push(...tasks.slice(i + 1));
          requestMore = true;
          break;
        }
      }
    } finally {
      insideFrame = false;
      requeueDeferredTasks(deferredTasks);
    }
    const remaining = remainingFrameTasks();
    return {
      frameTaskCount,
      coalescedFrameTasks,
      frameTaskQueueDepthBeforeRun,
      frameTaskQueueDepthAfterRun: remaining,
      remainingFrameTasks: remaining,
      droppedUpdates,
      reason: frameReason,
      sync: shouldSync,
      requestMore,
      ...didThrow ? { error } : {},
      ...mailboxFailure ? { mailboxFailure } : {}
    };
  }
  function scheduleIfNeeded(requestMore = false) {
    if (!options.isActive()) return;
    const hasTasks = hasPendingFrameTasks();
    if (!requestMore && !hasTasks && liveReasons.size === 0) return;
    if (!runningScheduledFrame) {
      scheduleFrame(!requestMore && !hasTasks);
      return;
    }
    if (requestMore) pendingScheduleRequestMore = true;
    if (pendingScheduleMicrotask) return;
    pendingScheduleMicrotask = true;
    queueMicrotask(() => {
      pendingScheduleMicrotask = false;
      const requestMore2 = pendingScheduleRequestMore;
      pendingScheduleRequestMore = false;
      if (!options.isActive()) return;
      scheduleIfNeeded(requestMore2);
    });
  }
  function runScheduledFrame(_time = framePerfNow()) {
    if (!options.isActive()) return;
    runningScheduledFrame = true;
    let didThrow = false;
    let thrown;
    let shouldSchedule = false;
    let scheduleRequestMore = false;
    try {
      const stats = runPendingFrameTasks();
      if (stats.frameTaskCount > 0) options.flushFrame(stats);
      scheduleRequestMore = stats.requestMore || hasPendingFrameTasks();
      shouldSchedule = scheduleRequestMore || liveReasons.size > 0;
      if (Object.prototype.hasOwnProperty.call(stats, "error")) {
        didThrow = true;
        thrown = stats.error;
      }
    } catch (error) {
      didThrow = true;
      thrown = error;
      scheduleRequestMore = hasPendingFrameTasks();
      shouldSchedule = scheduleRequestMore || liveReasons.size > 0;
    } finally {
      runningScheduledFrame = false;
    }
    if (shouldSchedule) scheduleIfNeeded(scheduleRequestMore);
    if (didThrow) throw thrown;
  }
  function configure(config) {
    if (config.targetFps != null && Number.isFinite(config.targetFps) && config.targetFps > 0)
      targetFps = config.targetFps;
    if (config.maxFps != null && Number.isFinite(config.maxFps) && config.maxFps > 0)
      maxFps = config.maxFps;
    if (config.frameBudgetMs != null && Number.isFinite(config.frameBudgetMs) && config.frameBudgetMs >= 0)
      frameBudgetMs = config.frameBudgetMs;
  }
  function queueFrameTask(task) {
    if (!options.isActive()) return false;
    if (task.id) {
      const prev = frameTasksById.get(task.id);
      if (prev) {
        frameTasksById.set(task.id, {
          task: mergeFrameTasks(prev.task, task),
          coalesced: prev.coalesced + 1
        });
      } else {
        frameTasksById.set(task.id, { task, coalesced: 0 });
      }
    } else {
      anonymousFrameTasks.push({ task, coalesced: 0 });
    }
    scheduleFrame(false);
    return true;
  }
  function cancelFrameTask(id) {
    if (!id) return false;
    const deleted = frameTasksById.delete(id);
    if (frameTasksById.size === 0 && anonymousFrameTasks.length === 0 && scheduledFrame && !scheduledLiveOnly) {
      cancelScheduledFrame();
      scheduleIfNeeded();
    }
    return deleted;
  }
  function requestLive(reason) {
    const key = String(reason || "unknown");
    liveReasons.set(key, (liveReasons.get(key) ?? 0) + 1);
    scheduleIfNeeded();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      dropLive(key);
    };
  }
  function dropLive(reason) {
    const key = String(reason || "unknown");
    const next = (liveReasons.get(key) ?? 0) - 1;
    if (next > 0) liveReasons.set(key, next);
    else liveReasons.delete(key);
    if (liveReasons.size === 0 && scheduledLiveOnly && !hasPendingFrameTasks())
      cancelScheduledFrame();
  }
  return {
    configure,
    queueFrameTask,
    cancelFrameTask,
    requestLive,
    dropLive,
    isInsideFrame: () => insideFrame,
    cancelScheduledFrame,
    runPendingFrameTasks,
    scheduleIfNeeded,
    remainingFrameTasks,
    liveReasonList: () => Array.from(liveReasons.keys()).sort(),
    queueDepth: () => scheduledFrame ? 1 : 0
  };
}
let portalId = 0;
const SUPPRESS_TERMINAL_POINTER_UP = "__vueTuiSuppressTerminalPointerUp";
function resolveSelectionConfig(config) {
  if (config == null || config === false) {
    return {
      enabled: false,
      autoCopy: true,
      copyOnMouseUp: true,
      style: { inverse: true }
    };
  }
  const value = config === true ? {} : config;
  return {
    enabled: true,
    autoCopy: value.autoCopy ?? true,
    copyOnMouseUp: value.copyOnMouseUp ?? true,
    style: value.style ?? { inverse: true }
  };
}
const unsupportedClipboard = {
  supported: false,
  async readText() {
    return "";
  },
  async writeText() {
    throw new Error("Clipboard unavailable");
  }
};
function isPlainObject(v) {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
function shallowEqualValue(a, b) {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}
function shallowEqualRecord(a, b) {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (!shallowEqualValue(a[k], b[k])) return false;
  }
  return true;
}
function createTerminalApp(options) {
  const terminal = createTerminal({
    cols: options.cols,
    rows: options.rows
  });
  const trace = createTraceStore({
    enabled: Boolean(globalThis.__VT_DEBUG_TRACE__)
  });
  const framePerf = createFramePerfStore(120, {
    enabled: Boolean(globalThis.__VT_DEBUG_PERF__)
  });
  const latency = getCliLatencyProfiler();
  const profiler = createTuiProfiler("cli-scheduler");
  const baseEvents = createCliEventManager({
    record: (event) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "event", at: Date.now(), event });
    },
    onFocusChange: (prev, next) => {
      if (!trace.enabled.value) return;
      trace.push({ type: "focus", at: Date.now(), prev, next });
    }
  });
  const render = createRenderManager(terminal);
  const offCommit = terminal.on("commit", ({ dirtyRows, planes, sync }) => {
    latency?.recordCommit({ dirtyRows, planes, sync });
    if (!trace.enabled.value) return;
    trace.push({
      type: "commit",
      at: Date.now(),
      dirtyRows,
      planes,
      sync,
      focusedId: baseEvents.getFocused()
    });
  });
  let scheduled = false;
  let flushing = false;
  let mounted = false;
  let disposed = false;
  let lastFlushAtMs = 0;
  let scheduledAtMs = 0;
  let timer = null;
  let pendingInvalidateAfterFlush = false;
  let pendingInvalidateDuringFrame = false;
  let pendingInvalidateAllPlanes = false;
  const pendingInvalidatePlanes = /* @__PURE__ */ new Set();
  let frameId = 0;
  let pendingFrameReason = "unknown";
  let pendingCoalescedInvalidates = 0;
  let schedulerApi;
  const env = process$1?.env ?? {};
  const throttleMs = (() => {
    const raw = env.DIMCODE_TUI_THROTTLE_MS;
    if (!raw) return 0;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : 0;
  })();
  const frameThrottleMs = (() => {
    if (!process$1?.stdout?.isTTY) return 0;
    return 16;
  })();
  function queueInvalidatePlane(plane) {
    if (!plane) {
      pendingInvalidateAllPlanes = true;
      pendingInvalidatePlanes.clear();
      return;
    }
    if (pendingInvalidateAllPlanes) return;
    pendingInvalidatePlanes.add(plane);
  }
  function takeActivePlanes() {
    if (pendingInvalidateAllPlanes) {
      pendingInvalidateAllPlanes = false;
      pendingInvalidatePlanes.clear();
      return null;
    }
    if (pendingInvalidatePlanes.size === 0) return null;
    const activePlanes = Array.from(pendingInvalidatePlanes);
    pendingInvalidatePlanes.clear();
    return activePlanes;
  }
  function queueDepth() {
    return (scheduled ? 1 : 0) + (timer ? 1 : 0) + (pendingInvalidateAfterFlush ? 1 : 0) + frameScheduler.queueDepth();
  }
  function noteFrameReason(reason) {
    if (!reason || reason === "unknown") return;
    pendingFrameReason = mergeFramePerfReason(pendingFrameReason, reason);
  }
  function resetPendingFramePerfState() {
    pendingFrameReason = "unknown";
    pendingCoalescedInvalidates = 0;
  }
  const frameScheduler = createSchedulerFrameTasks({
    isActive: () => !disposed,
    invalidate: (options2) => schedulerApi.invalidate(options2),
    flushFrame: (stats) => {
      if (!pendingInvalidateDuringFrame) return;
      pendingInvalidateDuringFrame = false;
      flush(stats.sync, stats);
    }
  });
  function flush(sync, frameTasks = EMPTY_FRAME_TASK_RUN_STATS) {
    if (disposed) return;
    scheduled = false;
    flushing = true;
    const activePlanes = takeActivePlanes();
    latency?.recordFlushStart({ sync, activePlanes });
    if (!framePerf.enabled.value) {
      try {
        render.render({ activePlanes });
        terminal.commit({ planes: activePlanes, sync });
      } finally {
        latency?.recordFlushEnd();
        flushing = false;
        lastFlushAtMs = Date.now();
        scheduledAtMs = 0;
      }
      resetPendingFramePerfState();
      if (pendingInvalidateAfterFlush) {
        pendingInvalidateAfterFlush = false;
        flush(true);
      }
      return;
    }
    const startedAt = framePerfNow();
    const currentFrameId = ++frameId;
    const reason = mergeFramePerfReason(pendingFrameReason, frameTasks.reason);
    const coalescedInvalidates = pendingCoalescedInvalidates;
    resetPendingFramePerfState();
    let stats = null;
    let dirtyRows = [];
    let renderManagerMs = 0;
    let commitMs = 0;
    try {
      const renderStartedAt = framePerfNow();
      stats = render.render({ activePlanes });
      renderManagerMs = framePerfNow() - renderStartedAt;
      const commitStartedAt = framePerfNow();
      dirtyRows = terminal.commit({ planes: activePlanes, sync });
      commitMs = framePerfNow() - commitStartedAt;
    } finally {
      latency?.recordFlushEnd();
      flushing = false;
      lastFlushAtMs = Date.now();
      scheduledAtMs = 0;
    }
    framePerf.push({
      frameId: currentFrameId,
      reason,
      startedAt,
      durationMs: framePerfNow() - startedAt,
      renderManagerMs,
      commitMs,
      dirtyRows: dirtyRows === null ? null : dirtyRows.length,
      activePlanes: activePlanes ? [...activePlanes] : null,
      scannedNodes: stats?.scannedNodes ?? 0,
      paintedNodes: stats?.paintedNodes ?? 0,
      rowBucketFallbacks: stats?.rowBucketFallbacks,
      coalescedInvalidates,
      frameTaskCount: frameTasks.frameTaskCount,
      coalescedFrameTasks: frameTasks.coalescedFrameTasks,
      frameTaskQueueDepthBeforeRun: frameTasks.frameTaskQueueDepthBeforeRun,
      frameTaskQueueDepthAfterRun: frameTasks.frameTaskQueueDepthAfterRun,
      remainingFrameTasks: frameTasks.remainingFrameTasks,
      droppedUpdates: frameTasks.droppedUpdates,
      ...frameTasks.mailboxFailure ? { mailboxFailure: frameTasks.mailboxFailure } : {},
      queueDepth: queueDepth(),
      liveReasons: (() => {
        const reasons = frameScheduler.liveReasonList();
        return reasons.length ? reasons : void 0;
      })()
    });
    if (pendingInvalidateAfterFlush) {
      pendingInvalidateAfterFlush = false;
      flush(true);
    }
  }
  function clearScheduledTimer() {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }
  function scheduleFlushAt(atMs) {
    const nowMs = Date.now();
    const delayMs = Math.max(0, atMs - nowMs);
    if (delayMs > 0) {
      clearScheduledTimer();
      scheduledAtMs = atMs;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
      return;
    }
    clearScheduledTimer();
    scheduledAtMs = nowMs;
    if (typeof process$1.nextTick === "function") {
      process$1.nextTick(() => {
        flush();
      });
    } else if (typeof globalThis.setImmediate === "function") {
      globalThis.setImmediate(() => {
        flush();
      });
    } else {
      setTimeout(() => {
        flush();
      }, 0);
    }
  }
  function flushNow() {
    if (disposed) return;
    if (flushing) return;
    if (frameScheduler.isInsideFrame()) return;
    clearScheduledTimer();
    frameScheduler.cancelScheduledFrame();
    const frameTasks = frameScheduler.runPendingFrameTasks({ force: true });
    pendingInvalidateDuringFrame = false;
    scheduled = false;
    flush(true, frameTasks);
    frameScheduler.scheduleIfNeeded(frameTasks.requestMore);
    if (Object.prototype.hasOwnProperty.call(frameTasks, "error")) throw frameTasks.error;
  }
  function invalidate(options2) {
    if (disposed) return;
    const priority = options2?.priority ?? "normal";
    noteFrameReason(options2?.reason);
    latency?.recordSchedulerInvalidate({
      priority,
      plane: options2?.plane ?? null
    });
    queueInvalidatePlane(options2?.plane);
    if (frameScheduler.isInsideFrame()) {
      pendingInvalidateDuringFrame = true;
      profiler?.recordInvalidate({ plane: options2?.plane ?? null });
      return;
    }
    if (flushing) {
      pendingInvalidateAfterFlush = true;
      return;
    }
    profiler?.recordInvalidate({ plane: options2?.plane ?? null });
    if (priority === "high") {
      flushNow();
      return;
    }
    const nowMs = Date.now();
    const throttleDelayMs = throttleMs > 0 ? Math.max(0, lastFlushAtMs + throttleMs - nowMs) : 0;
    const laneDelayMs = priority === "low" ? Math.max(throttleDelayMs, frameThrottleMs || 16) : priority === "normal" ? Math.max(throttleDelayMs, frameThrottleMs) : 0;
    const desiredAtMs = nowMs + laneDelayMs;
    if (!scheduled) {
      scheduled = true;
      scheduleFlushAt(desiredAtMs);
      return;
    }
    pendingCoalescedInvalidates++;
    if (!scheduledAtMs) {
      scheduleFlushAt(desiredAtMs);
      return;
    }
    if (!timer && scheduledAtMs === nowMs) {
      return;
    }
    if (desiredAtMs < scheduledAtMs) scheduleFlushAt(desiredAtMs);
  }
  const portals = /* @__PURE__ */ shallowReactive([]);
  const runtime = {
    mount(component, initialProps, options2) {
      const id = `p${portalId++}`;
      let currentProps = { ...initialProps };
      const portal = /* @__PURE__ */ shallowReactive({
        id,
        component,
        plane: options2?.plane ?? "overlay",
        props: currentProps
      });
      portals.push(portal);
      let alive = true;
      const handle = {
        update(nextProps) {
          if (!alive) return;
          const next = { ...currentProps, ...nextProps };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        move(x, y) {
          if (!alive) return;
          const next = { ...currentProps, x, y };
          if (shallowEqualRecord(currentProps, next)) return;
          currentProps = next;
          portal.props = currentProps;
          invalidate({ plane: portal.plane });
        },
        unmount() {
          if (!alive) return;
          alive = false;
          const idx = portals.findIndex((p) => p.id === id);
          if (idx >= 0) portals.splice(idx, 1);
          invalidate({ plane: portal.plane });
        }
      };
      invalidate({ plane: portal.plane });
      return handle;
    }
  };
  const rootLayout = /* @__PURE__ */ shallowReactive({
    originX: 0,
    originY: 0,
    clipRect: { x: 0, y: 0, w: options.cols, h: options.rows }
  });
  const selectionTextProviders = /* @__PURE__ */ new Map();
  const selectionCopyHandlers = /* @__PURE__ */ new Set();
  const selectionContext = {
    registerTextProvider(provider) {
      selectionTextProviders.set(provider.id, provider);
      return () => {
        if (selectionTextProviders.get(provider.id) === provider)
          selectionTextProviders.delete(provider.id);
      };
    },
    onCopy(handler) {
      selectionCopyHandlers.add(handler);
      return () => selectionCopyHandlers.delete(handler);
    }
  };
  const selectionOverlay = getPlaneTerminal(terminal, "overlay");
  let selectionRenderNodeId = null;
  const selection = createTerminalSelectionController({
    terminal,
    overlayTerminal: selectionOverlay,
    clipboard: options.clipboard ?? unsupportedClipboard,
    getTextProviders: () => Array.from(selectionTextProviders.values()),
    getOptions: () => {
      const config = resolveSelectionConfig(options.selection);
      return {
        autoCopy: config.autoCopy,
        copyOnMouseUp: config.copyOnMouseUp,
        style: config.style
      };
    },
    onDirtyRows: (rows2) => {
      if (selectionRenderNodeId && render.markDirtyRows(selectionRenderNodeId, rows2)) {
        invalidate({ plane: "overlay", reason: "selection" });
        return;
      }
      invalidate({ plane: "overlay", reason: "selection" });
    },
    onCopy: (payload) => {
      options.onSelectionCopy?.(payload);
      for (const handler of selectionCopyHandlers) handler(payload);
      if (!trace.enabled.value) return;
      queueMicrotask(() => {
        trace.push({
          type: "selection-copy",
          at: Date.now(),
          rows: payload.rows,
          chars: payload.chars,
          ok: payload.ok,
          error: payload.error == null ? void 0 : String(payload.error)
        });
      });
    }
  });
  if (resolveSelectionConfig(options.selection).enabled) {
    const selectionRenderNode = render.register({
      stack: render.rootStack,
      plane: "overlay",
      zIndex: -1e4,
      rect: { x: 0, y: 0, w: options.cols, h: options.rows },
      paint: selection.paint
    });
    selectionRenderNodeId = selectionRenderNode.id;
  }
  let selecting = false;
  let selectionStartPoint = null;
  let selectionScrollOrigin = null;
  let selectionLastPoint = null;
  let selectionAutoScrollTimer = null;
  let selectionDragStarted = false;
  let suppressNextSelectionClick = false;
  const clearSelectionAutoScroll = () => {
    if (selectionAutoScrollTimer == null) return;
    clearTimeout(selectionAutoScrollTimer);
    selectionAutoScrollTimer = null;
  };
  const runSelectionAutoScroll = () => {
    selectionAutoScrollTimer = null;
    if (!selecting || !selectionScrollOrigin || !selectionLastPoint) return;
    const delta = baseEvents.autoScrollSelectionAt(
      selectionScrollOrigin.x,
      selectionScrollOrigin.y,
      selectionLastPoint.y
    );
    if (!delta) return;
    selection.update(selectionLastPoint);
    selectionAutoScrollTimer = setTimeout(runSelectionAutoScroll, 80);
  };
  const scheduleSelectionAutoScroll = () => {
    if (selectionAutoScrollTimer != null) return;
    selectionAutoScrollTimer = setTimeout(runSelectionAutoScroll, 80);
  };
  const selectionEnabled = () => resolveSelectionConfig(options.selection).enabled;
  const eventPoint = (event) => ({
    x: Math.max(0, Math.floor(event.cellX ?? 0)),
    y: Math.max(0, Math.floor(event.cellY ?? 0))
  });
  const dispatchWithSelection = (event) => {
    if (!selectionEnabled()) return baseEvents.dispatch(event);
    if (event.type === "keydown" && event.key === "Escape" && selection.state.value.active) {
      selection.clear();
      return true;
    }
    if (event.type === "click" || event.type === "dblclick" || event.type === "contextmenu") {
      if (!suppressNextSelectionClick) return baseEvents.dispatch(event);
      suppressNextSelectionClick = false;
      return true;
    }
    if (event.type === "pointerdown") {
      suppressNextSelectionClick = false;
      selectionDragStarted = false;
      if (!selecting && (event.button ?? 0) === 0) {
        const point = eventPoint(event);
        if (baseEvents.canSelectAt(point.x, point.y)) {
          selection.start(point, { extend: Boolean(event.shiftKey) });
          selecting = true;
          selectionStartPoint = point;
          selectionScrollOrigin = point;
          selectionLastPoint = point;
          scheduleSelectionAutoScroll();
        }
      }
      return baseEvents.dispatch(event);
    }
    if (event.type === "pointermove" && selecting) {
      const point = eventPoint(event);
      selectionLastPoint = point;
      if (selectionStartPoint && (point.x !== selectionStartPoint.x || point.y !== selectionStartPoint.y)) {
        selectionDragStarted = true;
      }
      selection.update(point);
      scheduleSelectionAutoScroll();
      return baseEvents.dispatch(event);
    }
    if (event.type === "pointerup" && selecting) {
      const point = eventPoint(event);
      if (!selectionStartPoint || point.x !== selectionStartPoint.x || point.y !== selectionStartPoint.y) {
        selection.update(point);
      }
      const suppressActivation = selectionDragStarted || selection.state.value.hasRange;
      if (suppressActivation) {
        suppressNextSelectionClick = true;
        event[SUPPRESS_TERMINAL_POINTER_UP] = true;
      }
      selecting = false;
      selectionStartPoint = null;
      selectionScrollOrigin = null;
      selectionLastPoint = null;
      clearSelectionAutoScroll();
      const prevented = baseEvents.dispatch(event);
      void selection.finish();
      return suppressActivation || prevented;
    }
    return baseEvents.dispatch(event);
  };
  const events = {
    ...baseEvents,
    dispatch: dispatchWithSelection,
    dispose() {
      clearSelectionAutoScroll();
      baseEvents.dispose();
    }
  };
  const inputPlugins = options.inputPlugins ?? (options.clipboard ? [
    createTInputHostPlugin(() => ({
      ...createDefaultTInputHostAdapter(),
      isTerminalLike: true,
      async readClipboardText() {
        if (!options.clipboard?.supported) return "";
        try {
          return await options.clipboard.readText();
        } catch {
          return "";
        }
      },
      async writeClipboardText(text) {
        if (!text || !options.clipboard?.supported) return false;
        try {
          await options.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      }
    }))
  ] : [defaultTInputHostPlugin]);
  const offResize = terminal.on("resize", ({ cols: cols2, rows: rows2 }) => {
    rootLayout.clipRect = { x: 0, y: 0, w: cols2, h: rows2 };
    selection.clear();
    if (selectionRenderNodeId) {
      render.update(selectionRenderNodeId, {
        rect: { x: 0, y: 0, w: cols2, h: rows2 }
      });
    }
    invalidate({ reason: "resize" });
  });
  schedulerApi = {
    invalidate,
    flush,
    flushNow,
    configure: frameScheduler.configure,
    queueFrameTask: frameScheduler.queueFrameTask,
    cancelFrameTask: frameScheduler.cancelFrameTask,
    requestLive: frameScheduler.requestLive,
    dropLive: frameScheduler.dropLive,
    isInsideFrame: frameScheduler.isInsideFrame
  };
  const ctx = {
    terminal,
    renderer: /* @__PURE__ */ shallowRef(null),
    rendererCapabilities: /* @__PURE__ */ shallowRef(HEADLESS_RENDERER_CAPABILITIES),
    events: /* @__PURE__ */ shallowRef(events),
    scheduler: schedulerApi,
    runtime,
    observability: { trace, framePerf },
    selection: selectionContext,
    defaultStyle: /* @__PURE__ */ ref(options.defaultStyle ?? {}),
    render
  };
  const imeAnchor = /* @__PURE__ */ shallowRef(null);
  const Root = /* @__PURE__ */ defineComponent({
    name: "TerminalAppRoot",
    setup() {
      provide(TerminalContextKey, ctx);
      provide(LayoutContextKey, rootLayout);
      provide(VisibilityContextKey, /* @__PURE__ */ ref(true));
      provide(EventZIndexContextKey, /* @__PURE__ */ ref(0));
      provide(RenderStackKey, /* @__PURE__ */ shallowRef(render.rootStack));
      provide(ImeAnchorContextKey, imeAnchor);
      provide(TInputPluginsContextKey, /* @__PURE__ */ ref(inputPlugins));
      provide(
        TPathPickerProviderContextKey,
        /* @__PURE__ */ ref(options.pathPickerProvider ?? createNodePathPickerProvider())
      );
      return () => {
        const portalVNodes = portals.map(
          (p) => h(TRenderPlane, { key: p.id, plane: p.plane }, () => [
            h(p.component, { ...p.props })
          ])
        );
        return h("div", null, [h(options.component, options.props ?? {}), ...portalVNodes]);
      };
    }
  });
  const app2 = createHeadlessApp(Root);
  const hostRoot = createHeadlessRoot();
  return {
    app: app2,
    terminal,
    events,
    scheduler: ctx.scheduler,
    defaultStyle: ctx.defaultStyle,
    getImeAnchor() {
      return imeAnchor.value;
    },
    mount() {
      if (disposed || mounted) return;
      mounted = true;
      app2.mount(hostRoot);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearScheduledTimer();
      frameScheduler.cancelScheduledFrame();
      if (mounted) app2.unmount();
      if (selectionRenderNodeId) render.unregister(selectionRenderNodeId);
      offResize?.();
      offCommit?.();
      events.dispose();
      terminal.dispose();
    }
  };
}
function useRenderStack() {
  const stack2 = inject(RenderStackKey, null);
  if (!stack2) throw new Error("RenderStack is missing");
  return stack2;
}
function useTerminal() {
  const ctx = inject(TerminalContextKey, null);
  if (!ctx) throw new Error("TerminalProvider is missing");
  return ctx;
}
const pendingInvalidateByScheduler = /* @__PURE__ */ new WeakMap();
function mergePriority(prev, next) {
  if (prev === "high" || next === "high") return "high";
  if (prev === "normal" || next === "normal") return "normal";
  return "low";
}
function requestBatchedInvalidate(scheduler, plane, priority) {
  let state = pendingInvalidateByScheduler.get(scheduler);
  if (!state) {
    state = { queued: false, plane: null, priority: "low" };
    pendingInvalidateByScheduler.set(scheduler, state);
  }
  if (state.queued) {
    if (state.plane !== null && state.plane !== plane) state.plane = null;
    state.priority = mergePriority(state.priority, priority);
    return;
  }
  state.plane = plane;
  state.priority = priority;
  state.queued = true;
  queueMicrotask(() => {
    state.queued = false;
    const queuedPlane = state.plane;
    const queuedPriority = state.priority;
    state.plane = null;
    state.priority = "low";
    scheduler.invalidate({
      plane: queuedPlane ?? void 0,
      priority: queuedPriority
    });
  });
}
function useRenderNode(getOptions) {
  const { scheduler, render } = useTerminal();
  const parentStack = useRenderStack();
  const plane = inject(RenderPlaneContextKey, /* @__PURE__ */ ref("default"));
  const id = /* @__PURE__ */ ref(null);
  const lastPlane = /* @__PURE__ */ ref(plane.value);
  const options = computed(() => getOptions());
  const stop = watchEffect(() => {
    const opt = options.value;
    void opt.deps;
    const stack2 = opt.stack ?? parentStack.value;
    const nextPlane = plane.value;
    if (!stack2) return;
    if (!id.value) {
      const node = render.register({
        stack: stack2,
        zIndex: opt.zIndex,
        rect: opt.rect,
        plane: nextPlane,
        paint: opt.paint
      });
      id.value = node.id;
      lastPlane.value = nextPlane;
      requestBatchedInvalidate(scheduler, nextPlane, opt.priority ?? "normal");
      return;
    }
    const prevPlane = lastPlane.value;
    const updatePayload = {
      stack: stack2,
      zIndex: opt.zIndex ?? 0,
      dirtyRowsHint: opt.dirtyRowsHint,
      plane: nextPlane,
      paint: opt.paint
    };
    if (Object.prototype.hasOwnProperty.call(opt, "rect")) updatePayload.rect = opt.rect ?? null;
    render.update(id.value, updatePayload);
    lastPlane.value = nextPlane;
    const priority = opt.priority ?? "normal";
    requestBatchedInvalidate(scheduler, prevPlane, priority);
    if (prevPlane !== nextPlane) requestBatchedInvalidate(scheduler, nextPlane, priority);
  });
  onBeforeUnmount(() => {
    stop();
    if (id.value) {
      render.unregister(id.value);
      requestBatchedInvalidate(scheduler, lastPlane.value, "normal");
    }
  });
  return { id };
}
function useTerminalNode(getOptions) {
  const { events } = useTerminal();
  const id = /* @__PURE__ */ ref(null);
  const options = computed(() => getOptions());
  const stop = watchEffect(() => {
    const manager = events.value;
    if (!manager) return;
    const opt = options.value;
    if (!id.value) {
      const node = manager.register({
        rect: opt.rect,
        zIndex: opt.zIndex ?? 0,
        visible: opt.visible,
        focusable: opt.focusable,
        selectable: opt.selectable,
        selectionScrollBy: opt.selectionScrollBy,
        handlers: opt.handlers ?? {}
      });
      id.value = node.id;
      return;
    }
    manager.update(id.value, {
      rect: opt.rect,
      zIndex: opt.zIndex ?? 0,
      visible: opt.visible,
      focusable: opt.focusable,
      selectable: opt.selectable,
      selectionScrollBy: opt.selectionScrollBy,
      handlers: opt.handlers ?? {}
    });
  });
  onBeforeUnmount(() => {
    stop();
    const manager = events.value;
    if (manager && id.value) manager.unregister(id.value);
  });
  return { id };
}
function useLayout() {
  const ctx = inject(LayoutContextKey, null);
  if (!ctx) throw new Error("LayoutContext is missing (TerminalProvider/TView)");
  return ctx;
}
const VUE_TERMINAL_SHOW_CB = "__vueTerminalOnShow";
const PLACEHOLDER_STYLE = Object.freeze({
  position: "absolute",
  left: "-9999px",
  top: "0",
  width: "0",
  height: "0",
  overflow: "hidden"
});
function useVisibility(options) {
  const { scheduler } = useTerminal();
  const parentVisible = inject(VisibilityContextKey, /* @__PURE__ */ ref(true));
  const localVisible = /* @__PURE__ */ ref(true);
  const visible = computed(() => parentVisible.value && localVisible.value);
  if (options?.provide) provide(VisibilityContextKey, visible);
  const onShow = (value) => {
    localVisible.value = value;
    scheduler.invalidate();
  };
  const rootProps = {
    style: PLACEHOLDER_STYLE,
    onVnodeBeforeMount: (vnode) => {
      const el = vnode.el;
      if (el && typeof el === "object") el[VUE_TERMINAL_SHOW_CB] = onShow;
    },
    onVnodeBeforeUnmount: (vnode) => {
      const el = vnode.el;
      if (el && typeof el === "object" && el[VUE_TERMINAL_SHOW_CB] === onShow)
        delete el[VUE_TERMINAL_SHOW_CB];
    }
  };
  return { visible, rootProps };
}
function intersectRect(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function translateRect(rect, dx, dy) {
  return { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h };
}
const BORDER = {
  tl: "┌",
  tr: "┐",
  bl: "└",
  br: "┘",
  h: "─",
  v: "│"
};
const BOX_BACKGROUND_Z = -1;
const BOX_BORDER_Z = 1e6;
const TBox = /* @__PURE__ */ defineComponent({
  name: "TBox",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    border: { type: Boolean, default: true },
    title: { type: String, default: "" },
    padding: { type: Number, default: 0 },
    scrollX: { type: Number, default: 0 },
    scrollY: { type: Number, default: 0 },
    style: { type: Object, default: void 0 },
    titleStyle: { type: Object, default: void 0 },
    clear: { type: Boolean, default: true }
  },
  emits: ["pointerenterCapture", "pointerenter", "pointerleaveCapture", "pointerleave"],
  setup(props, { emit: emit2, slots }) {
    const { terminal, defaultStyle, render } = useTerminal();
    const parent = useLayout();
    const parentStack = useRenderStack();
    const { visible, rootProps } = useVisibility({ provide: true });
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0));
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const absRect = computed(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, parent.originX, parent.originY);
      if (!parent.clipRect) return translated;
      return intersectRect(translated, parent.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });
    const stack2 = computed(() => render.createStack(parentStack.value, props.zIndex));
    const contentLayout = /* @__PURE__ */ shallowReactive({
      originX: 0,
      originY: 0,
      clipRect: null
    });
    useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: false,
      handlers: {
        pointerenterCapture: (e) => emit2("pointerenterCapture", e),
        pointerenter: (e) => emit2("pointerenter", e),
        pointerleaveCapture: (e) => emit2("pointerleaveCapture", e),
        pointerleave: (e) => emit2("pointerleave", e)
      }
    }));
    function drawBorder(r, style, titleStyle, dirtyRows) {
      const w = Math.max(0, Math.floor(r.w));
      const h2 = Math.max(0, Math.floor(r.h));
      if (!props.border || w < 2 || h2 < 2) return;
      const x0 = Math.floor(r.x);
      const y0 = Math.floor(r.y);
      const x1 = x0 + w - 1;
      const y1 = y0 + h2 - 1;
      const innerW = Math.max(0, w - 2);
      const drawTop = () => {
        terminal.write(`${BORDER.tl}${repeatChar(BORDER.h, innerW)}${BORDER.tr}`, {
          x: x0,
          y: y0,
          style
        });
        if (props.title) {
          const max = Math.max(0, w - 4);
          const safe = sanitizeInlineText(props.title);
          const title = sliceByCells(safe, max);
          const ts = titleStyle ?? (style.bg ? { bg: style.bg } : {});
          terminal.write(` ${title} `, { x: x0 + 1, y: y0, style: ts });
        }
      };
      const drawBottom = () => {
        terminal.write(`${BORDER.bl}${repeatChar(BORDER.h, innerW)}${BORDER.br}`, {
          x: x0,
          y: y1,
          style
        });
      };
      const drawMiddleRow = (y) => {
        terminal.put(x0, y, BORDER.v, style);
        terminal.put(x1, y, BORDER.v, style);
      };
      if (!dirtyRows) {
        drawTop();
        drawBottom();
        for (let y = y0 + 1; y < y1; y++) drawMiddleRow(y);
        return;
      }
      for (const y of dirtyRows) {
        if (y < y0 || y > y1) continue;
        if (y === y0) drawTop();
        else if (y === y1) drawBottom();
        else drawMiddleRow(y);
      }
    }
    function drawClear(r, style, dirtyRows) {
      if (!props.clear) return;
      const bgOnly = style.bg ? { bg: style.bg } : {};
      if (!dirtyRows) {
        terminal.fill(r.x, r.y, r.w, r.h, " ", bgOnly);
        return;
      }
      const y0 = Math.floor(r.y);
      const y1 = y0 + Math.max(0, Math.floor(r.h));
      for (const y of dirtyRows) {
        if (y < y0 || y >= y1) continue;
        terminal.fill(r.x, y, r.w, 1, " ", bgOnly);
      }
    }
    watchEffect(() => {
      const r = absRect.value;
      const borderInset = props.border ? 1 : 0;
      const requestedPad = Math.max(0, Math.floor(props.padding));
      const maxPadX = Math.max(0, Math.floor((r.w - borderInset * 2 - 1) / 2));
      const maxPadY = Math.max(0, Math.floor((r.h - borderInset * 2 - 1) / 2));
      const pad = Math.min(requestedPad, maxPadX, maxPadY);
      const content = {
        x: r.x + borderInset + pad,
        y: r.y + borderInset + pad,
        w: Math.max(0, r.w - borderInset * 2 - pad * 2),
        h: Math.max(0, r.h - borderInset * 2 - pad * 2)
      };
      let contentRect = intersectRect(content, r);
      if (parent.clipRect && contentRect) contentRect = intersectRect(contentRect, parent.clipRect);
      if (!contentRect) contentRect = { x: 0, y: 0, w: 0, h: 0 };
      contentLayout.originX = content.x - Math.floor(props.scrollX);
      contentLayout.originY = content.y - Math.floor(props.scrollY);
      contentLayout.clipRect = contentRect;
    });
    useRenderNode(() => ({
      stack: stack2.value,
      zIndex: BOX_BACKGROUND_Z,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [visible.value, absRect.value, props.style, props.clear, defaultStyle.value],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        const style = props.style ?? defaultStyle.value;
        drawClear(r, style, dirtyRows ?? null);
      }
    }));
    useRenderNode(() => ({
      stack: stack2.value,
      zIndex: BOX_BORDER_Z,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.border,
        props.title,
        props.style,
        props.titleStyle,
        defaultStyle.value
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        const style = props.style ?? defaultStyle.value;
        drawBorder(r, style, props.titleStyle, dirtyRows ?? null);
      }
    }));
    provide(LayoutContextKey, contentLayout);
    provide(RenderStackKey, stack2);
    provide(EventZIndexContextKey, eventZ);
    return () => h("div", rootProps, slots.default?.());
  }
});
function fitText(text, max) {
  if (max <= 0) return "";
  text = sanitizeInlineText(text);
  return sliceByCells(text, max);
}
function splitLines(text) {
  return sanitizeTextBlock(text).split("\n");
}
function computeDefaultWidth(text) {
  const lines = splitLines(text);
  let max = 0;
  for (const line of lines) max = Math.max(max, textCellWidth(line));
  return max;
}
const TText = /* @__PURE__ */ defineComponent({
  name: "TText",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    value: { type: String, required: true },
    w: { type: Number, default: void 0 },
    h: { type: Number, default: void 0 },
    style: { type: Object, default: void 0 },
    clear: { type: Boolean, default: true },
    wrap: { type: Boolean, default: false },
    /**
     * Optional key that participates in render-node dependency tracking.
     * Useful for forcing a repaint when the rendered output might change
     * even if `value`, `style`, and geometry are unchanged (e.g. external
     * terminal writes or higher-level virtualized row reuse).
     */
    depsKey: { type: null, default: void 0 }
  },
  setup(props) {
    const { terminal, defaultStyle } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const defaultWidth = computed(() => computeDefaultWidth(props.value));
    const lines = computed(() => {
      const w = props.w ?? defaultWidth.value;
      if (w <= 0) return [""];
      if (!props.wrap) return splitLines(props.value).map((l) => fitText(l, w));
      const safe = sanitizeTextBlock(props.value);
      return wrapByCells(safe, w).map((l) => fitText(l, w));
    });
    const absRect = computed(() => {
      const width = props.w ?? defaultWidth.value;
      const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
      const raw = { x: props.x, y: props.y, w: width, h: height };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });
    const fullRect = computed(() => {
      const width = props.w ?? defaultWidth.value;
      const height = props.h ?? (props.wrap ? lines.value.length || 1 : lines.value.length || 1);
      return translateRect(
        { x: props.x, y: props.y, w: width, h: height },
        layout.originX,
        layout.originY
      );
    });
    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        fullRect.value,
        props.value,
        props.w,
        props.h,
        props.wrap,
        props.style,
        defaultStyle.value,
        props.depsKey
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const full = fullRect.value;
        const style = props.style ?? defaultStyle.value;
        const blank = props.clear ? spaces(r.w) : "";
        const out2 = lines.value;
        const dx = Math.max(0, Math.floor(r.x - full.x));
        const fullY = Math.floor(full.y);
        const paintRow = (y) => {
          const relY = y - r.y;
          if (relY < 0 || relY >= r.h) return;
          const i = y - fullY;
          if (i < 0 || i >= out2.length) {
            if (props.clear) terminal.write(blank, { x: r.x, y, style });
            return;
          }
          const src = out2[i] ?? "";
          const clipped = dx > 0 ? sliceByCellsRange(src, dx, dx + r.w) : sliceByCells(src, r.w);
          terminal.write(padEndByCells(clipped, r.w), { x: r.x, y, style });
        };
        if (!dirtyRows) {
          for (let i = 0; i < r.h; i++) paintRow(r.y + i);
          return;
        }
        for (const y of dirtyRows) paintRow(y);
      }
    }));
    return () => h("span", rootProps);
  }
});
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function isOptionObject(opt) {
  return typeof opt !== "string";
}
function normalizeHighlightRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const out2 = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.trunc(Number(range?.start ?? -1)));
    const end = Math.max(0, Math.trunc(Number(range?.end ?? -1)));
    if (end <= start) continue;
    out2.push({ start, end });
  }
  out2.sort((a, b) => a.start - b.start || a.end - b.end);
  return out2;
}
function normalizeAccentSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const out2 = [];
  for (const segment of segments) {
    const start = Math.max(0, Math.trunc(Number(segment?.start ?? -1)));
    const end = Math.max(0, Math.trunc(Number(segment?.end ?? -1)));
    if (end <= start) continue;
    out2.push({
      start,
      end,
      style: segment?.style,
      highlightStyle: segment?.highlightStyle
    });
  }
  out2.sort((a, b) => a.start - b.start || a.end - b.end);
  return out2;
}
function writeHighlightedText(opts) {
  const {
    terminal,
    text,
    ranges,
    x,
    y,
    maxCells,
    baseStyle,
    highlightStyle,
    accentRanges = [],
    accentStyle = baseStyle,
    accentSegments = []
  } = opts;
  const safeMax = Math.max(0, Math.floor(maxCells));
  if (!text || safeMax <= 0) return 0;
  let rangeIndex = 0;
  let activeRange = ranges[rangeIndex];
  let accentRangeIndex = 0;
  let activeAccentRange = accentRanges[accentRangeIndex];
  let accentSegmentIndex = 0;
  let activeAccentSegment = accentSegments[accentSegmentIndex];
  let cellPos = 0;
  let cursorX = x;
  let buffer2 = "";
  let currentStyle = baseStyle;
  const flush = () => {
    if (!buffer2) return;
    terminal.write(buffer2, { x: cursorX, y, style: currentStyle });
    cursorX += textCellWidth(buffer2);
    buffer2 = "";
  };
  for (let i = 0; i < text.length && cellPos < safeMax; ) {
    const code = text.charCodeAt(i);
    const seg = code <= 127 ? text[i] : String.fromCodePoint(text.codePointAt(i) ?? 0);
    const segLen = seg.length;
    const segWidth = charCellWidth(seg);
    if (cellPos + segWidth > safeMax) break;
    while (activeRange && activeRange.end <= i) {
      rangeIndex++;
      activeRange = ranges[rangeIndex];
    }
    while (activeAccentRange && activeAccentRange.end <= i) {
      accentRangeIndex++;
      activeAccentRange = accentRanges[accentRangeIndex];
    }
    while (activeAccentSegment && activeAccentSegment.end <= i) {
      accentSegmentIndex++;
      activeAccentSegment = accentSegments[accentSegmentIndex];
    }
    const isHighlighted = Boolean(
      activeRange && i < activeRange.end && i + segLen > activeRange.start
    );
    const isAccented = Boolean(
      activeAccentRange && i < activeAccentRange.end && i + segLen > activeAccentRange.start
    );
    const accentSegmentStyle = activeAccentSegment && i < activeAccentSegment.end && i + segLen > activeAccentSegment.start ? activeAccentSegment.style : void 0;
    const nextStyle = isHighlighted ? highlightStyle : accentSegmentStyle || (isAccented ? accentStyle : baseStyle);
    if (nextStyle !== currentStyle) {
      flush();
      currentStyle = nextStyle;
    }
    buffer2 += seg;
    cellPos += segWidth;
    i += segLen;
  }
  flush();
  return cellPos;
}
const TSelect = /* @__PURE__ */ defineComponent({
  name: "TSelect",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    options: { type: Array, required: true },
    modelValue: {
      type: [Number, Array],
      default: 0
    },
    multiple: { type: Boolean, default: false },
    multipleEmit: {
      type: String,
      default: "value"
    },
    style: { type: Object, default: void 0 },
    highlightStyle: { type: Object, default: void 0 },
    matchStyle: { type: Object, default: void 0 },
    highlightMatchStyle: {
      type: Object,
      default: void 0
    },
    autoFocus: { type: Boolean, default: false },
    closeOnBlur: { type: Boolean, default: false }
  },
  emits: ["update:modelValue", "change", "confirm", "close", "focus", "blur", "keydown"],
  setup(props, { emit: emit2 }) {
    const { terminal, scheduler, defaultStyle, events } = useTerminal();
    const layout = useLayout();
    const { visible, rootProps } = useVisibility();
    const parentEventZ = inject(EventZIndexContextKey, computed(() => 0));
    const inDialog = inject(DialogContextKey, false);
    const eventZ = computed(() => (parentEventZ.value ?? 0) + (props.zIndex ?? 0));
    const focused = /* @__PURE__ */ ref(false);
    const initialActive = (() => {
      const max = Math.max(0, props.options.length - 1);
      if (!props.multiple) {
        const idx = typeof props.modelValue === "number" ? props.modelValue : 0;
        return clamp(idx, 0, max);
      }
      const selected = Array.isArray(props.modelValue) ? props.modelValue : [];
      const first = selected[0] ?? 0;
      return clamp(first, 0, max);
    })();
    const active = /* @__PURE__ */ ref(initialActive);
    function getScrollOffset(r) {
      const visibleH = Math.max(0, Math.floor(r.h));
      const total = Math.max(0, props.options.length);
      if (visibleH <= 0) return 0;
      if (total <= visibleH) return 0;
      const maxOffset = Math.max(0, total - visibleH);
      const a = clamp(active.value, 0, Math.max(0, total - 1));
      return clamp(a - (visibleH - 1), 0, maxOffset);
    }
    const absRect = computed(() => {
      const raw = { x: props.x, y: props.y, w: props.w, h: props.h };
      const translated = translateRect(raw, layout.originX, layout.originY);
      if (!layout.clipRect) return translated;
      return intersectRect(translated, layout.clipRect) ?? { x: 0, y: 0, w: 0, h: 0 };
    });
    watchEffect(() => {
      const max = Math.max(0, props.options.length - 1);
      if (!props.multiple) {
        const idx = typeof props.modelValue === "number" ? props.modelValue : 0;
        const next = clamp(idx, 0, max);
        active.value = isOptionInteractive(props.options[next]) ? next : findNextInteractiveIndex(next, 1) ?? next;
        return;
      }
      active.value = clamp(active.value, 0, max);
    });
    function getOptionLabel(opt) {
      return isOptionObject(opt) ? opt.label : opt;
    }
    function getOptionKind(opt) {
      return isOptionObject(opt) ? opt.kind : void 0;
    }
    function isOptionInteractive(opt) {
      if (!opt) return false;
      return getOptionKind(opt) !== "separator";
    }
    function findNextInteractiveIndex(start, delta) {
      const total = Math.max(0, props.options.length);
      if (total <= 0) return null;
      const step = delta >= 0 ? 1 : -1;
      for (let offset = 1; offset <= total; offset++) {
        const next = (start + step * offset + total) % total;
        if (isOptionInteractive(props.options[next])) return next;
      }
      return null;
    }
    function getOptionDetail(opt) {
      return isOptionObject(opt) ? opt.detail : void 0;
    }
    function getOptionStyle(opt) {
      return isOptionObject(opt) ? opt.style : void 0;
    }
    function getOptionHighlightStyle(opt) {
      return isOptionObject(opt) ? opt.highlightStyle : void 0;
    }
    function getOptionDetailStyle(opt) {
      return isOptionObject(opt) ? opt.detailStyle : void 0;
    }
    function getOptionHighlightDetailStyle(opt) {
      return isOptionObject(opt) ? opt.highlightDetailStyle : void 0;
    }
    function getOptionLabelHighlightRanges(opt) {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.labelHighlightRanges : void 0);
    }
    function getOptionDetailHighlightRanges(opt) {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.detailHighlightRanges : void 0);
    }
    function getOptionLabelAccentRanges(opt) {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.labelAccentRanges : void 0);
    }
    function getOptionDetailAccentRanges(opt) {
      return normalizeHighlightRanges(isOptionObject(opt) ? opt.detailAccentRanges : void 0);
    }
    function getOptionDetailAccentSegments(opt) {
      return normalizeAccentSegments(isOptionObject(opt) ? opt.detailAccentSegments : void 0);
    }
    function getOptionAccentStyle(opt) {
      return isOptionObject(opt) ? opt.accentStyle : void 0;
    }
    function getOptionHighlightAccentStyle(opt) {
      return isOptionObject(opt) ? opt.highlightAccentStyle : void 0;
    }
    function commitSingle(index) {
      const next = clamp(index, 0, Math.max(0, props.options.length - 1));
      if (!isOptionInteractive(props.options[next])) return;
      active.value = next;
      emit2("update:modelValue", next);
      const opt = props.options[next];
      emit2("change", opt ? getOptionLabel(opt) : null);
    }
    function getSelectedIndices() {
      if (!props.multiple) return [];
      const max = Math.max(0, props.options.length - 1);
      const raw = Array.isArray(props.modelValue) ? props.modelValue : [];
      const set = /* @__PURE__ */ new Set();
      for (const v of raw) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        set.add(clamp(Math.trunc(v), 0, max));
      }
      return [...set].sort((a, b) => a - b);
    }
    function makeMultiplePayload(indices) {
      const values = indices.map((i) => props.options[i]).filter(Boolean).map((opt) => getOptionLabel(opt));
      return { indices, values };
    }
    function emitMultiple(name, indices) {
      const payload = makeMultiplePayload(indices);
      if (props.multipleEmit === "index") {
        emit2(name, payload.indices);
        return;
      }
      if (props.multipleEmit === "both") {
        emit2(name, payload);
        return;
      }
      emit2(name, payload.values);
    }
    function toggleMultiple(index) {
      const nextIndex = clamp(index, 0, Math.max(0, props.options.length - 1));
      active.value = nextIndex;
      const set = new Set(getSelectedIndices());
      if (set.has(nextIndex)) set.delete(nextIndex);
      else set.add(nextIndex);
      const indices = [...set].sort((a, b) => a - b);
      emit2("update:modelValue", indices);
      emitMultiple("change", indices);
    }
    function confirmMultiple() {
      const indices = getSelectedIndices();
      emitMultiple("confirm", indices);
    }
    function commit(index) {
      if (!isOptionInteractive(props.options[index])) return;
      if (props.multiple) toggleMultiple(index);
      else commitSingle(index);
    }
    function onKeydown(e) {
      emit2("keydown", e);
      if (e.defaultPrevented) return;
      const max = Math.max(0, props.options.length - 1);
      if (e.key === "ArrowUp" || e.code === "ArrowUp") {
        e.preventDefault();
        const next = max <= 0 ? 0 : findNextInteractiveIndex(active.value, -1) ?? active.value;
        active.value = next;
        if (!props.multiple) emit2("update:modelValue", active.value);
        scheduler.invalidate();
        return;
      }
      if (e.key === "ArrowDown" || e.code === "ArrowDown") {
        e.preventDefault();
        const next = max <= 0 ? 0 : findNextInteractiveIndex(active.value, 1) ?? active.value;
        active.value = next;
        if (!props.multiple) emit2("update:modelValue", active.value);
        scheduler.invalidate();
        return;
      }
      if (props.multiple && (e.code === "Space" || e.key === " " || e.key === "Spacebar")) {
        e.preventDefault();
        toggleMultiple(active.value);
        return;
      }
      if (e.key === "Enter") {
        if (props.multiple) {
          if (inDialog && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.__tuiDialogConfirm = true;
          }
          e.preventDefault();
          confirmMultiple();
          return;
        }
        commit(active.value);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        emit2("close");
      }
    }
    const { id } = useTerminalNode(() => ({
      rect: absRect.value,
      zIndex: eventZ.value,
      visible: visible.value,
      focusable: true,
      handlers: {
        click: (e) => {
          const r = absRect.value;
          const offset = getScrollOffset(r);
          const idx = offset + (e.cellY - r.y);
          if (idx >= 0 && idx < props.options.length) commit(idx);
          else emit2("close");
        },
        focus: () => {
          focused.value = true;
          emit2("focus");
          scheduler.invalidate();
        },
        blur: () => {
          focused.value = false;
          emit2("blur");
          if (props.closeOnBlur) emit2("close");
          scheduler.invalidate();
        },
        keydown: onKeydown
      }
    }));
    watchEffect(() => {
      if (!props.autoFocus) return;
      if (!visible.value) return;
      const manager = events.value;
      const nodeId = id.value;
      if (!manager || !nodeId) return;
      if (manager.getFocused() === nodeId) return;
      manager.focus(nodeId);
    });
    useRenderNode(() => ({
      zIndex: props.zIndex,
      rect: visible.value ? absRect.value : { x: 0, y: 0, w: 0, h: 0 },
      deps: [
        visible.value,
        absRect.value,
        props.w,
        props.h,
        props.options,
        props.modelValue,
        props.multiple,
        props.multipleEmit,
        props.style,
        props.highlightStyle,
        props.matchStyle,
        props.highlightMatchStyle,
        focused.value,
        active.value,
        defaultStyle.value
      ],
      paint: (dirtyRows) => {
        if (!visible.value) return;
        const r = absRect.value;
        if (r.w <= 0 || r.h <= 0) return;
        const offset = getScrollOffset(r);
        const base = props.style ?? defaultStyle.value;
        const highlightBase = props.highlightStyle ?? {
          ...base,
          inverse: true
        };
        const selectedSet = props.multiple ? new Set(getSelectedIndices()) : null;
        const paintRow = (i) => {
          const optIndex = offset + i;
          const opt = props.options[optIndex];
          if (!opt) {
            terminal.write(spaces(r.w), { x: r.x, y: r.y + i, style: base });
            return;
          }
          const isActiveRow = optIndex === active.value;
          const isChecked = props.multiple ? selectedSet.has(optIndex) : isActiveRow;
          const isHighlighted = props.multiple ? focused.value && isActiveRow : isActiveRow;
          const prefix = props.multiple ? isChecked ? "[x] " : "[ ] " : "";
          const label = sanitizeInlineText(getOptionLabel(opt));
          const detail = getOptionDetail(opt);
          const rawDetail = detail ? sanitizeInlineText(detail) : "";
          const labelText = `${prefix}${label}`;
          const labelHighlightRanges = getOptionLabelHighlightRanges(opt);
          const detailHighlightRanges = getOptionDetailHighlightRanges(opt);
          const labelAccentRanges = getOptionLabelAccentRanges(opt);
          const detailAccentRanges = getOptionDetailAccentRanges(opt);
          const detailAccentSegments = getOptionDetailAccentSegments(opt);
          const optStyle = getOptionStyle(opt);
          const rowBase = optStyle ? { ...base, ...optStyle } : base;
          const optHighlightStyle = getOptionHighlightStyle(opt);
          const rowHighlightBase = optHighlightStyle ? { ...highlightBase, ...optHighlightStyle } : highlightBase;
          const optDetailStyle = getOptionDetailStyle(opt);
          const rowDetailStyle = {
            ...rowBase,
            ...optDetailStyle ?? {},
            dim: true
          };
          const optHighlightDetailStyle = getOptionHighlightDetailStyle(opt);
          const rowHighlightDetailStyle = {
            ...rowHighlightBase,
            ...optHighlightDetailStyle ?? {},
            dim: true
          };
          const optAccentStyle = getOptionAccentStyle(opt);
          const rowAccentStyle = optAccentStyle ? { ...rowBase, ...optAccentStyle } : rowBase;
          const optHighlightAccentStyle = getOptionHighlightAccentStyle(opt);
          const rowHighlightAccentStyle = optHighlightAccentStyle ? { ...rowHighlightBase, ...optHighlightAccentStyle } : optAccentStyle ? { ...rowHighlightBase, ...optAccentStyle } : rowHighlightBase;
          if (getOptionKind(opt) === "separator") {
            terminal.write("─".repeat(r.w), {
              x: r.x,
              y: r.y + i,
              style: { ...rowBase, dim: true }
            });
            return;
          }
          const rowDetailAccentSegments = detailAccentSegments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            style: isHighlighted ? {
              ...rowHighlightDetailStyle,
              ...segment.highlightStyle ?? segment.style ?? {}
            } : { ...rowDetailStyle, ...segment.style ?? {} }
          }));
          const defaultMatchStyle = { bold: true, dim: false, underline: true };
          const matchStyle = props.matchStyle ?? defaultMatchStyle;
          const highlightMatchStyle = props.highlightMatchStyle ?? matchStyle;
          const rowMatchStyle = { ...rowBase, ...matchStyle };
          const rowHighlightMatchStyle = {
            ...rowHighlightBase,
            ...highlightMatchStyle
          };
          const rowDetailMatchStyle = {
            ...rowDetailStyle,
            ...matchStyle
          };
          const rowHighlightDetailMatchStyle = {
            ...rowHighlightDetailStyle,
            ...highlightMatchStyle
          };
          const labelCells = textCellWidth(labelText);
          const minGap = 1;
          const availableForDetail = Math.max(0, r.w - labelCells - minGap);
          if (rawDetail && availableForDetail >= 4) {
            const labelStyle = isHighlighted ? rowHighlightBase : rowBase;
            const labelHighlightStyle = isHighlighted ? rowHighlightMatchStyle : rowMatchStyle;
            const usedLabelCells = writeHighlightedText({
              terminal,
              text: labelText,
              ranges: labelHighlightRanges,
              x: r.x,
              y: r.y + i,
              maxCells: r.w,
              baseStyle: labelStyle,
              highlightStyle: labelHighlightStyle,
              accentRanges: labelAccentRanges,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle
            });
            const detailText = sliceByCells(rawDetail, availableForDetail);
            const detailCells = textCellWidth(detailText);
            const gapWidth = Math.max(0, r.w - usedLabelCells - detailCells);
            const gapStyle = isHighlighted ? rowHighlightBase : rowBase;
            terminal.write(spaces(gapWidth), {
              x: r.x + usedLabelCells,
              y: r.y + i,
              style: gapStyle
            });
            const dStyle = isHighlighted ? rowHighlightDetailStyle : rowDetailStyle;
            const dHighlightStyle = isHighlighted ? rowHighlightDetailMatchStyle : rowDetailMatchStyle;
            writeHighlightedText({
              terminal,
              text: detailText,
              ranges: detailHighlightRanges,
              x: r.x + usedLabelCells + gapWidth,
              y: r.y + i,
              maxCells: detailCells,
              baseStyle: dStyle,
              highlightStyle: dHighlightStyle,
              accentRanges: detailAccentRanges,
              accentSegments: rowDetailAccentSegments,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle
            });
          } else {
            const clippedLabel = sliceByCells(labelText, r.w);
            const style = isHighlighted ? rowHighlightBase : rowBase;
            const highlightStyle = isHighlighted ? rowHighlightMatchStyle : rowMatchStyle;
            const usedCells = writeHighlightedText({
              terminal,
              text: clippedLabel,
              ranges: labelHighlightRanges,
              x: r.x,
              y: r.y + i,
              maxCells: r.w,
              baseStyle: style,
              highlightStyle,
              accentRanges: labelAccentRanges,
              accentStyle: isHighlighted ? rowHighlightAccentStyle : rowAccentStyle
            });
            if (usedCells < r.w) {
              terminal.write(spaces(r.w - usedCells), {
                x: r.x + usedCells,
                y: r.y + i,
                style
              });
            }
          }
        };
        if (!dirtyRows) {
          for (let i = 0; i < r.h; i++) paintRow(i);
          return;
        }
        const y0 = Math.floor(r.y);
        const y1 = y0 + Math.max(0, Math.floor(r.h));
        if (y1 <= y0) return;
        let lo = 0;
        let hi = dirtyRows.length;
        while (lo < hi) {
          const mid = lo + hi >> 1;
          if ((dirtyRows[mid] ?? 0) < y0) lo = mid + 1;
          else hi = mid;
        }
        for (let idx = lo; idx < dirtyRows.length; idx++) {
          const y = Math.floor(dirtyRows[idx] ?? -1);
          if (y < y0) continue;
          if (y >= y1) break;
          const i = y - y0;
          if (i >= 0 && i < r.h) paintRow(i);
        }
      }
    }));
    return () => h("span", rootProps);
  }
});
const cardPadding = 1;
const headerH = 4;
const footerH = 2;
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "MultiSelectDemo",
  props: {
    exit: { type: Function }
  },
  setup(__props) {
    const layout = useLayout();
    const cols2 = computed(() => layout.clipRect?.w ?? 0);
    const rows2 = computed(() => layout.clipRect?.h ?? 0);
    const props = __props;
    const options = [
      {
        label: "AppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleAppleApple",
        detail: "fruit"
      },
      { label: "Banana", detail: "fruit" },
      { label: "Carrot", detail: "vegetable" },
      { label: "Duck", detail: "meat" },
      { label: "Egg", detail: "protein" }
    ];
    function clamp2(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }
    const selectedIndices = /* @__PURE__ */ ref([1, 3]);
    const selectedValues = computed(
      () => selectedIndices.value.map((i) => options[i]?.label).filter(Boolean)
    );
    const confirmedValues = /* @__PURE__ */ ref([]);
    const cardW = computed(() => clamp2(cols2.value - 4, 34, 76));
    const cardH = computed(() => clamp2(rows2.value - 4, 14, 22));
    const cardX = computed(() => Math.max(0, Math.floor((cols2.value - cardW.value) / 2)));
    const cardY = computed(() => Math.max(0, Math.floor((rows2.value - cardH.value) / 3)));
    const contentW = computed(() => Math.max(0, cardW.value - 2 - cardPadding * 2));
    const contentH = computed(() => Math.max(0, cardH.value - 2 - cardPadding * 2));
    const selectVisibleH = computed(() => {
      const available = Math.max(3, contentH.value - headerH - footerH - 2);
      return Math.min(options.length, available);
    });
    const selectBoxH = computed(() => Math.max(3, selectVisibleH.value + 2));
    function onClose() {
      props.exit?.();
    }
    function onChange(values) {
    }
    function onConfirm(values) {
      confirmedValues.value = values;
    }
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(TBox), {
        x: 0,
        y: 0,
        w: cols2.value,
        h: rows2.value,
        border: false,
        padding: 0,
        style: { bg: "black" }
      }, {
        default: withCtx(() => [
          createVNode(unref(TBox), {
            x: cardX.value,
            y: cardY.value,
            w: cardW.value,
            h: cardH.value,
            border: "",
            title: "Multi-select",
            padding: cardPadding,
            style: { fg: "cyanBright", bg: "black" }
          }, {
            default: withCtx(() => [
              createVNode(unref(TText), {
                x: 0,
                y: 0,
                w: contentW.value,
                value: "TSelect • multiple",
                style: { fg: "cyanBright", bold: true, bg: "black" }
              }, null, 8, ["w"]),
              createVNode(unref(TText), {
                x: 0,
                y: 1,
                w: contentW.value,
                value: "↑/↓ Move   Space Toggle   Enter Confirm   Esc Exit",
                style: { dim: true, bg: "black" }
              }, null, 8, ["w"]),
              createVNode(unref(TText), {
                x: 0,
                y: 2,
                w: contentW.value,
                value: `Selected: ${selectedValues.value.join(", ") || "(none)"}`,
                style: { fg: "yellowBright", bg: "black" }
              }, null, 8, ["w", "value"]),
              createVNode(unref(TText), {
                x: 0,
                y: 3,
                w: contentW.value,
                value: "─".repeat(Math.max(0, contentW.value)),
                style: { dim: true, bg: "black" }
              }, null, 8, ["w", "value"]),
              createVNode(unref(TBox), {
                x: 0,
                y: 4,
                w: contentW.value,
                h: selectBoxH.value,
                border: "",
                title: "Options",
                padding: 0,
                style: { fg: "whiteBright", dim: true, bg: "black" }
              }, {
                default: withCtx(() => [
                  createVNode(unref(TSelect), {
                    x: 0,
                    y: 0,
                    w: Math.max(0, contentW.value - 2),
                    h: selectVisibleH.value,
                    options,
                    multiple: "",
                    modelValue: selectedIndices.value,
                    "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => selectedIndices.value = $event),
                    autoFocus: "",
                    closeOnBlur: "",
                    style: { fg: "whiteBright", bg: "black" },
                    highlightStyle: { fg: "whiteBright", bg: "blueBright", bold: true },
                    onClose,
                    onChange,
                    onConfirm
                  }, null, 8, ["w", "h", "modelValue"])
                ]),
                _: 1
              }, 8, ["w", "h"]),
              createVNode(unref(TText), {
                x: 0,
                y: 4 + selectBoxH.value,
                w: contentW.value,
                value: `Confirmed: ${confirmedValues.value.join(", ") || "(none)"}`,
                style: { fg: "greenBright", bg: "black" }
              }, null, 8, ["y", "w", "value"]),
              createVNode(unref(TText), {
                x: 0,
                y: 5 + selectBoxH.value,
                w: contentW.value,
                value: `Indices: [${selectedIndices.value.join(", ")}]`,
                style: { dim: true, bg: "black" }
              }, null, 8, ["y", "w", "value"])
            ]),
            _: 1
          }, 8, ["x", "y", "w", "h"])
        ]),
        _: 1
      }, 8, ["w", "h"]);
    };
  }
});
const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 70;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 22;
let exit = () => {
};
const app = createTerminalApp({
  cols,
  rows,
  component: _sfc_main,
  props: { exit: () => exit() },
  defaultStyle: { fg: "whiteBright", bg: "black" }
});
app.mount();
const smoke = process.env.VT_SMOKE === "1";
const out = createStdoutRenderer(
  app.terminal,
  smoke ? {
    output: { write: () => {
    } },
    clear: false,
    hideCursor: false,
    altScreen: false
  } : { output: process.stdout, hideCursor: true }
);
const offCommitCursor = app.terminal.on("commit", () => {
  if (smoke) return;
  const anchor = app.getImeAnchor();
  if (anchor) {
    out.setCursor(anchor.cellX, anchor.cellY);
    out.showCursor(false);
  }
});
app.scheduler.flush();
let driver = null;
let exiting = false;
exit = () => {
  if (exiting) return;
  exiting = true;
  driver?.dispose();
  offCommitCursor();
  out.dispose();
  app.dispose();
  process.exit(0);
};
process.on("SIGINT", exit);
if (process.stdout.isTTY) {
  process.stdout.on("resize", () => {
    const nextCols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : cols;
    const nextRows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : rows;
    app.terminal.resize(nextCols, nextRows);
    app.scheduler.flush();
  });
}
if (smoke) {
  exit();
} else {
  driver = createStdinDriver({
    dispatch: (e) => {
      const prevented = app.events.dispatch(e);
      app.scheduler.flush();
      return prevented;
    },
    enableMouse: true,
    onExit: exit
  });
}
export {
  isAbsolutePath as i,
  normalizePath as n,
  resolvePath as r
};
