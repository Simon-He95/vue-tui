import type { Terminal, TerminalSize } from "../core/types.js";
import { getRootTerminal } from "../core/terminal/create-terminal.js";
import {
  nowTerminalGraphicTraceTime,
  recordTerminalGraphicTrace,
} from "./terminal-graphics-trace.js";

export type TerminalGraphicsProtocol = "kitty" | "iterm2" | "sixel";
export type TerminalGraphicsFallbackProtocol = "unicode" | "none";
export type TerminalGraphicsResolvedProtocol =
  | TerminalGraphicsProtocol
  | TerminalGraphicsFallbackProtocol;
export type TerminalGraphicsOperation = "draw" | "clear";
export type TerminalGraphicsMultiplexer = "tmux" | "screen" | "zellij";

const TERMINAL_GRAPHICS_PROTOCOL_PRIORITY: readonly TerminalGraphicsProtocol[] = [
  "kitty",
  "iterm2",
  "sixel",
];

export type TerminalGraphicsDetectionInput = Readonly<{
  env?: Record<string, unknown>;
  isTTY?: boolean;
  stdoutIsTTY?: boolean;
  protocol?: TerminalGraphicsResolvedProtocol | "auto" | "off";
  force?: boolean;
  passthrough?: boolean;
}>;

export type TerminalGraphicsCapabilities = Readonly<{
  supported: boolean;
  kitty: boolean;
  iterm2: boolean;
  sixel: boolean;
  preferredProtocol: TerminalGraphicsProtocol | null;
  protocol: TerminalGraphicsResolvedProtocol;
  candidates: readonly TerminalGraphicsProtocol[];
  stdoutIsTTY: boolean;
  insideTmux: boolean;
  insideScreen: boolean;
  insideZellij: boolean;
  multiplexer: TerminalGraphicsMultiplexer | null;
  passthrough: boolean;
  forced: boolean;
  reason?: string;
}>;

export type RawTerminalGraphicFrame = Readonly<{
  id?: string;
  protocol: TerminalGraphicsProtocol;
  sequence: string;
  fallbackText?: string;
  width: number;
  height: number;
}>;

export type ValidatedTerminalGraphicFrame = RawTerminalGraphicFrame &
  Readonly<{
    id: string;
    fallbackText: string;
    width: number;
    height: number;
  }>;

export type TerminalGraphicsPayload = Readonly<{
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  protocol: TerminalGraphicsProtocol;
  sequence: string;
  resizeSequence?: string;
  resizeRedraw?: boolean;
  placementMoveWithoutClear?: boolean;
  allowTextOverlay?: boolean;
  forceDraw?: boolean;
  deferFlush?: boolean;
  retainOnClear?: boolean;
  op?: TerminalGraphicsOperation;
  order?: number;
  fallbackText?: string;
  clearSequence?: string;
}>;

export type TerminalGraphicsOutput = Readonly<{
  capabilities: TerminalGraphicsCapabilities;
  queue: (payload: TerminalGraphicsPayload) => boolean;
  clear?: (id: string) => boolean;
  isActive?: (id: string) => boolean;
}>;

const ESC = "\x1B";
const BEL = "\x07";
const ST = `${ESC}\\`;
const ESC_RE = "\\u001B";
const BEL_RE = "\\u0007";

const CSI_RE = new RegExp(`${ESC_RE}\\[[0-?]*[ -/]*[@-~]`, "g");
const OSC_RE = new RegExp(`${ESC_RE}\\][\\s\\S]*?(?:${BEL_RE}|${ESC_RE}\\\\)`, "g");
const DCS_RE = new RegExp(`${ESC_RE}P[\\s\\S]*?${ESC_RE}\\\\`, "g");
const APC_RE = new RegExp(`${ESC_RE}_[\\s\\S]*?${ESC_RE}\\\\`, "g");
const C1_CSI_RE = new RegExp("\\u009B[0-?]*[ -/]*[@-~]", "g");
const C1_OSC_RE = new RegExp(`\\u009D[\\s\\S]*?(?:${BEL_RE}|\\u009C)`, "g");
const C1_DCS_RE = new RegExp("\\u0090[\\s\\S]*?\\u009C", "g");
const C1_APC_RE = new RegExp("\\u009F[\\s\\S]*?\\u009C", "g");

export const MAX_TERMINAL_GRAPHICS_SEQUENCE_CHARS = 16 * 1024 * 1024;
export const MAX_TERMINAL_GRAPHICS_FALLBACK_CHARS = 16_384;
export const MAX_TERMINAL_GRAPHIC_CELLS = 10_000;

type TerminalGraphicsRegistry = Readonly<{
  outputs: WeakMap<Terminal, TerminalGraphicsOutput>;
  outputVersions: WeakMap<Terminal, number>;
  outputListeners: WeakMap<Terminal, Set<() => void>>;
}>;

const TERMINAL_GRAPHICS_REGISTRY = Symbol.for("@simon_he/vue-tui:v1:terminal-graphics");
const terminalGraphicsGlobal = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
const terminalGraphicsRegistry = (terminalGraphicsGlobal[TERMINAL_GRAPHICS_REGISTRY] as
  | TerminalGraphicsRegistry
  | undefined) ?? {
  outputs: new WeakMap<Terminal, TerminalGraphicsOutput>(),
  outputVersions: new WeakMap<Terminal, number>(),
  outputListeners: new WeakMap<Terminal, Set<() => void>>(),
};
terminalGraphicsGlobal[TERMINAL_GRAPHICS_REGISTRY] = terminalGraphicsRegistry;

const terminalGraphicsOutputs = terminalGraphicsRegistry.outputs;
const terminalGraphicsOutputVersions = terminalGraphicsRegistry.outputVersions;
const terminalGraphicsOutputListeners = terminalGraphicsRegistry.outputListeners;

function notifyTerminalGraphicsOutputChange(terminal: Terminal): void {
  const version = (terminalGraphicsOutputVersions.get(terminal) ?? 0) + 1;
  terminalGraphicsOutputVersions.set(terminal, version);
  const listeners = terminalGraphicsOutputListeners.get(terminal);
  if (!listeners) return;

  for (const listener of listeners) listener();
}

export function registerTerminalGraphicsOutput(
  terminal: Terminal,
  output: TerminalGraphicsOutput,
): () => void {
  const rootTerminal = getRootTerminal(terminal);
  terminalGraphicsOutputs.set(rootTerminal, output);
  notifyTerminalGraphicsOutputChange(rootTerminal);
  return () => {
    if (terminalGraphicsOutputs.get(rootTerminal) === output) {
      terminalGraphicsOutputs.delete(rootTerminal);
      notifyTerminalGraphicsOutputChange(rootTerminal);
    }
  };
}

export function getTerminalGraphicsOutput(terminal: Terminal): TerminalGraphicsOutput | null {
  return terminalGraphicsOutputs.get(getRootTerminal(terminal)) ?? null;
}

export function getTerminalGraphicsOutputVersion(terminal: Terminal): number {
  return terminalGraphicsOutputVersions.get(getRootTerminal(terminal)) ?? 0;
}

export function subscribeTerminalGraphicsOutput(
  terminal: Terminal,
  listener: () => void,
): () => void {
  const rootTerminal = getRootTerminal(terminal);
  let listeners = terminalGraphicsOutputListeners.get(rootTerminal);
  if (!listeners) {
    listeners = new Set();
    terminalGraphicsOutputListeners.set(rootTerminal, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) terminalGraphicsOutputListeners.delete(rootTerminal);
  };
}

function envString(env: Record<string, unknown>, key: string): string | undefined {
  const value = env[key];
  return value == null ? undefined : String(value);
}

function truthy(value: unknown): boolean {
  if (value == null) return false;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function readStdoutIsTTY(): boolean {
  const maybeProcess = (
    globalThis as {
      process?: {
        stdout?: {
          isTTY?: boolean;
        };
      };
    }
  ).process;

  return Boolean(maybeProcess?.stdout?.isTTY);
}

function readProcessEnv(): Record<string, unknown> {
  const maybeProcess = (
    globalThis as {
      process?: {
        env?: Record<string, unknown>;
      };
    }
  ).process;

  return maybeProcess?.env ?? {};
}

function normalizeMode(value: unknown): TerminalGraphicsResolvedProtocol | "auto" {
  const raw = String(value ?? "auto")
    .trim()
    .toLowerCase();

  if (
    raw === "auto" ||
    raw === "off" ||
    raw === "none" ||
    raw === "kitty" ||
    raw === "iterm2" ||
    raw === "sixel" ||
    raw === "unicode"
  ) {
    return raw === "off" ? "none" : raw;
  }

  return "auto";
}

export function isTerminalGraphicsProtocol(value: unknown): value is TerminalGraphicsProtocol {
  return value === "kitty" || value === "iterm2" || value === "sixel";
}

function uniqueProtocols(protocols: TerminalGraphicsProtocol[]): TerminalGraphicsProtocol[] {
  return [...new Set(protocols)];
}

function pickBestTerminalGraphicsProtocol(
  protocols: readonly TerminalGraphicsProtocol[],
): TerminalGraphicsProtocol | null {
  const available = new Set(protocols);

  for (const protocol of TERMINAL_GRAPHICS_PROTOCOL_PRIORITY) {
    if (available.has(protocol)) return protocol;
  }

  return null;
}

function detectCandidates(env: Record<string, unknown>): TerminalGraphicsProtocol[] {
  const candidates: TerminalGraphicsProtocol[] = [];
  const term = String(envString(env, "TERM") ?? "").toLowerCase();
  const termProgram = String(envString(env, "TERM_PROGRAM") ?? "").toLowerCase();
  const termProgramVersion = String(envString(env, "TERM_PROGRAM_VERSION") ?? "").toLowerCase();

  if (
    envString(env, "KITTY_WINDOW_ID") ||
    envString(env, "GHOSTTY_RESOURCES_DIR") ||
    /(?:^|-)kitty(?:-|$)/i.test(term) ||
    term.includes("ghostty") ||
    termProgram.includes("ghostty")
  ) {
    candidates.push("kitty");
  }

  if (
    termProgram.includes("iterm") ||
    termProgram.includes("wezterm") ||
    envString(env, "WEZTERM_PANE") ||
    envString(env, "WEZTERM_EXECUTABLE")
  ) {
    candidates.push("iterm2");
  }

  if (
    truthy(envString(env, "VUE_TUI_SIXEL")) ||
    truthy(envString(env, "VUE_TUI_GRAPHICS_SIXEL")) ||
    String(envString(env, "TERMINAL_GRAPHICS") ?? "")
      .toLowerCase()
      .includes("sixel") ||
    /\bsixel\b/i.test(`${term} ${termProgram} ${termProgramVersion}`)
  ) {
    candidates.push("sixel");
  }

  return uniqueProtocols(candidates);
}

function capabilitiesFor(
  protocol: TerminalGraphicsResolvedProtocol,
  input: Readonly<{
    candidates?: readonly TerminalGraphicsProtocol[];
    stdoutIsTTY: boolean;
    insideTmux: boolean;
    insideScreen: boolean;
    insideZellij: boolean;
    multiplexer: TerminalGraphicsMultiplexer | null;
    passthrough: boolean;
    forced: boolean;
    reason?: string;
  }>,
): TerminalGraphicsCapabilities {
  const supported = protocol === "kitty" || protocol === "iterm2" || protocol === "sixel";
  const candidates = uniqueProtocols([...(input.candidates ?? (supported ? [protocol] : []))]);
  return {
    supported,
    kitty: protocol === "kitty" || candidates.includes("kitty"),
    iterm2: protocol === "iterm2" || candidates.includes("iterm2"),
    sixel: protocol === "sixel" || candidates.includes("sixel"),
    preferredProtocol: supported ? protocol : null,
    protocol,
    candidates,
    stdoutIsTTY: input.stdoutIsTTY,
    insideTmux: input.insideTmux,
    insideScreen: input.insideScreen,
    insideZellij: input.insideZellij,
    multiplexer: input.multiplexer,
    passthrough: input.passthrough,
    forced: input.forced,
    reason: input.reason,
  };
}

export function detectTerminalGraphicsCapabilities(
  options: TerminalGraphicsDetectionInput = {},
): TerminalGraphicsCapabilities {
  const env = options.env ?? readProcessEnv();
  const stdoutIsTTY = options.stdoutIsTTY ?? options.isTTY ?? readStdoutIsTTY();
  const term = String(envString(env, "TERM") ?? "").toLowerCase();
  const insideTmux = Boolean(envString(env, "TMUX")) || term.includes("tmux");
  const insideScreen = Boolean(envString(env, "STY")) || term.startsWith("screen");
  const insideZellij =
    Boolean(envString(env, "ZELLIJ") || envString(env, "ZELLIJ_SESSION_NAME")) ||
    term.includes("zellij");
  const multiplexer: TerminalGraphicsMultiplexer | null = insideTmux
    ? "tmux"
    : insideScreen
      ? "screen"
      : insideZellij
        ? "zellij"
        : null;
  const passthroughRequested =
    options.passthrough ??
    (truthy(envString(env, "VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH")) ||
      truthy(envString(env, "VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH")));
  const passthroughSupported = !multiplexer || multiplexer === "tmux";
  const passthrough = passthroughRequested && passthroughSupported;
  const protocolOptionProvided = options.protocol != null;
  const mode = normalizeMode(
    options.protocol ??
      envString(env, "VUE_TUI_TERMINAL_GRAPHICS") ??
      envString(env, "VUE_TUI_GRAPHICS_PROTOCOL"),
  );
  const forceFromOption = options.force === true;
  const force = options.force ?? truthy(envString(env, "VUE_TUI_GRAPHICS_FORCE"));
  const base = {
    stdoutIsTTY,
    insideTmux,
    insideScreen,
    insideZellij,
    multiplexer,
    passthrough,
    forced: force,
  };

  if (mode === "none") {
    return capabilitiesFor("none", {
      ...base,
      reason: protocolOptionProvided ? "disabled-by-option" : "disabled-by-env",
    });
  }

  if (!stdoutIsTTY && !force) {
    return capabilitiesFor("unicode", { ...base, reason: "stdout-is-not-tty" });
  }

  if (truthy(envString(env, "CI")) && !force) {
    return capabilitiesFor("unicode", { ...base, reason: "ci" });
  }

  if (multiplexer && passthroughRequested && !passthroughSupported && !force) {
    return capabilitiesFor("unicode", {
      ...base,
      reason: `${multiplexer}-passthrough-not-implemented`,
    });
  }

  if (multiplexer && !passthrough && !force) {
    return capabilitiesFor("unicode", {
      ...base,
      reason: `${multiplexer}-without-passthrough`,
    });
  }

  if (mode === "kitty" || mode === "iterm2" || mode === "sixel") {
    return capabilitiesFor(mode, {
      ...base,
      candidates: [mode],
      reason: force
        ? forceFromOption
          ? "forced-by-option"
          : "forced-by-env"
        : protocolOptionProvided
          ? "selected-by-option"
          : "selected-by-env",
    });
  }

  if (mode === "unicode") {
    return capabilitiesFor("unicode", {
      ...base,
      reason: protocolOptionProvided ? "unicode-forced-by-option" : "unicode-forced-by-env",
    });
  }

  const candidates = detectCandidates(env);
  const preferredProtocol = pickBestTerminalGraphicsProtocol(candidates);
  const protocol: TerminalGraphicsResolvedProtocol = preferredProtocol ?? "unicode";
  return capabilitiesFor(protocol, {
    ...base,
    candidates,
    reason: protocol === "unicode" ? "no-supported-graphics-protocol-detected" : "auto-detected",
  });
}

export function hashTerminalGraphicsString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function stableTerminalGraphicNumericId(
  input: string,
  options: Readonly<{ min?: number; max?: number }> = {},
): number {
  const min = Math.floor(options.min ?? 1);
  const max = Math.floor(options.max ?? 0x7fffffff);
  const span = Math.max(1, max - min + 1);
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return min + ((hash >>> 0) % span);
}

function stableId(input: string): string {
  return `tg_${hashTerminalGraphicsString(input)}`;
}

function positiveGraphicInt(value: unknown, max: number): number | null {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(max, n);
}

export function normalizeTerminalGraphicSize(
  width: unknown,
  height: unknown,
): { width: number; height: number } | null {
  const w = positiveGraphicInt(width, MAX_TERMINAL_GRAPHIC_CELLS);
  const h = positiveGraphicInt(height, MAX_TERMINAL_GRAPHIC_CELLS);

  if (w == null || h == null) return null;
  if (w * h > MAX_TERMINAL_GRAPHIC_CELLS) return null;

  return { width: w, height: h };
}

export function canDrawTerminalGraphicRect(
  rect: Readonly<{ x: number; y: number; w: number; h: number }>,
  size: TerminalSize,
): boolean {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  const graphicSize = normalizeTerminalGraphicSize(rect.w, rect.h);
  const cols = Math.max(0, Math.floor(size.cols));
  const rows = Math.max(0, Math.floor(size.rows));

  return (
    graphicSize != null &&
    cols > 0 &&
    rows > 0 &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x < cols &&
    y < rows
  );
}

function withoutNestedEscapes(body: string): boolean {
  return !body.includes(ESC) && !body.includes(BEL);
}

function isBase64ish(value: string): boolean {
  return /^[A-Za-z0-9+/=]*$/.test(value);
}

type KittyPacket = Readonly<{
  controls: ReadonlyMap<string, string>;
  payload: string;
}>;

function parseKittyControls(raw: string): Map<string, string> | null {
  const out = new Map<string, string>();

  if (!/^[A-Za-z0-9_,=+.\-:]*$/.test(raw)) return null;

  for (const part of raw.split(",")) {
    if (!part) continue;

    const eq = part.indexOf("=");
    if (eq <= 0) return null;

    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);

    if (!/^[A-Za-z]$/.test(key)) return null;
    if (!/^[A-Za-z0-9+.\-:]*$/.test(value)) return null;

    out.set(key, value);
  }

  return out;
}

function parseKittyPackets(sequence: string): KittyPacket[] | null {
  const packets: KittyPacket[] = [];
  let index = 0;

  while (index < sequence.length) {
    if (!sequence.startsWith(`${ESC}_G`, index)) return null;

    const end = sequence.indexOf(ST, index + 3);
    if (end < 0) return null;

    const body = sequence.slice(index + 3, end);
    if (!withoutNestedEscapes(body)) return null;

    const semicolon = body.indexOf(";");
    const rawControls = semicolon >= 0 ? body.slice(0, semicolon) : body;
    const payload = semicolon >= 0 ? body.slice(semicolon + 1) : "";

    const controls = parseKittyControls(rawControls);
    if (!controls) return null;
    if (payload && !isBase64ish(payload)) return null;

    packets.push({ controls, payload });
    index = end + ST.length;
  }

  return packets.length ? packets : null;
}

const KITTY_DRAW_FIRST_CONTROL_KEYS = new Set([
  "a",
  "f",
  "q",
  "C",
  "i",
  "I",
  "p",
  "c",
  "r",
  "x",
  "y",
  "w",
  "h",
  "z",
  "m",
  "t",
]);
const KITTY_DRAW_CONTINUATION_CONTROL_KEYS = new Set(["a", "q", "m"]);
const KITTY_CLEAR_CONTROL_KEYS = new Set(["a", "d", "i", "I", "p", "q"]);

function kittyControlsUseOnly(
  controls: ReadonlyMap<string, string>,
  allowed: ReadonlySet<string>,
): boolean {
  for (const key of controls.keys()) {
    if (!allowed.has(key)) return false;
  }

  return true;
}

const KITTY_UINT32_MAX = 0xffffffff;
const KITTY_INT32_MIN = -0x80000000;
const KITTY_INT32_MAX = 0x7fffffff;

function kittyControlIsUint32(
  controls: ReadonlyMap<string, string>,
  key: string,
  min = 0,
): boolean {
  const value = controls.get(key);
  if (value == null) return true;
  if (!/^\d+$/.test(value)) return false;

  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= KITTY_UINT32_MAX;
}

function kittyControlIsInt32(controls: ReadonlyMap<string, string>, key: string): boolean {
  const value = controls.get(key);
  if (value == null) return true;
  if (!/^-?\d+$/.test(value)) return false;

  const n = Number(value);
  return Number.isSafeInteger(n) && n >= KITTY_INT32_MIN && n <= KITTY_INT32_MAX;
}

function kittyControlPositiveInt(
  controls: ReadonlyMap<string, string>,
  key: string,
  fallback: number,
): number | null {
  const value = controls.get(key);
  if (value == null) return fallback;
  if (!/^\d+$/.test(value)) return null;

  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

function kittyControlIsTerminalGraphicCellsBounded(controls: ReadonlyMap<string, string>): boolean {
  const columns = kittyControlPositiveInt(controls, "c", 1);
  const rows = kittyControlPositiveInt(controls, "r", 1);

  return columns != null && rows != null && columns * rows <= MAX_TERMINAL_GRAPHIC_CELLS;
}

function validateKittySharedSafeControls(controls: ReadonlyMap<string, string>): boolean {
  const q = controls.get("q");
  if (q != null && !/^[0-2]$/.test(q)) return false;

  const cursorMove = controls.get("C");
  if (cursorMove != null && !/^[01]$/.test(cursorMove)) return false;

  for (const key of ["i", "I", "p"]) {
    if (!kittyControlIsUint32(controls, key)) return false;
  }

  for (const key of ["c", "r"]) {
    if (!kittyControlIsUint32(controls, key, 1)) return false;
  }
  if (!kittyControlIsTerminalGraphicCellsBounded(controls)) return false;

  for (const key of ["x", "y"]) {
    if (!kittyControlIsUint32(controls, key)) return false;
  }

  for (const key of ["w", "h"]) {
    if (!kittyControlIsUint32(controls, key, 1)) return false;
  }

  if (!kittyControlIsInt32(controls, "z")) return false;

  // Refuse Kitty local-client transfers: file/temp-file/shared-memory modes
  // make the terminal read host paths or shared-memory names from the payload.
  const transmissionMedium = controls.get("t");
  if (transmissionMedium != null && transmissionMedium !== "d") return false;

  return true;
}

function validateKittySequence(sequence: string, op: TerminalGraphicsOperation = "draw"): boolean {
  const packets = parseKittyPackets(sequence);
  if (!packets) return false;

  if (op === "clear") {
    if (packets.length !== 1) return false;

    const packet = packets[0]!;
    if (!kittyControlsUseOnly(packet.controls, KITTY_CLEAR_CONTROL_KEYS)) return false;
    if (!validateKittySharedSafeControls(packet.controls)) return false;
    if (packet.payload) return false;
    if (packet.controls.get("a") !== "d") return false;

    const d = packet.controls.get("d");
    return d == null || /^[aAcCiI]$/.test(d);
  }

  const first = packets[0]!;
  if (!kittyControlsUseOnly(first.controls, KITTY_DRAW_FIRST_CONTROL_KEYS)) return false;
  if (!validateKittySharedSafeControls(first.controls)) return false;
  if (first.controls.get("a") === "p") {
    if (packets.length !== 1) return false;
    if (first.payload) return false;
    if (!first.controls.has("i") && !first.controls.has("I")) return false;
    return true;
  }

  if (first.controls.get("a") !== "T") return false;
  if (!first.payload) return false;

  const f = first.controls.get("f");
  if (f != null && f !== "24" && f !== "32" && f !== "100") return false;

  const firstMore = first.controls.get("m");
  if (firstMore != null && firstMore !== "0" && firstMore !== "1") return false;
  if (packets.length > 1 && firstMore !== "1") return false;

  for (let i = 1; i < packets.length; i++) {
    const packet = packets[i]!;
    if (!kittyControlsUseOnly(packet.controls, KITTY_DRAW_CONTINUATION_CONTROL_KEYS)) return false;
    if (!validateKittySharedSafeControls(packet.controls)) return false;

    const action = packet.controls.get("a");
    if (action != null && action !== "T") return false;

    const m = packet.controls.get("m");
    if (m !== "0" && m !== "1") return false;
    if (!packet.payload && !(i === packets.length - 1 && m === "0")) return false;
  }

  if (packets.length > 1 && packets[packets.length - 1]!.controls.get("m") === "1") {
    return false;
  }

  return true;
}

function validateIterm2Dimension(value: string): boolean {
  return /^auto$/i.test(value) || /^(?:[1-9]\d{0,4})(?:px|%)?$/.test(value);
}

function validateIterm2Params(params: string): boolean {
  const seen = new Set<string>();
  let inline = false;

  for (const part of params.split(";").filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq <= 0) return false;

    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (seen.has(key)) return false;
    seen.add(key);

    switch (key) {
      case "inline":
        if (value !== "1") return false;
        inline = true;
        break;
      case "width":
      case "height":
        if (!validateIterm2Dimension(value)) return false;
        break;
      case "preserveAspectRatio":
      case "doNotMoveCursor":
        if (!/^[01]$/.test(value)) return false;
        break;
      default:
        return false;
    }
  }

  return inline;
}

function validateIterm2Sequence(sequence: string, op: TerminalGraphicsOperation = "draw"): boolean {
  if (op === "clear") return false;

  let index = 0;

  while (index < sequence.length) {
    const prefix = `${ESC}]1337;File=`;
    if (!sequence.startsWith(prefix, index)) return false;

    const belEnd = sequence.indexOf(BEL, index + prefix.length);
    const stEnd = sequence.indexOf(ST, index + prefix.length);
    const end = belEnd >= 0 && stEnd >= 0 ? Math.min(belEnd, stEnd) : belEnd >= 0 ? belEnd : stEnd;

    if (end < 0) return false;

    const body = sequence.slice(index + `${ESC}]1337;`.length, end);
    if (!body.startsWith("File=")) return false;
    if (!withoutNestedEscapes(body)) return false;

    const colon = body.indexOf(":");
    if (colon < 0) return false;

    const params = body.slice("File=".length, colon);
    const payload = body.slice(colon + 1);

    if (!/^[A-Za-z0-9_=;,.%+\-:]*$/.test(params)) return false;
    if (!payload || !isBase64ish(payload)) return false;

    if (!validateIterm2Params(params)) return false;

    index = end + (end === stEnd ? ST.length : BEL.length);
  }

  return sequence.length > 0;
}

function validateSixelSequence(sequence: string, op: TerminalGraphicsOperation = "draw"): boolean {
  if (op === "clear") return false;

  let index = 0;

  while (index < sequence.length) {
    if (!sequence.startsWith(`${ESC}P`, index)) return false;

    const end = sequence.indexOf(ST, index + 2);
    if (end < 0) return false;

    const body = sequence.slice(index + 2, end);
    if (!withoutNestedEscapes(body)) return false;

    for (let i = 0; i < body.length; i++) {
      const code = body.charCodeAt(i);
      if (code < 0x20 || code > 0x7e) return false;
    }

    const q = body.indexOf("q");
    if (q < 0 || q > 32) return false;

    const introducer = body.slice(0, q);
    if (!/^[0-9;?]*$/.test(introducer)) return false;

    const data = body.slice(q + 1);
    if (!data.length) return false;

    index = end + ST.length;
  }

  return sequence.length > 0;
}

function stripTerminalControlChars(value: string): string {
  let out = "";

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f ||
      (code >= 0x80 && code <= 0x9f)
    ) {
      continue;
    }

    out += value[index];
  }

  return out;
}

export function sanitizeTerminalFallbackText(text: unknown): string {
  return stripTerminalControlChars(
    String(text ?? "")
      .replace(OSC_RE, "")
      .replace(CSI_RE, "")
      .replace(DCS_RE, "")
      .replace(APC_RE, "")
      .replace(C1_OSC_RE, "")
      .replace(C1_CSI_RE, "")
      .replace(C1_DCS_RE, "")
      .replace(C1_APC_RE, ""),
  ).slice(0, MAX_TERMINAL_GRAPHICS_FALLBACK_CHARS);
}

export function validateTerminalGraphicFrame(
  frame: RawTerminalGraphicFrame,
): ValidatedTerminalGraphicFrame | null {
  const startedAt = nowTerminalGraphicTraceTime();
  const protocol = isTerminalGraphicsProtocol(frame.protocol) ? frame.protocol : undefined;
  const recordValidation = () => {
    recordTerminalGraphicTrace({
      type: "validate-end",
      id: frame.id ?? "",
      protocol,
      durationMs: nowTerminalGraphicTraceTime() - startedAt,
      bytes: typeof frame.sequence === "string" ? frame.sequence.length : undefined,
    });
  };

  if (!protocol) {
    recordValidation();
    return null;
  }

  const sequence = String(frame.sequence ?? "");

  if (sequence.length <= 0 || sequence.length > MAX_TERMINAL_GRAPHICS_SEQUENCE_CHARS) {
    recordValidation();
    return null;
  }

  const size = normalizeTerminalGraphicSize(frame.width, frame.height);
  if (!size) {
    recordValidation();
    return null;
  }

  const ok =
    protocol === "kitty"
      ? validateKittySequence(sequence, "draw")
      : protocol === "iterm2"
        ? validateIterm2Sequence(sequence, "draw")
        : validateSixelSequence(sequence, "draw");

  if (!ok) {
    recordValidation();
    return null;
  }

  recordValidation();
  return {
    ...frame,
    protocol,
    id: frame.id || stableId(`${protocol}:${sequence.slice(0, 4096)}`),
    sequence,
    fallbackText: sanitizeTerminalFallbackText(frame.fallbackText),
    width: size.width,
    height: size.height,
  };
}

export function isSafeTerminalGraphicsSequence(
  sequence: string,
  protocol: TerminalGraphicsProtocol,
  op: TerminalGraphicsOperation = "draw",
): boolean {
  if (!isTerminalGraphicsProtocol(protocol)) return false;
  if (!sequence || sequence.length > MAX_TERMINAL_GRAPHICS_SEQUENCE_CHARS) return false;

  return protocol === "kitty"
    ? validateKittySequence(sequence, op)
    : protocol === "iterm2"
      ? validateIterm2Sequence(sequence, op)
      : validateSixelSequence(sequence, op);
}

export function validateTerminalGraphicsPayload(
  payload: TerminalGraphicsPayload,
  capabilities: TerminalGraphicsCapabilities,
): boolean {
  if (!payload.id.trim()) return false;
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return false;
  if (!normalizeTerminalGraphicSize(payload.w ?? 1, payload.h ?? 1)) return false;
  if (!capabilities.supported) return false;
  if (!isTerminalGraphicsProtocol(payload.protocol)) return false;
  if (payload.protocol !== capabilities.preferredProtocol) return false;

  return isSafeTerminalGraphicsSequence(payload.sequence, payload.protocol, payload.op ?? "draw");
}

function uint32Control(key: string, value: number | undefined, min = 0): string {
  if (value == null) return "";
  const n = Math.floor(value);
  return Number.isSafeInteger(n) && n >= min && n <= KITTY_UINT32_MAX ? `${key}=${n}` : "";
}

function int32Control(key: string, value: number | undefined): string {
  if (value == null) return "";
  const n = Math.floor(value);
  return Number.isSafeInteger(n) && n >= KITTY_INT32_MIN && n <= KITTY_INT32_MAX
    ? `${key}=${n}`
    : "";
}

function sanitizeBase64(value: string): string {
  const data = String(value ?? "").replace(/\s+/g, "");
  return isBase64ish(data) ? data : "";
}

function kittyGraphicCellControls(columns: number | undefined, rows: number | undefined): string[] {
  if (columns == null && rows == null) return [];

  const size = normalizeTerminalGraphicSize(columns ?? 1, rows ?? 1);
  if (!size) return [];

  return [columns == null ? "" : `c=${size.width}`, rows == null ? "" : `r=${size.height}`];
}

function kittyGraphicSourceControls(
  sourceX: number | undefined,
  sourceY: number | undefined,
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
): string[] {
  return [
    uint32Control("x", sourceX),
    uint32Control("y", sourceY),
    uint32Control("w", sourceWidth, 1),
    uint32Control("h", sourceHeight, 1),
  ];
}

function chunkBase64(value: string, chunkSize: number): string[] {
  const normalizedSize = Math.max(4, Math.floor(chunkSize / 4) * 4);
  const chunks: string[] = [];

  for (let index = 0; index < value.length; index += normalizedSize) {
    chunks.push(value.slice(index, index + normalizedSize));
  }

  return chunks.length ? chunks : [""];
}

export type CreateKittyGraphicsSequenceOptions = Readonly<{
  imageId?: number;
  imageNumber?: number;
  placementId?: number;
  columns?: number;
  rows?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  zIndex?: number;
  quiet?: boolean;
  noCursorMove?: boolean;
  chunkSize?: number;
}>;

export type CreateKittyPlacementSequenceOptions = Readonly<{
  imageId: number;
  imageNumber?: number;
  placementId?: number;
  columns?: number;
  rows?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  zIndex?: number;
  quiet?: boolean;
  noCursorMove?: boolean;
}>;

export function createKittyPlacementSequence(options: CreateKittyPlacementSequenceOptions): string {
  const imageId = uint32Control("i", options.imageId);
  const imageNumber = uint32Control("I", options.imageNumber);
  if (!imageId && !imageNumber) return "";

  const controls = [
    "a=p",
    options.quiet === false ? "" : "q=2",
    options.noCursorMove === false ? "" : "C=1",
    imageId,
    imageNumber,
    uint32Control("p", options.placementId),
    ...kittyGraphicCellControls(options.columns, options.rows),
    ...kittyGraphicSourceControls(
      options.sourceX,
      options.sourceY,
      options.sourceWidth,
      options.sourceHeight,
    ),
    int32Control("z", options.zIndex),
  ].filter(Boolean);

  return `${ESC}_G${controls.join(",")}${ST}`;
}

export function createKittyGraphicsSequence(
  base64Png: string,
  options: CreateKittyGraphicsSequenceOptions = {},
): string {
  const data = sanitizeBase64(base64Png);
  if (!data) return "";

  const chunks = chunkBase64(data, options.chunkSize ?? 4096);
  const baseControls = [
    "a=T",
    "f=100",
    options.quiet === false ? "" : "q=2",
    options.noCursorMove === false ? "" : "C=1",
    uint32Control("i", options.imageId),
    uint32Control("I", options.imageNumber),
    uint32Control("p", options.placementId),
    ...kittyGraphicCellControls(options.columns, options.rows),
    ...kittyGraphicSourceControls(
      options.sourceX,
      options.sourceY,
      options.sourceWidth,
      options.sourceHeight,
    ),
    int32Control("z", options.zIndex),
  ].filter(Boolean);

  return chunks
    .map((chunk, index) => {
      const last = index === chunks.length - 1;
      const controls =
        index === 0
          ? [...baseControls, chunks.length > 1 ? `m=${last ? 0 : 1}` : ""]
          : [options.quiet === false ? "" : "q=2", `m=${last ? 0 : 1}`].filter(Boolean);

      return `${ESC}_G${controls.filter(Boolean).join(",")};${chunk}${ST}`;
    })
    .join("");
}

export type CreateKittyDeleteGraphicsSequenceOptions = Readonly<{
  imageId?: number;
  placementId?: number;
  currentCell?: boolean;
  allVisible?: boolean;
  freeImageData?: boolean;
  quiet?: boolean;
}>;

export function createKittyDeleteGraphicsSequence(
  options: CreateKittyDeleteGraphicsSequenceOptions = {},
): string {
  const controls = ["a=d"];

  if (options.allVisible) {
    controls.push(`d=${options.freeImageData ? "A" : "a"}`);
  } else if (options.imageId != null) {
    const imageId = uint32Control("i", options.imageId);
    const placementId = uint32Control("p", options.placementId);
    if (!imageId || (options.placementId != null && !placementId)) return "";

    controls.push(`d=${options.freeImageData ? "I" : "i"}`);
    controls.push(imageId);
    controls.push(placementId);
  } else if (options.currentCell) {
    controls.push(`d=${options.freeImageData ? "C" : "c"}`);
  } else {
    return "";
  }

  if (options.quiet !== false) controls.push("q=2");

  return `${ESC}_G${controls.filter(Boolean).join(",")}${ST}`;
}

export function createIterm2InlineImageSequence(
  base64Data: string,
  options: Readonly<{
    width?: number | string;
    height?: number | string;
    preserveAspectRatio?: boolean;
    doNotMoveCursor?: boolean;
  }> = {},
): string {
  const data = sanitizeBase64(base64Data);
  if (!data) return "";

  const params = [
    "inline=1",
    options.width != null ? `width=${formatItermDimension(options.width)}` : "",
    options.height != null ? `height=${formatItermDimension(options.height)}` : "",
    `preserveAspectRatio=${options.preserveAspectRatio === false ? 0 : 1}`,
    options.doNotMoveCursor === false ? "" : "doNotMoveCursor=1",
  ].filter(Boolean);
  return `${ESC}]1337;File=${params.join(";")}:${data}${BEL}`;
}

function formatItermDimension(value: number | string): string {
  if (typeof value === "number") {
    const n = Math.floor(value);
    if (!Number.isFinite(n)) return "auto";
    return String(Math.min(99_999, Math.max(1, n)));
  }

  const raw = String(value ?? "").trim();
  return validateIterm2Dimension(raw) ? raw : "auto";
}

export function wrapTerminalGraphicsForMultiplexer(
  sequence: string,
  capabilities: TerminalGraphicsCapabilities,
): string {
  if (!capabilities.passthrough) return sequence;

  if (capabilities.multiplexer === "tmux") {
    return `${ESC}Ptmux;${sequence.split(ESC).join(`${ESC}${ESC}`)}${ST}`;
  }

  return sequence;
}
