import type { Terminal } from "../core/types.js";

export type TerminalGraphicsProtocol = "kitty" | "iterm2" | "sixel";

export type TerminalGraphicsCapabilities = Readonly<{
  supported: boolean;
  kitty: boolean;
  iterm2: boolean;
  sixel: boolean;
  preferredProtocol: TerminalGraphicsProtocol | null;
}>;

export type TerminalGraphicsPayload = Readonly<{
  id: string;
  x: number;
  y: number;
  sequence: string;
}>;

export type TerminalGraphicsOutput = Readonly<{
  capabilities: TerminalGraphicsCapabilities;
  queue: (payload: TerminalGraphicsPayload) => void;
}>;

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

export function detectTerminalGraphicsCapabilities(options: {
  env?: Record<string, unknown>;
  isTTY?: boolean;
}): TerminalGraphicsCapabilities {
  const env = options.env ?? {};
  if (options.isTTY === false) {
    return {
      supported: false,
      kitty: false,
      iterm2: false,
      sixel: false,
      preferredProtocol: null,
    };
  }

  const term = String(env.TERM ?? "")
    .trim()
    .toLowerCase();
  const termProgram = String(env.TERM_PROGRAM ?? "")
    .trim()
    .toLowerCase();

  const kitty =
    "KITTY_WINDOW_ID" in env ||
    term.includes("kitty") ||
    termProgram.includes("kitty") ||
    "WEZTERM_PANE" in env ||
    termProgram.includes("wezterm");
  const iterm2 = termProgram.includes("iterm");
  const sixel =
    term.includes("sixel") ||
    String(env.TERMINAL_GRAPHICS ?? "")
      .toLowerCase()
      .includes("sixel");
  const preferredProtocol: TerminalGraphicsProtocol | null = kitty
    ? "kitty"
    : iterm2
      ? "iterm2"
      : sixel
        ? "sixel"
        : null;

  return {
    supported: Boolean(preferredProtocol),
    kitty,
    iterm2,
    sixel,
    preferredProtocol,
  };
}

export function createKittyGraphicsSequence(base64Png: string): string {
  return `\u001B_Ga=T,f=100;${base64Png}\u001B\\`;
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
  return `\u001B]1337;File=${params.join(";")}:${base64Data}\u0007`;
}
