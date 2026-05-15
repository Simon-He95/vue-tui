import type { TerminalEventRecord } from "../events/recording.js";
import { writeSync } from "node:fs";
import process from "node:process";
import { getCliLatencyProfiler } from "../observability/cli-latency-node.js";
import { firstNonEmptyEnv } from "../utils/env.js";
import { normalizeNewlines } from "../utils/newlines.js";
import { parseKittySequence } from "./parse-kitty.js";
import { parseMouseSequence } from "./parse-mouse.js";
import { keyEvent } from "./parse-utils.js";
import { parseXtermSequence } from "./parse-xterm.js";
import { StdinBuffer } from "./stdin-buffer.js";

type Stdin = NodeJS.ReadStream;
type KeyboardProtocol = "auto" | "kitty" | "xterm" | "off";
type ResolvedKeyboardProtocol = Exclude<KeyboardProtocol, "auto">;

const KITTY_KEYBOARD_PROTOCOL_ENABLE = "\u001B[>1u";
const KITTY_KEYBOARD_PROTOCOL_DISABLE = "\u001B[<u";
const XTERM_MODIFY_OTHER_KEYS_ENABLE = "\u001B[>4;2m";
const XTERM_MODIFY_OTHER_KEYS_DISABLE = "\u001B[>4n";

export type StdinDriver = Readonly<{
  dispose: () => void;
}>;

type CleanupSignal = "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGBREAK";
export type TerminalCleanupSignalPolicy = "cleanup-only" | "exit" | "reraise";

export type TerminalCleanupOptions = Readonly<{
  signals?: readonly CleanupSignal[];
  /**
   * Defaults to "reraise" so SIGINT/SIGTERM preserve normal process semantics
   * after terminal cleanup.
   */
  signalPolicy?: TerminalCleanupSignalPolicy;
  cleanupOnUnhandledRejection?: boolean;
  rethrowUnhandledRejection?: boolean;
}>;

export type TerminalCleanupHandle = Readonly<{
  cleanup: () => void;
  uninstall: () => void;
}>;

type ProcessCleanupEvent =
  | CleanupSignal
  | "exit"
  | "uncaughtExceptionMonitor"
  | "unhandledRejection";

function exitCodeForSignal(signal: CleanupSignal): number {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGBREAK") return 130;
  return 129;
}

function normalizeUnhandledRejection(reason: unknown): Error {
  if (reason instanceof Error) return reason;

  const error = new Error("Unhandled promise rejection");
  (error as Error & { cause?: unknown }).cause = reason;
  return error;
}

function addProcessOnce(event: ProcessCleanupEvent, handler: (...args: any[]) => void): boolean {
  try {
    process.once(event as any, handler);
    return true;
  } catch {
    return false;
  }
}

function removeProcessListener(
  event: ProcessCleanupEvent,
  handler: (...args: any[]) => void,
): void {
  try {
    process.off(event as any, handler);
  } catch {}
}

function shouldRegisterSignal(signal: CleanupSignal): boolean {
  return signal !== "SIGBREAK" || process.platform === "win32";
}

function writeTTYSyncOrStream(stdout: NodeJS.WriteStream, chunk: string): void {
  const fd = (stdout as any).fd;
  if (typeof fd === "number") {
    try {
      writeSync(fd, chunk);
      return;
    } catch {}
  }

  stdout.write(chunk);
}

export function installTerminalCleanup(
  dispose: () => void,
  options: TerminalCleanupOptions = {},
): TerminalCleanupHandle {
  let cleaned = false;
  let uninstalled = false;
  const signals = options.signals ?? ["SIGINT", "SIGTERM"];
  const signalPolicy = options.signalPolicy ?? "reraise";
  const cleanupOnUnhandledRejection = options.cleanupOnUnhandledRejection ?? false;
  const rethrowUnhandledRejection =
    options.rethrowUnhandledRejection ?? cleanupOnUnhandledRejection;
  const signalHandlers = new Map<CleanupSignal, () => void>();

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      dispose();
    } catch {
    } finally {
      uninstall();
    }
  };

  const onUncaughtExceptionMonitor = () => {
    cleanup();
    uninstall();
  };

  const onUnhandledRejection = (reason: unknown) => {
    cleanup();
    uninstall();
    if (rethrowUnhandledRejection) {
      process.nextTick(() => {
        throw normalizeUnhandledRejection(reason);
      });
    }
  };

  const uninstall = () => {
    if (uninstalled) return;
    uninstalled = true;
    removeProcessListener("exit", cleanup);
    for (const [signal, handler] of signalHandlers) {
      removeProcessListener(signal, handler);
    }
    removeProcessListener("uncaughtExceptionMonitor", onUncaughtExceptionMonitor);
    if (cleanupOnUnhandledRejection) {
      removeProcessListener("unhandledRejection", onUnhandledRejection);
    }
  };

  const handleSignal = (signal: CleanupSignal) => {
    cleanup();
    uninstall();

    if (signalPolicy === "cleanup-only") {
      return;
    }

    if (signalPolicy === "exit") {
      process.exit(exitCodeForSignal(signal));
      return;
    }

    setImmediate(() => {
      process.kill(process.pid, signal);
    });
  };

  for (const signal of signals) {
    if (!shouldRegisterSignal(signal)) continue;
    if (signalHandlers.has(signal)) continue;
    const handler = () => handleSignal(signal);
    if (addProcessOnce(signal, handler)) signalHandlers.set(signal, handler);
  }

  addProcessOnce("exit", cleanup);
  addProcessOnce("uncaughtExceptionMonitor", onUncaughtExceptionMonitor);
  if (cleanupOnUnhandledRejection) {
    addProcessOnce("unhandledRejection", onUnhandledRejection);
  }

  return { cleanup, uninstall };
}

function isPrintable(ch: string): boolean {
  if (ch.length === 0) return false;
  if (ch.length === 1) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return false;
    return true;
  }
  if (ch.length === 2) {
    const code = ch.charCodeAt(0);
    return code >= 0xd800 && code <= 0xdbff;
  }
  return false;
}

function ctrlKeyFromChar(ch: string): string | null {
  if (!ch || ch.length !== 1) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0x01 && code <= 0x1a) return String.fromCharCode(code + 0x60);
  return null;
}

function isUnhandledCtrlC(event: TerminalEventRecord): boolean {
  return (
    event.type === "keydown" &&
    (event.key === "c" || event.key === "C") &&
    event.ctrlKey === true &&
    event.metaKey !== true &&
    event.altKey !== true &&
    event.shiftKey !== true
  );
}

function parseKeyboardProtocol(value: unknown): KeyboardProtocol | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "auto" ||
    normalized === "kitty" ||
    normalized === "xterm" ||
    normalized === "off"
  ) {
    return normalized;
  }
  return null;
}

function detectKeyboardProtocol(env: Readonly<Record<string, unknown>>): ResolvedKeyboardProtocol {
  const termProgram = String(env.TERM_PROGRAM ?? "")
    .trim()
    .toLowerCase();
  const term = String(env.TERM ?? "")
    .trim()
    .toLowerCase();

  const hasKittyProtocolTerminal =
    "GHOSTTY_RESOURCES_DIR" in env ||
    "WEZTERM_PANE" in env ||
    "KITTY_WINDOW_ID" in env ||
    "KITTY_INSTALLATION_DIR" in env ||
    "ALACRITTY_WINDOW_ID" in env ||
    "ALACRITTY_LOG" in env ||
    termProgram.includes("ghostty") ||
    termProgram.includes("wezterm") ||
    termProgram.includes("kitty") ||
    termProgram.includes("alacritty");
  if (hasKittyProtocolTerminal) return "kitty";

  const isScreenLike = "TMUX" in env || term.includes("screen") || term.includes("tmux");
  const hasXtermKeyboardTerminal =
    termProgram.includes("iterm") ||
    termProgram.includes("apple_terminal") ||
    termProgram.includes("vscode") ||
    (term.includes("xterm") && !isScreenLike);
  return hasXtermKeyboardTerminal ? "xterm" : "off";
}

function resolveKeyboardProtocol(
  options: Readonly<{
    keyboardProtocol?: KeyboardProtocol;
    env?: Readonly<Record<string, unknown>>;
  }>,
): ResolvedKeyboardProtocol {
  const configured = parseKeyboardProtocol(options.keyboardProtocol) ?? "auto";
  if (configured !== "auto") return configured;

  const envOverride = parseKeyboardProtocol(
    firstNonEmptyEnv(options.env, "VUE_TUI_KEYBOARD_PROTOCOL", "DIMCODE_KEYBOARD_PROTOCOL"),
  );
  if (envOverride === "auto") return detectKeyboardProtocol(options.env ?? {});
  if (envOverride) return envOverride;

  return detectKeyboardProtocol(options.env ?? {});
}

function getKeyboardProtocolSequences(
  protocol: ResolvedKeyboardProtocol,
): Readonly<{ enable: string; disable: string }> | null {
  if (protocol === "kitty") {
    return {
      enable: KITTY_KEYBOARD_PROTOCOL_ENABLE,
      disable: KITTY_KEYBOARD_PROTOCOL_DISABLE,
    };
  }
  if (protocol === "xterm") {
    return {
      enable: XTERM_MODIFY_OTHER_KEYS_ENABLE,
      disable: XTERM_MODIFY_OTHER_KEYS_DISABLE,
    };
  }
  return null;
}

export function createStdinDriver(
  options: Readonly<{
    dispatch: (event: TerminalEventRecord) => boolean | void;
    stdin?: Stdin;
    stdout?: NodeJS.WriteStream;
    env?: Readonly<Record<string, unknown>>;
    enableMouse?: boolean;
    keyboardProtocol?: KeyboardProtocol;
    /**
     * Enable "any-motion" mouse tracking (xterm DECSET ?1003).
     * This is required for hover interactions in the CLI, but can increase event volume.
     */
    enableMouseMotion?: boolean;
    onTerminalFocusChange?: (focused: boolean) => void;
    onExit?: () => void;
    autoCleanup?: boolean | TerminalCleanupOptions;
  }>,
): StdinDriver {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  if (!stdin || !stdout) throw new Error("createStdinDriver requires Node process.stdin/stdout");
  const env = (options.env ?? process.env ?? {}) as Readonly<Record<string, unknown>>;
  const enableMouse = options.enableMouse ?? true;
  const enableMouseMotion = options.enableMouseMotion ?? false;
  const keyboardProtocol = resolveKeyboardProtocol({
    keyboardProtocol: options.keyboardProtocol,
    env,
  });
  const keyboardProtocolSequences = getKeyboardProtocolSequences(keyboardProtocol);
  let disposed = false;
  let cleanupHandle: TerminalCleanupHandle | null = null;

  let swallowNextLF = false;
  let lastMouseDown: {
    cellX: number;
    cellY: number;
    button: number;
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
  } | null = null;
  const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  // NOTE: A too-short timeout can cause CSI sequences (e.g. ESC[27;...~) to get split such that
  // the leading ESC is flushed as a standalone Escape key, and the remaining "[...]" bytes are
  // then interpreted as literal input. This is especially likely under heavy render load.
  const stdinBuffer = new StdinBuffer({
    timeout: 50,
    // When mouse tracking is enabled, CSI mouse reports are frequent and we really want to avoid
    // leaking "[<...;...;...M" into focused inputs if the leading ESC gets chunk-split.
    // Keep this well below one frame so plain Esc remains responsive while the
    // stdin buffer rescue path still covers delayed CSI continuations.
    escTimeout: enableMouse ? 8 : 6,
  });
  const latency = getCliLatencyProfiler();

  const dispatchEvent = (event: TerminalEventRecord, parser?: string): boolean => {
    latency?.recordStdinDispatch(event, { parser });
    const prevented = Boolean(options.dispatch(event));
    if (isUnhandledCtrlC(event) && !prevented) options.onExit?.();
    return prevented;
  };

  const handlePlainChar = (ch: string) => {
    if (swallowNextLF) {
      swallowNextLF = false;
      if (ch === "\n") return;
    }

    if (ch === "\u0003") {
      // Ctrl+C (ETX). In many terminal emulators Cmd+C is mapped to Ctrl+C when there is no
      // native terminal selection. Let the app/widget handle it first (e.g. interrupt/close dialogs);
      // fall back to exiting when unhandled.
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
          text: "\n",
        },
        "plain",
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

    if (ch === "\u007F") {
      dispatchEvent(keyEvent("Backspace", "Backspace"), "plain");
      return;
    }
    if (ch === "\t") {
      dispatchEvent(keyEvent("Tab", "Tab"), "plain");
      return;
    }
    if (isPrintable(ch)) dispatchEvent(keyEvent(ch), "plain");
  };

  const handleMouseEvent = (
    event: Extract<
      TerminalEventRecord,
      { type: "pointerdown" | "pointerup" | "pointermove" | "wheel" }
    >,
  ) => {
    const ev = event as any;
    if (ev.type === "pointerdown") {
      options.dispatch(event);
      lastMouseDown = {
        cellX: ev.cellX,
        cellY: ev.cellY,
        button: ev.button ?? 0,
        shiftKey: Boolean(ev.shiftKey),
        altKey: Boolean(ev.altKey),
        ctrlKey: Boolean(ev.ctrlKey),
      };
    } else if (ev.type === "pointermove") {
      // Some terminals (or muxers) never send a distinct pointerup, but will start sending
      // motion events with button=3 ("no buttons pressed") after a click.
      // If we have a pending down, treat the first such move as an implicit release so
      // widgets like TInput don't stay stuck in drag-select mode.
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
          ctrlKey: down.ctrlKey,
        });
        if (down.button === 0) {
          options.dispatch({
            type: "click",
            cellX: down.cellX,
            cellY: down.cellY,
            shiftKey: down.shiftKey,
            altKey: down.altKey,
            ctrlKey: down.ctrlKey,
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

      if (sameCell && down!.button === 0 && (ev.button === 0 || ev.button === 3)) {
        options.dispatch({
          type: "click",
          cellX: ev.cellX,
          cellY: ev.cellY,
          shiftKey: Boolean(ev.shiftKey ?? down?.shiftKey),
          altKey: Boolean(ev.altKey ?? down?.altKey),
          ctrlKey: Boolean(ev.ctrlKey ?? down?.ctrlKey),
        });
      }
    } else {
      options.dispatch(event);
    }
  };

  const handleSequence = (sequence: string) => {
    if (disposed) return;
    if (!sequence) return;

    if (sequence === "\u001B[I") {
      options.onTerminalFocusChange?.(true);
      return;
    }
    if (sequence === "\u001B[O") {
      options.onTerminalFocusChange?.(false);
      return;
    }

    const mouse = parseMouseSequence(sequence);
    if (mouse.handled) {
      if (mouse.event) handleMouseEvent(mouse.event as any);
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

    if (sequence.startsWith("\u001B")) {
      if (sequence.length === 2 && isPrintable(sequence[1]!)) {
        dispatchEvent(keyEvent(sequence[1]!, "", { altKey: true }), "alt");
        return;
      }
      // ESC + control character: some terminals (e.g. Ghostty) encode
      // Shift+Enter as ESC CR (\x1B\x0D) instead of CSI u.
      // Dispatch these as Alt+<key> so widgets can handle them.
      if (sequence.length === 2) {
        const code = sequence.charCodeAt(1);
        if (code === 0x0d) {
          dispatchEvent(keyEvent("Enter", "Enter", { altKey: true }), "alt");
          return;
        }
        if (code === 0x09) {
          dispatchEvent(keyEvent("Tab", "Tab", { altKey: true }), "alt");
          return;
        }
      }
      if (sequence === "\u001B") {
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

  const decodeBytes = (bytes: Uint8Array) => {
    if (bytes.length === 1 && bytes[0]! > 127) {
      const adjusted = bytes[0]! - 128;
      stdinBuffer.process(`\x1B${String.fromCharCode(adjusted)}`);
      return;
    }

    const decoded = decoder.decode(bytes, { stream: true });
    if (decoded) stdinBuffer.process(decoded);
  };

  const onData = (chunk: unknown) => {
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
      const view = chunk as ArrayBufferView;
      decodeBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return;
    }

    if (chunk != null) {
      try {
        const decoded = decoder.decode(chunk as BufferSource, { stream: true });
        if (decoded) stdinBuffer.process(decoded);
      } catch {
        // Ignore decode errors
      }
    }
  };

  const wasRaw = (stdin as any).isRaw;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", onData);

  if (stdout.isTTY) {
    stdout.write("\u001B[?2004h");
    stdout.write("\u001B[?1004h");
    if (keyboardProtocolSequences) stdout.write(keyboardProtocolSequences.enable);
    if (enableMouse) {
      stdout.write("\u001B[?1007h");
      // Mouse tracking (SGR):
      // - ?1002: button-event tracking (drag motion only)
      // - ?1003: any-event tracking (hover + drag motion)
      // These modes overlap; enabling ?1002 after ?1003 overrides hover tracking.
      if (enableMouseMotion) stdout.write("\u001B[?1000h\u001B[?1003h\u001B[?1006h");
      else stdout.write("\u001B[?1000h\u001B[?1002h\u001B[?1006h");
    }
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanupHandle?.uninstall();
    cleanupHandle = null;
    stdin.off("data", onData);
    stdinBuffer.destroy();
    try {
      stdin.pause();
    } catch {
      // ignore
    }
    try {
      (stdin as any).unref?.();
    } catch {
      // ignore
    }
    if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
    if (stdout.isTTY) {
      let restore = "\u001B[?2004l\u001B[?1004l";
      if (keyboardProtocolSequences) restore += keyboardProtocolSequences.disable;
      if (enableMouse) {
        restore += "\u001B[?1007l";
        restore += enableMouseMotion
          ? "\u001B[?1000l\u001B[?1003l\u001B[?1006l"
          : "\u001B[?1000l\u001B[?1002l\u001B[?1006l";
      }
      writeTTYSyncOrStream(stdout, restore);
    }
  };

  const autoCleanup = options.autoCleanup ?? false;
  if (autoCleanup) {
    const cleanupOptions = typeof autoCleanup === "object" ? autoCleanup : {};
    cleanupHandle = installTerminalCleanup(dispose, {
      ...cleanupOptions,
      signalPolicy:
        typeof autoCleanup === "object" ? (cleanupOptions.signalPolicy ?? "reraise") : "reraise",
    });
  }

  return { dispose };
}
