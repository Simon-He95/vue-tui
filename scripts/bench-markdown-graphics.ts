import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { defineComponent, h, nextTick } from "vue";
import { createTerminal } from "../src/index.js";
import {
  createStdoutRenderer,
  createTerminalApp,
  detectTerminalGraphicsCapabilities,
} from "../src/cli.js";
import { TVirtualMarkdown } from "../src/markdown.js";
import { registerTerminalGraphicsOutput } from "../src/renderer/terminal-graphics.js";
import { paintMarkdownVisualRow } from "../src/vue/markdown/render.js";

const HOT_PAINT_ITERATIONS = 100;
const HOT_PAINT_SAMPLES = 5;
const KITTY_MOVE_ITERATIONS = 100;
const KITTY_MOVE_SAMPLES = 5;
const ONE_MIB_BASE64 = "QUJD".repeat(256 * 1024);
const QUARTER_MIB_BASE64 = "QUJD".repeat(64 * 1024);
const baseStyle = Object.freeze({});

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function createImageRow(base64: string) {
  const graphic = Object.freeze({
    kind: "image" as const,
    src: "bench.png",
    base64,
    naturalWidth: 320,
    naturalHeight: 160,
    displayWidth: 40,
    displayHeight: 4,
  });
  return Object.freeze({
    key: "bench-image-row",
    blockKey: "bench-image-block",
    rowInBlock: 0,
    plainText: "",
    segments: Object.freeze([
      Object.freeze({
        text: " ".repeat(40),
        cells: 40,
        graphic,
        fallbackText: "image",
      }),
    ]),
  });
}

function benchMarkdownImageHotPaint() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  const row = createImageRow(ONE_MIB_BASE64);
  let sink = 0;
  const unregister = registerTerminalGraphicsOutput(terminal, {
    capabilities: detectTerminalGraphicsCapabilities({
      stdoutIsTTY: true,
      protocol: "kitty",
      force: true,
    }),
    queue(payload) {
      sink ^= payload.sequence.length;
      return true;
    },
    isActive: () => true,
  });

  const paint = () =>
    paintMarkdownVisualRow(terminal, row, {
      x: 0,
      y: 0,
      w: 40,
      baseStyle,
    });

  try {
    paint();
    const samples: number[] = [];
    for (let sample = 0; sample < HOT_PAINT_SAMPLES; sample++) {
      const started = performance.now();
      for (let iteration = 0; iteration < HOT_PAINT_ITERATIONS; iteration++) paint();
      samples.push(performance.now() - started);
    }
    assert.equal(samples.length, HOT_PAINT_SAMPLES);
    return {
      payloadBase64Bytes: ONE_MIB_BASE64.length,
      iterations: HOT_PAINT_ITERATIONS,
      samples: HOT_PAINT_SAMPLES,
      medianMs: Number(median(samples).toFixed(3)),
      minMs: Number(Math.min(...samples).toFixed(3)),
      maxMs: Number(Math.max(...samples).toFixed(3)),
      sink,
    };
  } finally {
    unregister();
    terminal.dispose();
  }
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function benchKittyImageMoveSample() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  const row = createImageRow(QUARTER_MIB_BASE64);
  let output = "";
  const renderer = createStdoutRenderer(terminal, {
    output: {
      isTTY: true,
      write(chunk: string) {
        output += chunk;
      },
    },
    clear: false,
    hideCursor: false,
    altScreen: false,
    terminalGraphics: { protocol: "kitty", force: true },
  });

  try {
    const started = performance.now();
    for (let iteration = 0; iteration < KITTY_MOVE_ITERATIONS; iteration++) {
      paintMarkdownVisualRow(terminal, row, {
        x: 0,
        y: iteration % 20,
        w: 40,
        baseStyle,
      });
      (
        renderer as unknown as { render: (dirtyRows?: readonly number[], force?: boolean) => void }
      ).render(undefined, true);
    }
    const durationMs = performance.now() - started;
    const imageTransmissions = countMatches(output, /a=T/g);
    const placements = countMatches(output, /a=p/g);
    assert.ok(imageTransmissions >= 1);
    return {
      durationMs: Number(durationMs.toFixed(3)),
      stdoutBytes: Buffer.byteLength(output),
      imageTransmissions,
      placements,
      deletes: countMatches(output, /a=d/g),
    };
  } finally {
    renderer.dispose();
    terminal.dispose();
  }
}

function benchKittyImageMove() {
  const samples = Array.from({ length: KITTY_MOVE_SAMPLES }, () => benchKittyImageMoveSample());
  const durations = samples.map((sample) => sample.durationMs);
  const stdoutBytes = samples.map((sample) => sample.stdoutBytes);
  const first = samples[0]!;
  for (const sample of samples.slice(1)) {
    assert.equal(sample.imageTransmissions, first.imageTransmissions);
    assert.equal(sample.placements, first.placements);
    assert.equal(sample.deletes, first.deletes);
  }
  return {
    payloadBase64Bytes: QUARTER_MIB_BASE64.length,
    moves: KITTY_MOVE_ITERATIONS,
    samples: KITTY_MOVE_SAMPLES,
    medianMs: Number(median(durations).toFixed(3)),
    minMs: Number(Math.min(...durations).toFixed(3)),
    maxMs: Number(Math.max(...durations).toFixed(3)),
    medianStdoutBytes: median(stdoutBytes),
    minStdoutBytes: Math.min(...stdoutBytes),
    maxStdoutBytes: Math.max(...stdoutBytes),
    imageTransmissions: first.imageTransmissions,
    placements: first.placements,
    deletes: first.deletes,
  };
}

async function benchVirtualMarkdownRowScroll() {
  const previousScrollRegions = process.env.DIMCODE_TUI_SCROLL_REGIONS;
  process.env.DIMCODE_TUI_SCROLL_REGIONS = "1";
  const content = Array.from({ length: 100 }, (_, index) => `row-${index}`).join("\n\n");
  const App = defineComponent({
    name: "BenchVirtualMarkdownRowScroll",
    setup() {
      return () =>
        h(TVirtualMarkdown, {
          x: 0,
          y: 0,
          w: 24,
          h: 6,
          content,
          autoFocus: true,
          rowScrollMode: "unsafe-full-row",
        });
    },
  });
  const app = createTerminalApp({ cols: 24, rows: 10, component: App });
  const renderer = createStdoutRenderer(app.terminal, {
    output: { isTTY: true, write() {} },
    clear: false,
    hideCursor: false,
    altScreen: false,
  });

  try {
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flushNow();
    const commits: Array<readonly number[] | null> = [];
    const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));
    app.events.dispatch({
      type: "wheel",
      cellX: 0,
      cellY: 0,
      deltaY: 100,
      time: 1_000,
    });
    app.scheduler.flushNow();
    await nextTick();
    app.scheduler.flushNow();
    off();

    const dirtyRows = Array.from(
      new Set(commits.flatMap((rows) => (rows == null ? [] : [...rows]))),
    ).sort((a, b) => a - b);
    assert.ok(commits.length > 0);
    return {
      viewportRows: 6,
      commits: commits.length,
      dirtyRows,
      dirtyRowCount: dirtyRows.length,
    };
  } finally {
    renderer.dispose();
    app.dispose();
    if (previousScrollRegions == null) delete process.env.DIMCODE_TUI_SCROLL_REGIONS;
    else process.env.DIMCODE_TUI_SCROLL_REGIONS = previousScrollRegions;
  }
}

const result = {
  tag: "vue-tui-markdown-graphics-benchmark-v1",
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  markdownImageHotPaint: benchMarkdownImageHotPaint(),
  kittyImageMove: benchKittyImageMove(),
  virtualMarkdownRowScroll: await benchVirtualMarkdownRowScroll(),
};

console.log(JSON.stringify(result, null, 2));
