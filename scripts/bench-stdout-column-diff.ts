import { performance } from "node:perf_hooks";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import type { CliOutput, StdoutRendererOptions } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
};

type InternalColumnDiffMode = "full-row" | "single-span" | "multi-span";
type InternalStdoutRendererOptions = StdoutRendererOptions & {
  __columnDiffMode?: InternalColumnDiffMode;
};

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const middle =
  " building package with a deliberately very very long unchanged middle segment ".repeat(2);
const percentX = 2 + middle.length;
const cols = percentX + 8;
const cleanTerminalEnv: Record<string, string | undefined> = {
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
};

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

function assertNoMiddleRewrite(frame: string, unchangedMiddle: string): void {
  if (frame.includes(unchangedMiddle)) {
    throw new Error("optimized frame rewrote unchanged middle text");
  }
}

function assertContainsPatch(frame: string, expected: string): void {
  if (!frame.includes(expected)) {
    throw new Error(`optimized frame did not contain expected patch: ${JSON.stringify(expected)}`);
  }
}

function minimalChangedPatch(previous: string, next: string): string {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start++;
  }

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
    previousEnd--;
    nextEnd--;
  }

  return next.slice(start, nextEnd);
}

function runCase(
  name: string,
  options: Readonly<{
    frames: number;
    columnDiffMode: "full-row" | "single-span" | "multi-span";
  }>,
) {
  return withEnv(cleanTerminalEnv, () => {
    const frames = options.frames;
    const terminal = createTerminal({ cols, rows: 1 });

    // Keep both benchmark cases as TTY. The only intended variable is the
    // explicit dirty-row patch mode passed to the renderer below.
    const output = createBufferedOutput(true);

    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
      useSyncOutput: false,
      __columnDiffMode: options.columnDiffMode,
    } as InternalStdoutRendererOptions);

    // Drop renderer's initial blank/full-frame setup.
    output.take();

    // Seed the baseline through the same commit path used by the measured
    // update loop.
    terminal.write(`⠋ ${middle}000%`, { x: 0, y: 0 });
    terminal.commit({ sync: true });
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
      if (options.columnDiffMode === "multi-span" && i > 0 && i < 5) {
        const previousProgress = `${String((i - 1) % 1000).padStart(3, "0")}%`;
        const nextProgress = `${String(i % 1000).padStart(3, "0")}%`;

        assertContainsPatch(frame, spinnerFrames[i % spinnerFrames.length]!);
        assertContainsPatch(frame, minimalChangedPatch(previousProgress, nextProgress));
        assertNoMiddleRewrite(frame, middle);
      }

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
  });
}

function runFragmentedShortRowCase(
  name: string,
  options: Readonly<{
    frames: number;
    dirtyRowPatchMode: "row" | "span";
  }>,
) {
  return withEnv(cleanTerminalEnv, () => {
    const frames = options.frames;
    const fragmentedCols = 24;
    const indices = [0, 5, 10, 15, 20];
    const terminal = createTerminal({ cols: fragmentedCols, rows: 1 });
    const output = createBufferedOutput(true);

    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
      useSyncOutput: false,
      dirtyRowPatchMode: options.dirtyRowPatchMode,
    });

    output.take();
    terminal.write("a".repeat(fragmentedCols), { x: 0, y: 0 });
    terminal.commit({ sync: true });
    output.take();

    let totalBytes = 0;
    let maxFrameBytes = 0;
    const startedAt = performance.now();

    for (let i = 0; i < frames; i++) {
      const charOffset = i % 2 === 0 ? 0 : 10;

      for (const [index, x] of indices.entries()) {
        terminal.put(x, 0, String.fromCharCode("A".charCodeAt(0) + charOffset + index));
      }

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
  });
}

function parseFrameCount(value: string | undefined): number {
  const parsed = Number(value ?? 5000);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`FRAMES must be a positive finite number, received ${JSON.stringify(value)}`);
  }

  return Math.floor(parsed);
}

const frames = parseFrameCount(process.env.FRAMES);

const fullRow = runCase("full-row baseline", {
  frames,
  columnDiffMode: "full-row",
});
const singleSpan = runCase("single-span baseline", {
  frames,
  columnDiffMode: "single-span",
});
const multiSpan = runCase("multi-span optimized", {
  frames,
  columnDiffMode: "multi-span",
});
const fragmentedRow = runFragmentedShortRowCase("fragmented short-row baseline", {
  frames,
  dirtyRowPatchMode: "row",
});
const fragmentedSpan = runFragmentedShortRowCase("fragmented short-row optimized", {
  frames,
  dirtyRowPatchMode: "span",
});

console.table([fullRow, singleSpan, multiSpan, fragmentedRow, fragmentedSpan]);

if (fullRow.totalBytes <= 0) {
  throw new Error(`Invalid full-row benchmark: totalBytes=${fullRow.totalBytes}`);
}

if (singleSpan.totalBytes <= 0) {
  throw new Error(`Invalid single-span benchmark: totalBytes=${singleSpan.totalBytes}`);
}

if (fragmentedRow.totalBytes <= 0) {
  throw new Error(`Invalid fragmented row benchmark: totalBytes=${fragmentedRow.totalBytes}`);
}

if (fragmentedSpan.totalBytes <= 0) {
  throw new Error(`Invalid fragmented span benchmark: totalBytes=${fragmentedSpan.totalBytes}`);
}

const fullRowByteRatio = multiSpan.totalBytes / fullRow.totalBytes;
const singleSpanByteRatio = multiSpan.totalBytes / singleSpan.totalBytes;

if (!Number.isFinite(fullRowByteRatio)) {
  throw new Error(`Invalid fullRowByteRatio=${fullRowByteRatio}`);
}

if (!Number.isFinite(singleSpanByteRatio)) {
  throw new Error(`Invalid singleSpanByteRatio=${singleSpanByteRatio}`);
}

console.log(`byteRatio=${fullRowByteRatio.toFixed(4)}`);
console.log(`fullRowByteRatio=${fullRowByteRatio.toFixed(4)}`);
console.log(`singleSpanByteRatio=${singleSpanByteRatio.toFixed(4)}`);

if (multiSpan.meanBytes >= singleSpan.meanBytes) {
  console.error(
    `Expected multi-span meanBytes < single-span meanBytes, got ${multiSpan.meanBytes.toFixed(
      2,
    )} >= ${singleSpan.meanBytes.toFixed(2)}`,
  );
  process.exit(1);
}

if (fragmentedSpan.totalBytes > fragmentedRow.totalBytes) {
  console.error(
    `Expected fragmented short-row optimized bytes <= baseline bytes, got optimized=${fragmentedSpan.totalBytes} baseline=${fragmentedRow.totalBytes}`,
  );
  process.exit(1);
}

if (singleSpanByteRatio >= 0.45) {
  console.error(
    `Expected multi-span total bytes < 45% of single-span bytes, got ${(
      singleSpanByteRatio * 100
    ).toFixed(2)}%`,
  );
  process.exit(1);
}

if (fullRowByteRatio >= 0.35) {
  console.error(
    `Expected multi-span total bytes < 35% of full-row bytes, got ${(
      fullRowByteRatio * 100
    ).toFixed(2)}%`,
  );
  process.exit(1);
}
