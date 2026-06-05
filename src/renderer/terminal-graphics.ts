import type { Terminal } from "../core/types.js";

export type TerminalGraphicsProtocol = "kitty" | "iterm2" | "sixel";
export type TerminalGraphicsFallbackProtocol = "unicode" | "none";
export type TerminalGraphicsResolvedProtocol =
  | TerminalGraphicsProtocol
  | TerminalGraphicsFallbackProtocol;

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
  w: number;
  h: number;
  protocol: TerminalGraphicsProtocol;
  sequence: string;
  fallbackText?: string;
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
  const term = String(envString(env, "TERM") ?? "");
  const termProgram = String(envString(env, "TERM_PROGRAM") ?? "");
  const termProgramVersion = String(envString(env, "TERM_PROGRAM_VERSION") ?? "");

  if (envString(env, "KITTY_WINDOW_ID") || /(?:^|-)kitty(?:-|$)/i.test(term)) {
    candidates.push("kitty");
  }

  if (/^iTerm\.app$/i.test(termProgram) || /^WezTerm$/i.test(termProgram)) {
    candidates.push("iterm2");
  }

  if (
    truthy(envString(env, "VUE_TUI_GRAPHICS_SIXEL")) ||
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
    reason?: string;
  }>,
): TerminalGraphicsCapabilities {
  const supported = protocol === "kitty" || protocol === "iterm2" || protocol === "sixel";
  const candidates = input.candidates ?? (supported ? [protocol] : []);
  return {
    supported,
    kitty: protocol === "kitty",
    iterm2: protocol === "iterm2",
    sixel: protocol === "sixel",
    preferredProtocol: supported ? protocol : null,
    protocol,
    candidates,
    stdoutIsTTY: input.stdoutIsTTY,
    insideTmux: input.insideTmux,
    insideScreen: input.insideScreen,
    reason: input.reason,
  };
}

export function detectTerminalGraphicsCapabilities(
  options: TerminalGraphicsDetectionInput = {},
): TerminalGraphicsCapabilities {
  const env = options.env ?? {};
  const stdoutIsTTY = options.stdoutIsTTY ?? options.isTTY ?? readStdoutIsTTY();
  const insideTmux = Boolean(envString(env, "TMUX"));
  const insideScreen = Boolean(envString(env, "STY"));
  const force = truthy(envString(env, "VUE_TUI_GRAPHICS_FORCE"));
  const tmuxPassthrough = truthy(envString(env, "VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH"));
  const mode = normalizeMode(
    envString(env, "VUE_TUI_GRAPHICS_PROTOCOL") ?? envString(env, "VUE_TUI_TERMINAL_GRAPHICS"),
  );
  const base = { stdoutIsTTY, insideTmux, insideScreen };

  if (mode === "none") {
    return capabilitiesFor("none", { ...base, reason: "disabled-by-env" });
  }

  if (!stdoutIsTTY && !force) {
    return capabilitiesFor("unicode", { ...base, reason: "stdout-is-not-tty" });
  }

  if (truthy(envString(env, "CI")) && !force) {
    return capabilitiesFor("unicode", { ...base, reason: "ci" });
  }

  if ((insideTmux || insideScreen) && !tmuxPassthrough && !force) {
    return capabilitiesFor("unicode", {
      ...base,
      reason: insideTmux ? "tmux-without-passthrough" : "screen-without-passthrough",
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
  if (!sequence.startsWith(`${ESC}_G`)) return false;
  if (!sequence.endsWith(ST)) return false;

  const body = sequence.slice(3, -2);
  if (!withoutNestedEscapes(body)) return false;

  const semicolon = body.indexOf(";");
  if (semicolon < 0) return false;

  return isBase64ish(body.slice(semicolon + 1));
}

function validateIterm2Sequence(sequence: string): boolean {
  const starts = sequence.startsWith(`${ESC}]1337;File=`);
  const endsWithBel = sequence.endsWith(BEL);
  const endsWithSt = sequence.endsWith(ST);

  if (!starts || (!endsWithBel && !endsWithSt)) return false;

  const body = endsWithBel
    ? sequence.slice(`${ESC}]1337;`.length, -1)
    : sequence.slice(`${ESC}]1337;`.length, -2);

  if (!body.startsWith("File=")) return false;
  if (!withoutNestedEscapes(body)) return false;

  const colon = body.indexOf(":");
  if (colon < 0) return false;

  return isBase64ish(body.slice(colon + 1));
}

function validateSixelSequence(sequence: string): boolean {
  if (!sequence.startsWith(`${ESC}P`)) return false;
  if (!sequence.endsWith(ST)) return false;

  const body = sequence.slice(2, -2);
  if (!withoutNestedEscapes(body)) return false;

  const q = body.indexOf("q");
  return q >= 0 && q <= 32;
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

export function createKittyGraphicsSequence(base64Png: string): string {
  return `${ESC}_Ga=T,f=100;${base64Png}${ST}`;
}

export function createIterm2InlineImageSequence(
  base64Data: string,
  options: Readonly<{
    width?: number;
    height?: number;
    preserveAspectRatio?: boolean;
  }> = {},
): string {
  const params = [
    "inline=1",
    options.width != null ? `width=${Math.max(1, Math.floor(options.width))}` : "",
    options.height != null ? `height=${Math.max(1, Math.floor(options.height))}` : "",
    `preserveAspectRatio=${options.preserveAspectRatio === false ? 0 : 1}`,
  ].filter(Boolean);
  return `${ESC}]1337;File=${params.join(";")}:${base64Data}${BEL}`;
}
