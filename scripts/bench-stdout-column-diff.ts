import { performance } from "node:perf_hooks";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import type { CliOutput } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
};

const TERMINAL_ENV_KEYS = [
  "GHOSTTY_RESOURCES_DIR",
  "KITTY_WINDOW_ID",
  "ALACRITTY_WINDOW_ID",
  "ALACRITTY_LOG",
  "WEZTERM_PANE",
  "WEZTERM_EXECUTABLE",
  "TERM_PROGRAM",
  "TERM",
] as const;

function withTerminalEnv<T>(
  next: Partial<Record<(typeof TERMINAL_ENV_KEYS)[number], string | undefined>>,
  fn: () => T,
): T {
  const prev: Partial<Record<(typeof TERMINAL_ENV_KEYS)[number], string | undefined>> = {};

  for (const key of TERMINAL_ENV_KEYS) {
    prev[key] = process.env[key];
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(next)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    for (const key of TERMINAL_ENV_KEYS) {
      const value = prev[key];
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createBufferedOutput(isTTY: boolean): BufferedOutput {
  const chunks: string[] = [];

  return {
    isTTY,
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
  const frames = options.frames;
  const oldWezTermPane = process.env.WEZTERM_PANE;

  try {
    if (options.conservative) {
      process.env.WEZTERM_PANE = "bench";
    } else {
      delete process.env.WEZTERM_PANE;
    }

    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const middle =
      " building package with a deliberately very very long unchanged middle segment ".repeat(2);
    const percentX = 2 + middle.length;
    const cols = percentX + 8;

    const terminal = createTerminal({ cols, rows: 1 });
    terminal.write(`⠋ ${middle}000%`, { x: 0, y: 0 });
    terminal.commit({ sync: true });

    // Keep this true for both cases. The only variable should be whether the
    // renderer enters conservative dirty-row rendering.
    const output = createBufferedOutput(true);
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

    for (let i = 1; i <= frames; i++) {
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
    if (oldWezTermPane == null) {
      delete process.env.WEZTERM_PANE;
    } else {
      process.env.WEZTERM_PANE = oldWezTermPane;
    }
  }
}

const frames = Number(process.env.FRAMES ?? 5000);

const conservative = withTerminalEnv(
  {
    TERM_PROGRAM: "WezTerm",
    TERM: "xterm-256color",
  },
  () =>
    runCase("full dirty row / conservative", {
      frames,
      conservative: true,
    }),
);

const optimized = withTerminalEnv(
  {
    TERM_PROGRAM: "iTerm.app",
    TERM: "xterm-256color",
  },
  () =>
    runCase("multi-span column diff", {
      frames,
      conservative: false,
    }),
);

console.table([conservative, optimized]);

const byteRatio = optimized.totalBytes / conservative.totalBytes;
console.log(`byteRatio=${byteRatio.toFixed(4)}`);

if (optimized.meanBytes >= conservative.meanBytes) {
  console.error(
    `Expected optimized meanBytes < conservative meanBytes, got optimized=${optimized.meanBytes}, conservative=${conservative.meanBytes}`,
  );
  process.exit(1);
}

if (optimized.maxFrameBytes >= conservative.maxFrameBytes) {
  console.error(
    `Expected optimized maxFrameBytes < conservative maxFrameBytes, got optimized=${optimized.maxFrameBytes}, conservative=${conservative.maxFrameBytes}`,
  );
  process.exit(1);
}

if (byteRatio > 0.35) {
  console.error(
    `Expected optimized total bytes <= 35% of conservative full-row bytes, got ${(
      byteRatio * 100
    ).toFixed(2)}%`,
  );
  process.exit(1);
}
