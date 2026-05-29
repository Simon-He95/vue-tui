import { performance } from "node:perf_hooks";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import type { CliOutput } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
};

type EnvSnapshot = Partial<Record<string, string>>;

const TERMINAL_ENV_KEYS = [
  "TERM",
  "TERM_PROGRAM",
  "KITTY_WINDOW_ID",
  "ALACRITTY_WINDOW_ID",
  "ALACRITTY_LOG",
  "WEZTERM_PANE",
  "WEZTERM_EXECUTABLE",
  "GHOSTTY_RESOURCES_DIR",
  "VSCODE_PID",
  "VSCODE_IPC_HOOK_CLI",
] as const;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of TERMINAL_ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of TERMINAL_ENV_KEYS) {
    const value = snapshot[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearTerminalEnv(): void {
  for (const key of TERMINAL_ENV_KEYS) {
    delete process.env[key];
  }
}

function createBufferedOutput(): BufferedOutput {
  const chunks: string[] = [];

  return {
    // Keep both benchmark arms on the TTY code path. The only intended
    // difference is conservative full-row rendering vs column diff.
    isTTY: true,
    write(chunk: string) {
      chunks.push(String(chunk));
    },
    take() {
      const out = chunks.join("");
      chunks.length = 0;
      return out;
    },
  };
}

function runCase(
  name: string,
  options: Readonly<{
    frames: number;
    conservative: boolean;
  }>,
) {
  const envSnapshot = snapshotEnv();

  try {
    clearTerminalEnv();

    if (options.conservative) {
      process.env.WEZTERM_PANE = "bench";
      process.env.TERM_PROGRAM = "WezTerm";
    } else {
      // A deterministic non-conservative TTY. Avoid inheriting CI/local terminal
      // variables that accidentally force full-row rendering.
      process.env.TERM = "xterm-256color";
      process.env.TERM_PROGRAM = "iTerm.app";
    }

    const frames = options.frames;
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const middle =
      " building package with a deliberately very very long unchanged middle segment ".repeat(2);
    const percentX = 2 + middle.length;
    const cols = percentX + 8;

    const terminal = createTerminal({ cols, rows: 1 });
    terminal.write(`⠋ ${middle}000%`, { x: 0, y: 0 });

    const output = createBufferedOutput();
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      useSyncOutput: false,
    });

    output.take();

    let totalBytes = 0;
    let maxFrameBytes = 0;
    const startedAt = performance.now();

    for (let i = 0; i < frames; i++) {
      terminal.put(0, 0, spinnerFrames[i % spinnerFrames.length]!);
      terminal.write(`${String(i % 1000).padStart(3, "0")}%`, {
        x: percentX,
        y: 0,
      });
      terminal.commit({ sync: true });

      const frame = output.take();
      const bytes = Buffer.byteLength(frame, "utf8");
      totalBytes += bytes;
      maxFrameBytes = Math.max(maxFrameBytes, bytes);
    }

    const durationMs = performance.now() - startedAt;
    renderer.dispose();
    terminal.dispose();

    return {
      name,
      frames,
      totalBytes,
      meanBytes: totalBytes / frames,
      maxFrameBytes,
      durationMs,
      framesPerSecond: frames / (durationMs / 1000),
    };
  } finally {
    restoreEnv(envSnapshot);
  }
}

const frames = Number(process.env.FRAMES ?? 5000);

const conservative = runCase("full dirty row / conservative", {
  frames,
  conservative: true,
});

const optimized = runCase("multi-span column diff", {
  frames,
  conservative: false,
});

console.table([conservative, optimized]);

const byteRatio = optimized.totalBytes / conservative.totalBytes;
console.log(`byteRatio=${byteRatio.toFixed(4)}`);

if (byteRatio > 0.35) {
  console.error(
    `Expected optimized total bytes <= 35% of conservative full-row bytes, got ${(
      byteRatio * 100
    ).toFixed(2)}%`,
  );
  process.exit(1);
}
