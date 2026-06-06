import type { Terminal } from "../core/types.js";
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

export const MAX_TERMINAL_GRAPHICS_SEQUENCE_CHARS = 2 * 1024 * 1024;
export const MAX_TERMINAL_GRAPHICS_FALLBACK_CHARS = 16_384;
export const MAX_TERMINAL_GRAPHIC_CELLS = 10_000;

const terminalGraphicsOutputs = new WeakMap<Terminal, TerminalGraphicsOutput>();
const terminalGraphicsOutputVersions = new WeakMap<Terminal, number>();
const terminalGraphicsOutputListeners = new WeakMap<Terminal, Set<() => void>>();

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
  terminalGraphicsOutputs.set(terminal, output);
  notifyTerminalGraphicsOutputChange(terminal);
  return () => {
    if (terminalGraphicsOutputs.get(terminal) === output) {
      terminalGraphicsOutputs.delete(terminal);
      notifyTerminalGraphicsOutputChange(terminal);
    }
  };
}

export function getTerminalGraphicsOutput(terminal: Terminal): TerminalGraphicsOutput | null {
  return terminalGraphicsOutputs.get(terminal) ?? null;
}

export function getTerminalGraphicsOutputVersion(terminal: Terminal): number {
  return terminalGraphicsOutputVersions.get(terminal) ?? 0;
}

export function subscribeTerminalGraphicsOutput(
  terminal: Terminal,
  listener: () => void,
): () => void {
  let listeners = terminalGraphicsOutputListeners.get(terminal);
  if (!listeners) {
    listeners = new Set();
    terminalGraphicsOutputListeners.set(terminal, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) terminalGraphicsOutputListeners.delete(terminal);
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

  if (envString(env, "KITTY_WINDOW_ID") || /(?:^|-)kitty(?:-|$)/i.test(term)) {
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
  const env = options.env ?? {};
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
    truthy(envString(env, "VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH")) ||
    truthy(envString(env, "VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH"));
  const passthroughSupported = !multiplexer || multiplexer === "tmux";
  const passthrough = passthroughRequested && passthroughSupported;
  const mode = normalizeMode(
    envString(env, "VUE_TUI_TERMINAL_GRAPHICS") ?? envString(env, "VUE_TUI_GRAPHICS_PROTOCOL"),
  );
  const forcedByMode = mode === "kitty" || mode === "iterm2" || mode === "sixel";
  const force = truthy(envString(env, "VUE_TUI_GRAPHICS_FORCE")) || forcedByMode;
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
    return capabilitiesFor("none", { ...base, reason: "disabled-by-env" });
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
    return capabilitiesFor(mode, { ...base, candidates: [mode], reason: "forced-by-env" });
  }

  if (mode === "unicode") {
    return capabilitiesFor("unicode", { ...base, reason: "unicode-forced-by-env" });
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

function withoutNestedEscapes(body: string): boolean {
  return !body.includes(ESC) && !body.includes(BEL);
}

function isBase64ish(value: string): boolean {
  return /^[A-Za-z0-9+/=\s]*$/.test(value);
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

function kittyControlIsInteger(controls: ReadonlyMap<string, string>, key: string): boolean {
  const value = controls.get(key);
  return value == null || /^-?\d+$/.test(value);
}

function validateKittySharedSafeControls(controls: ReadonlyMap<string, string>): boolean {
  const q = controls.get("q");
  if (q != null && !/^[0-2]$/.test(q)) return false;

  const cursorMove = controls.get("C");
  if (cursorMove != null && !/^[01]$/.test(cursorMove)) return false;

  for (const key of ["i", "I", "p", "c", "r", "z"]) {
    if (!kittyControlIsInteger(controls, key)) return false;
  }

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
    if (!isBase64ish(payload)) return false;

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

function stripC0ControlChars(value: string): string {
  let out = "";

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }

    out += value[index];
  }

  return out;
}

export function sanitizeTerminalFallbackText(text: unknown): string {
  return stripC0ControlChars(
    String(text ?? "")
      .replace(OSC_RE, "")
      .replace(CSI_RE, "")
      .replace(DCS_RE, "")
      .replace(APC_RE, ""),
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

  if (payload.protocol === "kitty" && !capabilities.kitty) return false;
  if (payload.protocol === "iterm2" && !capabilities.iterm2) return false;
  if (payload.protocol === "sixel" && !capabilities.sixel) return false;

  return isSafeTerminalGraphicsSequence(payload.sequence, payload.protocol, payload.op ?? "draw");
}

function intControl(key: string, value: number | undefined): string {
  if (value == null) return "";
  const n = Math.floor(value);
  return Number.isFinite(n) ? `${key}=${n}` : "";
}

function sanitizeBase64(value: string): string {
  return String(value ?? "").replace(/\s+/g, "");
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
  zIndex?: number;
  quiet?: boolean;
  noCursorMove?: boolean;
  chunkSize?: number;
}>;

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
    intControl("i", options.imageId),
    intControl("I", options.imageNumber),
    intControl("p", options.placementId),
    intControl("c", options.columns),
    intControl("r", options.rows),
    intControl("z", options.zIndex),
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
    controls.push(`d=${options.freeImageData ? "I" : "i"}`);
    controls.push(intControl("i", options.imageId));
    controls.push(intControl("p", options.placementId));
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
