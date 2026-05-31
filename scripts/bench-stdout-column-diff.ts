import { performance } from "node:perf_hooks";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import type { CliOutput } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
};

function createBufferedOutput(isTTY = true): BufferedOutput {
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

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const prev = new Map<string, string | undefined>();

  for (const key of Object.keys(patch)) {
    prev.set(key, process.env[key]);
    const next = patch[key];
    if (next == null) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of prev) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function runCase(
  name: string,
  options: Readonly<{
    frames: number;
    dirtyRowPatchMode: "row" | "span";
  }>,
) {
  return withEnv(
    {
      GHOSTTY_RESOURCES_DIR: undefined,
      GHOSTTY_BIN_DIR: undefined,
      GHOSTTY_SHELL_FEATURES: undefined,
      WEZTERM_PANE: undefined,
      WEZTERM_EXECUTABLE: undefined,
      KITTY_WINDOW_ID: undefined,
      ALACRITTY_WINDOW_ID: undefined,
      ALACRITTY_LOG: undefined,
      TERM_PROGRAM: undefined,
      TERM: undefined,
    },
    () => {
      const frames = options.frames;
      const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      const middle =
        " building package with a deliberately very very long unchanged middle segment ".repeat(2);
      const percentX = 2 + middle.length;
      const cols = percentX + 8;

      const terminal = createTerminal({ cols, rows: 1 });
      terminal.write(`⠋ ${middle}000%`, { x: 0, y: 0 });

      // Keep both benchmark cases as TTY. The only intended variable is the
      // explicit dirty-row patch mode passed to the renderer below.
      const output = createBufferedOutput(true);

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        useSyncOutput: false,
        dirtyRowPatchMode: options.dirtyRowPatchMode,
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
    },
  );
}

function parseFrameCount(value: string | undefined): number {
  const parsed = Number(value ?? 5000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`FRAMES must be a positive finite number, received ${JSON.stringify(value)}`);
  }

  return Math.floor(parsed);
}

const frames = parseFrameCount(process.env.FRAMES);

const conservative = runCase("full dirty row", {
  frames,
  dirtyRowPatchMode: "row",
});
const optimized = runCase("multi-span column diff", {
  frames,
  dirtyRowPatchMode: "span",
});

console.table([conservative, optimized]);

if (conservative.totalBytes <= 0) {
  throw new Error(`Invalid conservative benchmark: totalBytes=${conservative.totalBytes}`);
}

const byteRatio = optimized.totalBytes / conservative.totalBytes;

if (!Number.isFinite(byteRatio)) {
  throw new Error(`Invalid byteRatio=${byteRatio}`);
}

console.log(`byteRatio=${byteRatio.toFixed(4)}`);

if (optimized.meanBytes >= conservative.meanBytes) {
  console.error(
    `Expected optimized meanBytes < conservative meanBytes, got ${optimized.meanBytes.toFixed(
      2,
    )} >= ${conservative.meanBytes.toFixed(2)}`,
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
