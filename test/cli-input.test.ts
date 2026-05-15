import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createStdinDriver, installTerminalCleanup } from "../src/cli.js";
import { normalizeNewlines } from "../src/utils/newlines.js";

class FakeStdin extends EventEmitter {
  isTTY = true;
  private raw = false;
  setEncoding(_enc: string) {}
  setRawMode(v: boolean) {
    this.raw = v;
  }

  resume() {}
  get isRaw() {
    return this.raw;
  }
}

class FakeStdout {
  isTTY = true;
  writes: string[] = [];
  write(s: string) {
    this.writes.push(s);
  }
}

function collectDriverOutput(
  opts?: Readonly<{
    env?: Record<string, unknown>;
    keyboardProtocol?: "auto" | "kitty" | "xterm" | "off";
  }>,
): string {
  const stdin = new FakeStdin() as any;
  const stdout = new FakeStdout() as any;

  const driver = createStdinDriver({
    stdin,
    stdout,
    dispatch: () => {},
    enableMouse: false,
    env: opts?.env,
    keyboardProtocol: opts?.keyboardProtocol,
  });
  driver.dispose();
  return stdout.writes.join("");
}

describe("cli input", () => {
  it("installs terminal cleanup for process exit", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("exit"));
    const cleanupHandle = installTerminalCleanup(dispose);
    try {
      const listener = process.rawListeners("exit").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.(0);
      listener?.(0);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("cleanup-only signal policy cleans up without exiting", () => {
    const dispose = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined as never) as any);
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as any);
    const before = new Set(process.rawListeners("SIGTERM"));
    const cleanupHandle = installTerminalCleanup(dispose);

    try {
      const listener = process.rawListeners("SIGTERM").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(exit).not.toHaveBeenCalled();
      expect(kill).not.toHaveBeenCalled();
    } finally {
      cleanupHandle.uninstall();
      exit.mockRestore();
      kill.mockRestore();
    }
  });

  it("exit signal policy exits with signal code", () => {
    const dispose = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined as never) as any);
    const before = new Set(process.rawListeners("SIGINT"));
    const cleanupHandle = installTerminalCleanup(dispose, { signalPolicy: "exit" });

    try {
      const listener = process.rawListeners("SIGINT").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(130);
    } finally {
      cleanupHandle.uninstall();
      exit.mockRestore();
    }
  });

  it("reraise signal policy removes its listener and kills the current process", async () => {
    const dispose = vi.fn();
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as any);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined as never) as any);
    const before = new Set(process.rawListeners("SIGTERM"));
    const cleanupHandle = installTerminalCleanup(dispose, { signalPolicy: "reraise" });

    try {
      const listener = process.rawListeners("SIGTERM").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(process.rawListeners("SIGTERM").filter((item) => !before.has(item))).toHaveLength(0);
      expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      cleanupHandle.uninstall();
      kill.mockRestore();
      exit.mockRestore();
    }
  });

  it("honors explicit cleanup signals", () => {
    const dispose = vi.fn();
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined as never) as any);
    const before = new Set(process.rawListeners("SIGINT"));
    const cleanupHandle = installTerminalCleanup(dispose, {
      signals: ["SIGINT"],
      signalPolicy: "exit",
    });

    try {
      const listener = process.rawListeners("SIGINT").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(130);
    } finally {
      cleanupHandle.uninstall();
      exit.mockRestore();
    }
  });

  it("skips unsupported SIGBREAK listeners outside Windows", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("SIGBREAK"));
    const cleanupHandle = installTerminalCleanup(dispose, {
      signals: ["SIGBREAK"],
      signalPolicy: "exit",
    });

    try {
      const added = process.rawListeners("SIGBREAK").filter((item) => !before.has(item));
      expect(added).toHaveLength(process.platform === "win32" ? 1 : 0);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("deduplicates cleanup signals", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("SIGTERM"));
    const cleanupHandle = installTerminalCleanup(dispose, {
      signals: ["SIGTERM", "SIGTERM"],
    });

    try {
      const added = process.rawListeners("SIGTERM").filter((item) => !before.has(item));
      expect(added).toHaveLength(1);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("cleanup handle cleanup is idempotent", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("SIGTERM"));
    const cleanupHandle = installTerminalCleanup(dispose);

    try {
      cleanupHandle.cleanup();
      cleanupHandle.cleanup();

      expect(dispose).toHaveBeenCalledTimes(1);
      cleanupHandle.uninstall();
      expect(process.rawListeners("SIGTERM").filter((item) => !before.has(item))).toHaveLength(0);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("cleanup handle uninstall does not run cleanup", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("SIGTERM"));
    const cleanupHandle = installTerminalCleanup(dispose);

    cleanupHandle.uninstall();

    expect(dispose).not.toHaveBeenCalled();
    expect(process.rawListeners("SIGTERM").filter((item) => !before.has(item))).toHaveLength(0);
  });

  it("does not register unhandledRejection cleanup by default", () => {
    const dispose = vi.fn();
    const before = process.listenerCount("unhandledRejection");
    const cleanupHandle = installTerminalCleanup(dispose);

    try {
      expect(process.listenerCount("unhandledRejection")).toBe(before);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("registers unhandledRejection cleanup only when explicitly enabled", () => {
    const dispose = vi.fn();
    const before = process.listenerCount("unhandledRejection");
    const cleanupHandle = installTerminalCleanup(dispose, {
      cleanupOnUnhandledRejection: true,
    });

    try {
      expect(process.listenerCount("unhandledRejection")).toBe(before + 1);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("rethrows after opted-in unhandledRejection cleanup by default", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("unhandledRejection"));
    const error = new Error("boom");
    const cleanupHandle = installTerminalCleanup(dispose, {
      cleanupOnUnhandledRejection: true,
    });

    try {
      const listener = process.rawListeners("unhandledRejection").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      const scheduled: Array<() => void> = [];
      const nextTick = vi.spyOn(process, "nextTick").mockImplementation(((
        callback: (...args: any[]) => void,
        ...args: any[]
      ) => {
        scheduled.push(() => callback(...args));
      }) as any);
      try {
        listener?.(error, Promise.resolve());
      } finally {
        nextTick.mockRestore();
      }

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(
        scheduled.some((callback) => {
          try {
            callback();
            return false;
          } catch (caught) {
            return caught === error;
          }
        }),
      ).toBe(true);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("preserves non-error unhandledRejection reasons as cause", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("unhandledRejection"));
    const reason = { code: "boom" };
    const cleanupHandle = installTerminalCleanup(dispose, {
      cleanupOnUnhandledRejection: true,
    });

    try {
      const listener = process.rawListeners("unhandledRejection").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      const scheduled: Array<() => void> = [];
      const nextTick = vi.spyOn(process, "nextTick").mockImplementation(((
        callback: (...args: any[]) => void,
        ...args: any[]
      ) => {
        scheduled.push(() => callback(...args));
      }) as any);
      try {
        listener?.(reason, Promise.resolve());
      } finally {
        nextTick.mockRestore();
      }

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(
        scheduled.some((callback) => {
          try {
            callback();
            return false;
          } catch (caught) {
            expect(caught).toBeInstanceOf(Error);
            expect((caught as Error).message).toBe("Unhandled promise rejection");
            expect((caught as Error).cause).toBe(reason);
            return true;
          }
        }),
      ).toBe(true);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("can suppress rethrow when explicitly configured", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("unhandledRejection"));
    const cleanupHandle = installTerminalCleanup(dispose, {
      cleanupOnUnhandledRejection: true,
      rethrowUnhandledRejection: false,
    });

    try {
      const listener = process.rawListeners("unhandledRejection").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      const nextTick = vi.spyOn(process, "nextTick");
      try {
        listener?.(new Error("boom"), Promise.resolve());
      } finally {
        nextTick.mockRestore();
      }

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(nextTick).not.toHaveBeenCalled();
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("can explicitly skip unhandledRejection cleanup", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("unhandledRejection"));
    const cleanupHandle = installTerminalCleanup(dispose, {
      cleanupOnUnhandledRejection: false,
    });

    try {
      const added = process.rawListeners("unhandledRejection").filter((item) => !before.has(item));
      expect(added).toHaveLength(0);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("cleans up on uncaughtExceptionMonitor", () => {
    const dispose = vi.fn();
    const before = new Set(process.rawListeners("uncaughtExceptionMonitor"));
    const cleanupHandle = installTerminalCleanup(dispose);

    try {
      const listener = process
        .rawListeners("uncaughtExceptionMonitor")
        .find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.(new Error("boom"), "uncaughtException");
      listener?.(new Error("boom"), "uncaughtException");
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      cleanupHandle.uninstall();
    }
  });

  it("does not auto-install terminal cleanup by default", () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;
    const before = new Set(process.rawListeners("SIGTERM"));
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: false,
    });

    try {
      const added = process.rawListeners("SIGTERM").filter((item) => !before.has(item));
      expect(added).toHaveLength(0);
    } finally {
      driver.dispose();
    }
  });

  it("can opt into stdin driver terminal cleanup", async () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as any);
    const before = new Set(process.rawListeners("SIGTERM"));
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: false,
      autoCleanup: true,
    });

    try {
      const listener = process.rawListeners("SIGTERM").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(stdin.isRaw).toBe(false);
      expect(stdout.writes.join("")).toContain("\u001B[?2004l");
      expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
    } finally {
      driver.dispose();
      kill.mockRestore();
    }
  });

  it("autoCleanup object defaults to re-raising signals", async () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;
    const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as any);
    const before = new Set(process.rawListeners("SIGTERM"));
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: false,
      autoCleanup: {},
    });

    try {
      const listener = process.rawListeners("SIGTERM").find((item) => !before.has(item));
      expect(listener).toBeTypeOf("function");
      listener?.();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(kill).toHaveBeenCalledWith(process.pid, "SIGTERM");
    } finally {
      driver.dispose();
      kill.mockRestore();
    }
  });

  it("enables/disables mouse any-motion tracking when configured", () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: true,
      enableMouseMotion: true,
    });
    driver.dispose();

    const output = stdout.writes.join("");
    expect(output).toContain("\u001B[?1003h");
    expect(output).toContain("\u001B[?1003l");
  });

  it("enables/disables terminal focus reporting", () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: false,
    });
    driver.dispose();

    const output = stdout.writes.join("");
    expect(output).toContain("\u001B[?1004h");
    expect(output).toContain("\u001B[?1004l");
  });

  it("auto-enables kitty keyboard protocol for ghostty/wezterm/kitty/alacritty terminals", () => {
    const cases: Array<Record<string, unknown>> = [
      { GHOSTTY_RESOURCES_DIR: "/Applications/Ghostty.app" },
      { TERM_PROGRAM: "WezTerm" },
      { TERM_PROGRAM: "kitty" },
      { TERM_PROGRAM: "Alacritty" },
      { ALACRITTY_WINDOW_ID: "12345" },
    ];

    for (const env of cases) {
      const output = collectDriverOutput({ env });
      expect(output).toContain("\u001B[>1u");
      expect(output).toContain("\u001B[<u");
      expect(output).not.toContain("\u001B[>4;2m");
    }
  });

  it("auto-enables xterm modifyOtherKeys for iTerm2/Apple Terminal/VSCode/xterm", () => {
    const cases: Array<Record<string, unknown>> = [
      { TERM_PROGRAM: "iTerm.app" },
      { TERM_PROGRAM: "Apple_Terminal" },
      { TERM_PROGRAM: "vscode" },
      { TERM: "xterm-256color" },
    ];

    for (const env of cases) {
      const output = collectDriverOutput({ env });
      expect(output).toContain("\u001B[>4;2m");
      expect(output).toContain("\u001B[>4n");
      expect(output).not.toContain("\u001B[>1u");
    }
  });

  it("does not enable a keyboard protocol for unknown terminals in auto mode", () => {
    const output = collectDriverOutput({
      env: {
        TERM: "vt100",
      },
    });

    expect(output).not.toContain("\u001B[>1u");
    expect(output).not.toContain("\u001B[<u");
    expect(output).not.toContain("\u001B[>4;2m");
    expect(output).not.toContain("\u001B[>4n");
  });

  it("DIMCODE_KEYBOARD_PROTOCOL overrides auto detection", () => {
    const kittyOutput = collectDriverOutput({
      env: {
        TERM: "vt100",
        DIMCODE_KEYBOARD_PROTOCOL: "kitty",
      },
    });
    expect(kittyOutput).toContain("\u001B[>1u");
    expect(kittyOutput).toContain("\u001B[<u");
    expect(kittyOutput).not.toContain("\u001B[>4;2m");

    const xtermOutput = collectDriverOutput({
      env: {
        TERM_PROGRAM: "ghostty",
        DIMCODE_KEYBOARD_PROTOCOL: "xterm",
      },
    });
    expect(xtermOutput).toContain("\u001B[>4;2m");
    expect(xtermOutput).toContain("\u001B[>4n");
    expect(xtermOutput).not.toContain("\u001B[>1u");

    const offOutput = collectDriverOutput({
      env: {
        TERM_PROGRAM: "kitty",
        DIMCODE_KEYBOARD_PROTOCOL: "off",
      },
    });
    expect(offOutput).not.toContain("\u001B[>1u");
    expect(offOutput).not.toContain("\u001B[<u");
    expect(offOutput).not.toContain("\u001B[>4;2m");
    expect(offOutput).not.toContain("\u001B[>4n");
  });

  it("prefers VUE_TUI_KEYBOARD_PROTOCOL over the legacy DIMCODE alias", () => {
    const output = collectDriverOutput({
      env: {
        TERM: "vt100",
        VUE_TUI_KEYBOARD_PROTOCOL: "xterm",
        DIMCODE_KEYBOARD_PROTOCOL: "kitty",
      },
    });

    expect(output).toContain("\u001B[>4;2m");
    expect(output).toContain("\u001B[>4n");
    expect(output).not.toContain("\u001B[>1u");
  });

  it("does not fall back to legacy keyboard env when the new env is invalid", () => {
    const output = collectDriverOutput({
      env: {
        TERM: "vt100",
        VUE_TUI_KEYBOARD_PROTOCOL: "bogus",
        DIMCODE_KEYBOARD_PROTOCOL: "kitty",
      },
    });

    expect(output).not.toContain("\u001B[>1u");
    expect(output).not.toContain("\u001B[<u");
  });

  it("reports terminal focus in/out changes", () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;
    const onTerminalFocusChange = vi.fn();

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      enableMouse: false,
      onTerminalFocusChange,
    });

    stdin.emit("data", "\u001B[O");
    stdin.emit("data", "\u001B[I");
    driver.dispose();

    expect(onTerminalFocusChange).toHaveBeenNthCalledWith(1, false);
    expect(onTerminalFocusChange).toHaveBeenNthCalledWith(2, true);
  });

  it("normalizes newlines in bracketed paste", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // Some terminals send CR for line breaks during bracketed paste.
    stdin.emit("data", "\u001B[200~a\rb\r\nc\u001B[201~");
    driver.dispose();

    expect(events).toContainEqual({ type: "paste", text: "a\nb\nc" });
  });

  it("normalizeNewlines converts CR/CRLF to LF", () => {
    expect(normalizeNewlines("a\rb")).toBe("a\nb");
    expect(normalizeNewlines("a\r\nb")).toBe("a\nb");
    expect(normalizeNewlines("a\nb")).toBe("a\nb");
  });

  it("emits click for SGR mouse release button=3", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // press: ESC[<0;3;4M  (left down at x=3,y=4) -> cell(2,3)
    // release (some terminals): ESC[<3;3;4m -> pointerup button=3
    stdin.emit("data", "\u001B[<0;3;4M\u001B[<3;3;4m");
    driver.dispose();

    expect(events.some((e) => e.type === "click" && e.cellX === 2 && e.cellY === 3)).toBe(true);
  });

  it("emits click when some terminals encode release as SGR `M` with button=3", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // press: ESC[<0;3;4M (left down at x=3,y=4)
    // release (legacy-ish SGR variant): ESC[<3;3;4M (button=3 indicates release)
    stdin.emit("data", "\u001B[<0;3;4M\u001B[<3;3;4M");
    driver.dispose();

    expect(events.some((e) => e.type === "click" && e.cellX === 2 && e.cellY === 3)).toBe(true);
  });

  it("does not emit click when mouse is released on another cell", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B[<0;3;4M\u001B[<3;4;4m");
    driver.dispose();

    expect(events.some((e) => e.type === "click")).toBe(false);
  });

  it("synthesizes pointerup+click when release is reported as motion with button=3", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // down: ESC[<0;3;4M -> cell(2,3)
    // move with no buttons: ESC[<35;10;10M -> (32 motion flag + 3 "no buttons")
    stdin.emit("data", "\u001B[<0;3;4M\u001B[<35;10;10M");
    driver.dispose();

    expect(events.some((e) => e.type === "pointerup" && e.cellX === 2 && e.cellY === 3)).toBe(true);
    expect(events.some((e) => e.type === "click" && e.cellX === 2 && e.cellY === 3)).toBe(true);
  });

  it("parses modified arrow keys (Alt+ArrowLeft) without leaking trailing bytes", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B[1;3D");
    driver.dispose();

    expect(events).toEqual([
      { type: "keydown", key: "ArrowLeft", code: "ArrowLeft", altKey: true },
    ]);
  });

  it("buffers split CSI sequences before parsing", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B");
    stdin.emit("data", "[1;3D");
    driver.dispose();

    expect(events).toEqual([
      { type: "keydown", key: "ArrowLeft", code: "ArrowLeft", altKey: true },
    ]);
  });

  it("does not leak SGR mouse bytes into text when ESC is chunk-split", () => {
    vi.useFakeTimers();
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: true,
    });

    // Simulate stream chunking where the leading ESC of a CSI mouse report is delivered
    // separately and the rest arrives after the normal timeout but before the longer ESC timeout.
    stdin.emit("data", "\u001B");
    vi.advanceTimersByTime(60);
    stdin.emit("data", "[<0;3;4M\u001B[<3;3;4m");
    driver.dispose();

    expect(events.some((e) => e.type === "click" && e.cellX === 2 && e.cellY === 3)).toBe(true);
    expect(events.some((e) => e.type === "keydown" && e.key === "[")).toBe(false);

    vi.useRealTimers();
  });

  it("does not leak SGR mouse bytes when ESC-repeat precedes a mouse report", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: true,
    });

    // If the user holds Escape (auto-repeat) while clicking, some terminals can coalesce:
    // ESC (Escape key) + ESC[<... (mouse report) into the same chunk. We must not parse
    // this as "ESC ESC" and then leak the remaining "[<...M" bytes into text input.
    stdin.emit("data", "\u001B\u001B[<0;3;4M\u001B[<3;3;4m");
    driver.dispose();

    expect(events.some((e) => e.type === "click" && e.cellX === 2 && e.cellY === 3)).toBe(true);
    expect(events.some((e) => e.type === "keydown" && e.key === "[")).toBe(false);
  });

  it("parses CSI-u modified Enter (Shift+Enter)", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // CSI u: <codepoint>;<modifier>u, where 13 is Enter and 2 is Shift.
    stdin.emit("data", "\u001B[13;2u");
    driver.dispose();

    expect(events).toEqual([{ type: "keydown", key: "Enter", code: "Enter", shiftKey: true }]);
  });

  it("parses modifyOtherKeys=1 style modified Enter (CSI 27;2;13~)", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B[27;2;13~");
    driver.dispose();

    expect(events).toEqual([{ type: "keydown", key: "Enter", code: "Enter", shiftKey: true }]);
  });

  it("parses ESC CR as Alt+Enter (Ghostty Shift+Enter encoding)", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // Ghostty sends ESC CR (\x1B\x0D) for Shift+Enter instead of CSI u.
    stdin.emit("data", "\u001B\u000D");
    driver.dispose();

    expect(events).toEqual([{ type: "keydown", key: "Enter", code: "Enter", altKey: true }]);
  });

  it("treats CRLF as a single Enter keydown", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\r\n");
    driver.dispose();

    expect(events).toEqual([{ type: "keydown", key: "Enter", code: "Enter" }]);
  });

  it("treats LF as insertLineBreak input", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    stdin.emit("data", "\n");
    driver.dispose();

    expect(events[0]).toEqual({
      type: "input",
      data: "\n",
      inputType: "insertLineBreak",
      text: "\n",
    });
  });

  it("maps raw control characters to Ctrl+<key> keydown events", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // Ctrl+P (0x10) and Ctrl+K (0x0B)
    stdin.emit("data", "\u0010\u000B");
    driver.dispose();

    expect(events).toContainEqual({
      type: "keydown",
      key: "p",
      code: "",
      ctrlKey: true,
    });
    expect(events).toContainEqual({
      type: "keydown",
      key: "k",
      code: "",
      ctrlKey: true,
    });
  });

  it("dispatches Ctrl+C and only exits when unhandled", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    let exited = false;
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
        return true;
      },
      onExit: () => {
        exited = true;
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u0003");
    driver.dispose();

    expect(exited).toBe(false);
    expect(events).toEqual([{ type: "keydown", key: "c", code: "", ctrlKey: true }]);
  });

  it("still exits on Ctrl+C when dispatch does not prevent default", () => {
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    let exited = false;
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: () => {},
      onExit: () => {
        exited = true;
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u0003");
    driver.dispose();

    expect(exited).toBe(true);
  });

  it("still exits on Ctrl+C when kitty keyboard protocol emits CSI-u", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    let exited = false;
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      onExit: () => {
        exited = true;
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B[99;5u");
    driver.dispose();

    expect(exited).toBe(true);
    expect(events).toEqual([{ type: "keydown", key: "c", code: "", ctrlKey: true }]);
  });

  it("still exits on Ctrl+C when xterm modifyOtherKeys emits an enhanced sequence", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    let exited = false;
    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      onExit: () => {
        exited = true;
      },
      enableMouse: false,
    });

    stdin.emit("data", "\u001B[27;5;99~");
    driver.dispose();

    expect(exited).toBe(true);
    expect(events).toEqual([{ type: "keydown", key: "c", code: "", ctrlKey: true }]);
  });

  it("preserves modifier keys on click events (Shift+click)", () => {
    const events: any[] = [];
    const stdin = new FakeStdin() as any;
    const stdout = new FakeStdout() as any;

    const driver = createStdinDriver({
      stdin,
      stdout,
      dispatch: (e) => {
        events.push(e);
      },
      enableMouse: false,
    });

    // press: ESC[<4;3;4M  (shift+left down at x=3,y=4) -> cell(2,3)
    // release: ESC[<7;3;4m  (shift + button=3 up)
    stdin.emit("data", "\u001B[<4;3;4M\u001B[<7;3;4m");
    driver.dispose();

    expect(
      events.some(
        (e) => e.type === "click" && e.cellX === 2 && e.cellY === 3 && e.shiftKey === true,
      ),
    ).toBe(true);
  });

  // Kitty keyboard protocol tests
  // Note: Kitty protocol is detected by colon fields or Kitty codepoint ranges.
  // Without colons, xterm encoding is used for backwards compatibility.
  describe("kitty keyboard protocol", () => {
    it("parses Kitty-style Shift modifier with event type (mod=2:1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 13;2:1u = Shift+Enter press
      // (13 is Enter, 2 = 1 + Shift bit, :1 means press event)
      stdin.emit("data", "\u001B[13;2:1u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "Enter", code: "Enter", shiftKey: true }]);
    });

    it("parses Kitty-style Alt modifier with event type (mod=3:1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 97;3:1u = Alt+a press
      // (97 is 'a', 3 = 1 + Alt bit, :1 means press event)
      stdin.emit("data", "\u001B[97;3:1u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "a", code: "", altKey: true }]);
    });

    it("parses Kitty-style Ctrl modifier with event type (mod=5:1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 107;5:1u = Ctrl+k press
      // (107 is 'k', 5 = 1 + Ctrl bit, :1 means press event)
      stdin.emit("data", "\u001B[107;5:1u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "k", code: "", ctrlKey: true }]);
    });

    it("parses Kitty-style Meta/Cmd modifier with event type (mod=9:1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 115;9:1u = Cmd+s press
      // (115 is 's', 9 = 1 + Super bit, :1 means press event)
      stdin.emit("data", "\u001B[115;9:1u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "s", code: "", metaKey: true }]);
    });

    it("parses Kitty-style combined modifiers with event type (Ctrl+Shift = mod=6:1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 112;6:1u = Ctrl+Shift+p press
      // (112 is 'p', 6 = 1 + (Ctrl+Shift bits), :1 means press event)
      stdin.emit("data", "\u001B[112;6:1u");
      driver.dispose();

      expect(events).toEqual([
        { type: "keydown", key: "p", code: "", ctrlKey: true, shiftKey: true },
      ]);
    });

    it("parses Kitty functional key codepoints (Escape = 57344)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol: CSI 57344u = Escape (functional key codepoint)
      stdin.emit("data", "\u001B[57344u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "Escape", code: "Escape" }]);
    });

    it("parses Kitty functional key F1 (57364)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol: CSI 57364u = F1
      stdin.emit("data", "\u001B[57364u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F1", code: "F1" }]);
    });

    it("parses Kitty functional key with modifiers (Shift+F1)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol with event type: CSI 57364;2:1u = Shift+F1 press
      // (57364 is F1, 2 = 1 + Shift bit, :1 means press event)
      stdin.emit("data", "\u001B[57364;2:1u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F1", code: "F1", shiftKey: true }]);
    });

    it("parses Kitty CSI u with event type (ignores key release)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol: CSI 97;1:3u = key release for Shift+a (event-type 3 = release)
      // Should be ignored (no event dispatched)
      stdin.emit("data", "\u001B[97;1:3u");
      driver.dispose();

      expect(events).toEqual([]);
    });

    it("parses Kitty special functional keys with modifiers and event type", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // CSI 1;5:1A = Ctrl+ArrowUp press (functional key with event type)
      stdin.emit("data", "\u001B[1;5:1A");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "ArrowUp", code: "ArrowUp", ctrlKey: true }]);
    });

    it("parses Kitty tilde keys with modifiers and event type", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // CSI 5;2:1~ = Shift+PageUp press (tilde key with event type)
      stdin.emit("data", "\u001B[5;2:1~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "PageUp", code: "PageUp", shiftKey: true }]);
    });

    it("parses Kitty CSI u with colon-separated codepoints", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // Kitty protocol: CSI 97:65:97;2u = Shift+a with shifted/base codepoints
      // Main codepoint is 97 ('a'), shifted is 65 ('A'), base is 97
      stdin.emit("data", "\u001B[97:65:97;2u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "a", code: "", shiftKey: true }]);
    });
  });

  // Extended key support tests
  describe("extended key support", () => {
    it("parses Insert key (CSI 2~)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[2~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "Insert", code: "Insert" }]);
    });

    it("parses PageUp key (CSI 5~)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[5~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "PageUp", code: "PageUp" }]);
    });

    it("parses PageDown key (CSI 6~)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[6~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "PageDown", code: "PageDown" }]);
    });

    it("parses F5 key (CSI 15~)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[15~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F5", code: "F5" }]);
    });

    it("parses F12 key (CSI 24~)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[24~");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F12", code: "F12" }]);
    });

    it("parses F1 via SS3 (ESC O P)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001BOP");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F1", code: "F1" }]);
    });

    it("parses F4 via SS3 (ESC O S)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001BOS");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "F4", code: "F4" }]);
    });

    it("parses Backspace via CSI u (codepoint 127)", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      stdin.emit("data", "\u001B[127u");
      driver.dispose();

      expect(events).toEqual([{ type: "keydown", key: "Backspace", code: "Backspace" }]);
    });
  });

  // Mouse scroll tests
  describe("mouse scroll", () => {
    it("parses wheel up event", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // SGR mouse wheel up: ESC[<64;10;5M (64 = wheel up at x=10, y=5)
      stdin.emit("data", "\u001B[<64;10;5M");
      driver.dispose();

      expect(events).toContainEqual({
        type: "wheel",
        cellX: 9,
        cellY: 4,
        deltaY: -1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      });
    });

    it("parses wheel down event", () => {
      const events: any[] = [];
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;

      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (e) => {
          events.push(e);
        },
        enableMouse: false,
      });

      // SGR mouse wheel down: ESC[<65;10;5M (65 = wheel down at x=10, y=5)
      stdin.emit("data", "\u001B[<65;10;5M");
      driver.dispose();

      expect(events).toContainEqual({
        type: "wheel",
        cellX: 9,
        cellY: 4,
        deltaY: 1,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      });
    });
  });
});
