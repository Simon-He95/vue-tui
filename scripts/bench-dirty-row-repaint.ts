import { cpus } from "node:os";
import { createTerminal, getPlaneTerminal } from "../src/core/terminal/create-terminal.js";
import { createStdoutRenderer } from "../src/renderer/cli/stdout-renderer.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";

const cols = 160;
const rows = 50;
const frames = 300;
const warmupFrames = 60;
const repetitions = 3;
const style = { fg: "green" };
const results: Record<string, unknown>[] = [];

for (const key of Object.keys(process.env)) {
  if (
    /^(VUE_TUI_|DIMCODE_(PROFILE|DEBUG|TUI)|GHOSTTY_|KITTY_|WEZTERM_|ALACRITTY_|VSCODE_)/.test(key)
  ) {
    delete process.env[key];
  }
}
process.env.TERM = "xterm-256color";
process.env.GHOSTTY_RESOURCES_DIR = "/benchmark-fixture";

for (const [label, dirtyRows, fullRows] of [
  ["29 rows, one changed cell", 29, false],
  ["30 rows, one changed cell", 30, false],
  ["50 rows, one changed cell", 50, false],
  ["30 rows, all cells changed", 30, true],
  ["50 rows, all cells changed", 50, true],
  ["unchanged full invalidation", 50, false],
] as const) {
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const terminal = createTerminal({ cols, rows });
    let bytes = 0;
    const renderer = createStdoutRenderer(terminal, {
      output: {
        isTTY: true,
        write: (chunk) => {
          bytes += Buffer.byteLength(chunk);
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      useSyncOutput: false,
      terminalGraphics: false,
      colorMode: "ansi16",
    });
    terminal.fill(0, 0, cols, rows, "x", style);
    terminal.commit({ sync: true });
    const durations: number[] = [];
    let totalBytes = 0;
    for (let frame = 0; frame < warmupFrames + frames; frame++) {
      const text = frame % 2 ? "a" : "b";
      if (label === "unchanged full invalidation") {
        terminal.clear();
        terminal.fill(0, 0, cols, rows, "x", style);
      } else {
        for (let y = 0; y < dirtyRows; y++) {
          if (fullRows) terminal.write(text.repeat(cols), { x: 0, y, style });
          else terminal.put(5, y, text, style);
        }
      }
      bytes = 0;
      const started = performance.now();
      terminal.commit({ sync: true });
      const duration = performance.now() - started;
      if (frame >= warmupFrames) {
        durations.push(duration);
        totalBytes += bytes;
      }
    }
    durations.sort((a, b) => a - b);
    results.push({
      phase: "stdout",
      label,
      repetition,
      meanMs: durations.reduce((sum, value) => sum + value, 0) / frames,
      p95Ms: durations[Math.ceil(frames * 0.95) - 1],
      bytesPerFrame: totalBytes / frames,
    });
    renderer.dispose();
    terminal.dispose();
  }
}

for (const nodeCount of [2, 50, 200]) {
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const terminal = createTerminal({ cols, rows });
    const plane = getPlaneTerminal(terminal, "transcript");
    const manager = createRenderManager(terminal);
    const dirtyRows = Array.from({ length: 30 }, (_, index) => index);
    const text = "x".repeat(cols);
    const nodes = Array.from({ length: nodeCount }, (_, index) => {
      const y = nodeCount === 2 ? 0 : index % rows;
      const h = nodeCount === 2 ? (index === 0 ? rows : 30) : 1;
      const bounds = Array.from({ length: h }, (_, offset) => y + offset);
      return manager.register({
        stack: manager.rootStack,
        plane: "transcript",
        rect: { x: 0, y, w: cols, h },
        paint: (dirty) => {
          for (const row of dirty ?? bounds) {
            if (row >= y && row < y + h) plane.write(text, { x: 0, y: row, style });
          }
        },
      });
    });
    manager.render();
    const durations: number[] = [];
    let stats: ReturnType<typeof manager.render>;
    for (let frame = 0; frame < warmupFrames + frames; frame++) {
      for (const node of nodes) manager.markDirtyRows(node.id, dirtyRows);
      const started = performance.now();
      stats = manager.render();
      const duration = performance.now() - started;
      if (frame >= warmupFrames) durations.push(duration);
    }
    durations.sort((a, b) => a - b);
    results.push({
      phase: "paint",
      nodeCount,
      repetition,
      meanMs: durations.reduce((sum, value) => sum + value, 0) / frames,
      p95Ms: durations[Math.ceil(frames * 0.95) - 1],
      stats: stats!,
    });
    manager.dispose();
    terminal.dispose();
  }
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      cpu: cpus()[0]?.model,
      cols,
      rows,
      frames,
      warmupFrames,
      repetitions,
      output: "buffered byte-counting sink; terminal emulator and GPU are excluded",
      results,
    },
    null,
    2,
  ),
);
