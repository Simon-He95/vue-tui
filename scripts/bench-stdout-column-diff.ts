import { performance } from "node:perf_hooks";
import { createTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import type { CliOutput } from "../src/renderer/cli/stdout-renderer.js";

type BufferedOutput = CliOutput & {
  take: () => string;
};

function createBufferedOutput(): BufferedOutput {
  const chunks: string[] = [];

  return {
    isTTY: false,
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

function runCase(name: string, columnDiff: boolean, frames: number) {
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const middle =
    " building package with a deliberately very long unchanged middle segment ".repeat(2);
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
    columnDiff,
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
}

const frames = Number(process.env.FRAMES ?? 5000);

const fullRow = runCase("full dirty row", false, frames);
const columnDiff = runCase("column diff", true, frames);

console.table([fullRow, columnDiff]);

const byteRatio = columnDiff.totalBytes / fullRow.totalBytes;
console.log(`byteRatio=${byteRatio.toFixed(4)}`);

if (byteRatio > 0.35) {
  console.error(
    `Expected column diff bytes <= 35% of full-row bytes, got ${(
      byteRatio * 100
    ).toFixed(2)}%`,
  );
  process.exit(1);
}
