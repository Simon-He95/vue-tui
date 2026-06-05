import type { Terminal } from "../core/types.js";

export type TerminalGraphicsProtocol = "kitty" | "iterm2" | "sixel";
export type TerminalGraphicsFallbackProtocol = "unicode" | "none";
export type TerminalGraphicsResolvedProtocol =
  | TerminalGraphicsProtocol
  | TerminalGraphicsFallbackProtocol;
export type TerminalGraphicsOperation = "draw" | "clear";
export type TerminalGraphicsMultiplexer = "tmux" | "screen" | "zellij";

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
  queue: (payload: TerminalGraphicsPayload) => void;
  clear?: (id: string) => void;
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

const MAX_SEQUENCE_CHARS = 2 * 1024 * 1024;
const MAX_FALLBACK_CHARS = 16_384;
const MAX_GRAPHIC_CELLS = 10_000;

const terminalGraphicsOutputs = new WeakMap<Terminal, TerminalGraphicsOutput>();

export function registerTerminalGraphicsOutput(
  terminal: Terminal,
  output: TerminalGraphicsOutput,
): () => void {
  terminalGraphicsOutputs.set(terminal, output);
  return () => {
    if (terminalGraphicsOutputs.get(terminal) === output) {
      terminalGraphicsOutputs.delete(terminal);
    }
  };
}

export function getTerminalGraphicsOutput(terminal: Terminal): TerminalGraphicsOutput | null {
  return terminalGraphicsOutputs.get(terminal) ?? null;
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

function uniqueProtocols(protocols: TerminalGraphicsProtocol[]): TerminalGraphicsProtocol[] {
  return [...new Set(protocols)];
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
  const passthrough =
    truthy(envString(env, "VUE_TUI_TERMINAL_GRAPHICS_PASSTHROUGH")) ||
    truthy(envString(env, "VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH"));
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
  const protocol: TerminalGraphicsResolvedProtocol =
    candidates.length > 0 ? candidates[0]! : "unicode";
  return capabilitiesFor(protocol, {
    ...base,
    candidates,
    reason: protocol === "unicode" ? "no-supported-graphics-protocol-detected" : "auto-detected",
  });
}

function stableId(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `tg_${(hash >>> 0).toString(36)}`;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function withoutNestedEscapes(body: string): boolean {
  return !body.includes(ESC) && !body.includes(BEL);
}

function isBase64ish(value: string): boolean {
  return /^[A-Za-z0-9+/=\s]*$/.test(value);
}

function validateKittySequence(sequence: string): boolean {
  let index = 0;

  while (index < sequence.length) {
    if (!sequence.startsWith(`${ESC}_G`, index)) return false;

    const end = sequence.indexOf(ST, index + 3);
    if (end < 0) return false;

    const body = sequence.slice(index + 3, end);
    if (!withoutNestedEscapes(body)) return false;

    const semicolon = body.indexOf(";");
    const controls = semicolon >= 0 ? body.slice(0, semicolon) : body;
    const payload = semicolon >= 0 ? body.slice(semicolon + 1) : "";

    if (!/^[A-Za-z0-9_,=+.\-:]*$/.test(controls)) return false;
    if (payload && !isBase64ish(payload)) return false;

    index = end + ST.length;
  }

  return sequence.length > 0;
}

function validateIterm2Sequence(sequence: string): boolean {
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
    if (!/^[A-Za-z0-9_=;,.%+\-:]*$/.test(body.slice(0, colon + 1))) return false;
    if (!isBase64ish(body.slice(colon + 1))) return false;

    index = end + (end === stEnd ? ST.length : BEL.length);
  }

  return sequence.length > 0;
}

function validateSixelSequence(sequence: string): boolean {
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
  ).slice(0, MAX_FALLBACK_CHARS);
}

export function validateTerminalGraphicFrame(
  frame: RawTerminalGraphicFrame,
): ValidatedTerminalGraphicFrame | null {
  const sequence = String(frame.sequence ?? "");

  if (sequence.length <= 0 || sequence.length > MAX_SEQUENCE_CHARS) {
    return null;
  }

  const width = clampInt(frame.width, 1, MAX_GRAPHIC_CELLS);
  const height = clampInt(frame.height, 1, MAX_GRAPHIC_CELLS);

  if (width * height > MAX_GRAPHIC_CELLS) {
    return null;
  }

  const ok =
    frame.protocol === "kitty"
      ? validateKittySequence(sequence)
      : frame.protocol === "iterm2"
        ? validateIterm2Sequence(sequence)
        : validateSixelSequence(sequence);

  if (!ok) return null;

  return {
    ...frame,
    id: frame.id || stableId(`${frame.protocol}:${sequence.slice(0, 4096)}`),
    sequence,
    fallbackText: sanitizeTerminalFallbackText(frame.fallbackText),
    width,
    height,
  };
}

export function isSafeTerminalGraphicsSequence(
  sequence: string,
  protocol: TerminalGraphicsProtocol,
): boolean {
  if (!sequence || sequence.length > MAX_SEQUENCE_CHARS) return false;

  return protocol === "kitty"
    ? validateKittySequence(sequence)
    : protocol === "iterm2"
      ? validateIterm2Sequence(sequence)
      : validateSixelSequence(sequence);
}

export function validateTerminalGraphicsPayload(
  payload: TerminalGraphicsPayload,
  capabilities: TerminalGraphicsCapabilities,
): boolean {
  if (!payload.id.trim()) return false;
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return false;
  if (!capabilities.supported) return false;

  if (payload.protocol === "kitty" && !capabilities.kitty) return false;
  if (payload.protocol === "iterm2" && !capabilities.iterm2) return false;
  if (payload.protocol === "sixel" && !capabilities.sixel) return false;

  return isSafeTerminalGraphicsSequence(payload.sequence, payload.protocol);
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
  } else {
    controls.push(`d=${options.freeImageData ? "C" : "c"}`);
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
  }> = {},
): string {
  const data = sanitizeBase64(base64Data);
  if (!data) return "";

  const params = [
    "inline=1",
    options.width != null ? `width=${formatItermDimension(options.width)}` : "",
    options.height != null ? `height=${formatItermDimension(options.height)}` : "",
    `preserveAspectRatio=${options.preserveAspectRatio === false ? 0 : 1}`,
  ].filter(Boolean);
  return `${ESC}]1337;File=${params.join(";")}:${data}${BEL}`;
}

function formatItermDimension(value: number | string): string {
  if (typeof value === "number") return String(Math.max(1, Math.floor(value)));
  return value.replace(/[^\w.%]/g, "");
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
