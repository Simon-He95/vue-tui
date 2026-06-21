import type { Component } from "vue";
import type { Cell, Style, Terminal } from "../src/core/types.js";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp } from "../src/create-terminal-app.js";
import { TBox, TText } from "../src/index.js";
import {
  TCandlestickChart,
  TContributionGraph,
  TLineChart,
  TPieChart,
} from "../src/experimental.js";
import { useLayout } from "../src/vue.js";

const outDir = process.env.VUE_TUI_CHART_E2E_DIR || "test-results/charts-e2e";
const cellW = 10;
const cellH = 18;
const fontSize = 14;

const contributionValues = Array.from({ length: 18 * 7 }, (_, index) =>
  index % 13 === 0 ? 0 : ((index * 9) % 31) + 2,
);
const contributionLabels = contributionValues.map((_, index) => `turn ${index + 1}`);
const lineValues = [18, 24, 21, 30, 44, 40, 58, 53, 62, 76, 70, 88, 92, 84, 99, 110, 104];
const lineLabels = lineValues.map((_, index) => `turn ${index + 1}`);
const candles = [
  { open: 34, high: 42, low: 28, close: 39 },
  { open: 39, high: 48, low: 36, close: 45 },
  { open: 45, high: 47, low: 32, close: 35 },
  { open: 35, high: 52, low: 34, close: 50 },
  { open: 50, high: 58, low: 44, close: 47 },
  { open: 47, high: 60, low: 43, close: 56 },
  { open: 56, high: 68, low: 52, close: 63 },
  { open: 63, high: 66, low: 54, close: 57 },
  { open: 57, high: 74, low: 55, close: 71 },
  { open: 71, high: 79, low: 64, close: 75 },
];
const candleLabels = candles.map((_, index) => `session ${index + 1}`);
const pieValues = [52, 31, 17];
const pieLabels = ["prompt", "output", "cache"];

const fgColors: Record<string, string> = {
  black: "#111827",
  blackBright: "#6b7280",
  blue: "#2563eb",
  blueBright: "#60a5fa",
  cyan: "#06b6d4",
  cyanBright: "#67e8f9",
  green: "#22c55e",
  greenBright: "#4ade80",
  magenta: "#d946ef",
  magentaBright: "#f0abfc",
  red: "#ef4444",
  redBright: "#f87171",
  white: "#d1d5db",
  whiteBright: "#f9fafb",
  yellow: "#eab308",
  yellowBright: "#fef08a",
};

function cssColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value) return fallback;
  if (value.startsWith("#")) return value;
  return fgColors[value] ?? fallback;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function cellColors(style: Style): { fg: string; bg: string } {
  const fg = cssColor(style.fg, "#d1d5db");
  const bg = cssColor(style.bg, "#262b33");
  return style.inverse ? { fg: bg, bg: fg } : { fg, bg };
}

function writeTerminalShot(name: string, terminal: Terminal): void {
  const size = terminal.size();
  const width = size.cols * cellW;
  const height = size.rows * cellH;
  const rects: string[] = [];
  const text: string[] = [];
  const lines: string[] = [];

  for (let y = 0; y < size.rows; y++) {
    const row = terminal.getRow(y);
    lines.push(row.map((cell) => (cell.continuation ? "" : cell.ch)).join(""));
    for (let x = 0; x < size.cols; x++) {
      const cell = row[x] as Cell | undefined;
      if (!cell || cell.continuation) continue;
      const { fg, bg } = cellColors(cell.style);
      if (cell.style.bg || cell.style.inverse) {
        rects.push(
          `<rect x="${x * cellW}" y="${y * cellH}" width="${cellW * cell.width}" height="${cellH}" fill="${bg}" />`,
        );
      }
      if (!cell.ch.trim()) continue;
      const opacity = cell.style.dim ? "0.72" : "1";
      const weight = cell.style.bold ? "700" : "400";
      text.push(
        `<text x="${x * cellW}" y="${y * cellH + 14}" fill="${fg}" opacity="${opacity}" font-weight="${weight}">${escapeHtml(cell.ch)}</text>`,
      );
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#262b33" />`,
    ...rects,
    `<g font-family="Menlo, Monaco, Consolas, monospace" font-size="${fontSize}" dominant-baseline="alphabetic">`,
    ...text,
    "</g>",
    "</svg>",
    "",
  ].join("\n");

  writeFileSync(join(outDir, `${name}.svg`), svg);
  writeFileSync(join(outDir, `${name}.txt`), `${lines.join("\n")}\n`);
}

async function writePngShots(): Promise<void> {
  const requirePng = process.env.CI || process.env.VUE_TUI_REQUIRE_CHART_PNG === "1";
  let chromium: typeof import("@playwright/test").chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch (error) {
    if (requirePng) throw error;
    console.warn("chart e2e png screenshots skipped: @playwright/test is unavailable");
    return;
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch();
  } catch (error) {
    if (requirePng) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      [
        "chart e2e png screenshots skipped: Playwright Chromium is unavailable.",
        "SVG and TXT screenshots were still generated.",
        "Install Chromium with: pnpm exec playwright install chromium",
        message.split("\n")[0],
      ].join("\n"),
    );
    return;
  }

  try {
    const page = await browser.newPage();
    const svgFiles = readdirSync(outDir)
      .filter((name) => name.endsWith(".svg"))
      .sort();

    for (const file of svgFiles) {
      const svg = readFileSync(join(outDir, file), "utf8");
      await page.setContent(
        `<style>html,body{margin:0;background:#262b33;width:max-content;height:max-content}</style>${svg}`,
      );
      const box = await page.locator("svg").boundingBox();
      assert.ok(box, `expected ${file} to render an svg`);
      await page.setViewportSize({
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      });
      await page.screenshot({
        path: join(outDir, file.replace(/\.svg$/u, ".png")),
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
  }
}

async function mount(component: Component, cols: number, rows: number) {
  const app = createTerminalApp({
    cols,
    rows,
    component,
    defaultStyle: { fg: "whiteBright" },
    selection: true,
  });
  app.mount();
  await nextTick();
  app.scheduler.flushNow();
  return app;
}

async function settle(app: Awaited<ReturnType<typeof mount>>): Promise<void> {
  await nextTick();
  app.scheduler.flushNow();
}

function snapshotText(terminal: Terminal): string {
  return terminal.snapshot().lines.join("\n");
}

function assertContains(text: string, needle: string, label: string): void {
  assert.ok(text.includes(needle), `${label} must contain ${needle}`);
}

async function captureStaticCharts(): Promise<void> {
  const scenarios: Array<{ name: string; cols: number; rows: number; component: Component }> = [
    {
      name: "01-contribution",
      cols: 42,
      rows: 8,
      component: defineComponent({
        setup: () => () =>
          h(TContributionGraph, {
            x: 0,
            y: 0,
            w: 42,
            values: contributionValues,
            labels: contributionLabels,
            unit: "tokens",
            rows: 7,
            columns: 18,
            max: 32,
          }),
      }),
    },
    {
      name: "03-line",
      cols: 56,
      rows: 10,
      component: defineComponent({
        setup: () => () =>
          h(TLineChart, {
            x: 0,
            y: 0,
            w: 56,
            h: 10,
            values: lineValues,
            labels: lineLabels,
            unit: "tokens",
            yLabel: "tokens",
            startLabel: "turn 1",
            endLabel: "turn 17",
          }),
      }),
    },
    {
      name: "04-candlestick",
      cols: 32,
      rows: 10,
      component: defineComponent({
        setup: () => () =>
          h(TCandlestickChart, {
            x: 0,
            y: 0,
            w: 32,
            h: 10,
            candles,
            labels: candleLabels,
            yLabel: "price",
            startLabel: "open",
            endLabel: "latest",
          }),
      }),
    },
    {
      name: "05-pie-wide",
      cols: 36,
      rows: 10,
      component: defineComponent({
        setup: () => () =>
          h(TPieChart, {
            x: 0,
            y: 0,
            w: 36,
            h: 10,
            values: pieValues,
            labels: pieLabels,
          }),
      }),
    },
    {
      name: "06-pie-narrow",
      cols: 20,
      rows: 10,
      component: defineComponent({
        setup: () => () =>
          h(TPieChart, {
            x: 0,
            y: 0,
            w: 20,
            h: 10,
            values: pieValues,
            labels: pieLabels,
          }),
      }),
    },
  ];

  for (const scenario of scenarios) {
    const app = await mount(scenario.component, scenario.cols, scenario.rows);
    try {
      const text = snapshotText(app.terminal);
      if (scenario.name.includes("line")) {
        assertContains(text, "tokens", scenario.name);
        assertContains(text, "turn 17", scenario.name);
      }
      if (scenario.name.includes("candlestick")) {
        assertContains(text, "price", scenario.name);
        assertContains(text, "latest", scenario.name);
      }
      if (scenario.name.includes("pie")) {
        assertContains(text, "prompt 52 52%", scenario.name);
        assertContains(text, "output 31 31%", scenario.name);
        assertContains(text, "cache 17 17%", scenario.name);
      }
      if (scenario.name === "06-pie-narrow") {
        assert.ok(
          !app.terminal.snapshot().lines[0]?.includes("prompt"),
          "narrow pie uses bottom legend",
        );
        assert.ok(
          (app.terminal.snapshot().lines[2]?.slice(0, 20).trim().length ?? 0) > 8,
          "narrow pie body must remain readable",
        );
      }
      writeTerminalShot(scenario.name, app.terminal);
    } finally {
      app.dispose();
    }
  }
}

async function captureContributionHover(): Promise<void> {
  const app = await mount(
    defineComponent({
      setup: () => () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          w: 42,
          h: 8,
          values: contributionValues,
          labels: contributionLabels,
          unit: "tokens",
          rows: 7,
          columns: 18,
          max: 32,
        }),
    }),
    42,
    8,
  );

  try {
    app.events.dispatch({ type: "pointermove", cellX: 20, cellY: 4, time: Date.now() } as any);
    await settle(app);
    const text = snapshotText(app.terminal);
    assertContains(text, "turn 75", "contribution hover");
    assertContains(text, "tokens", "contribution hover");
    assert.notEqual(app.terminal.getCell(20, 4).style.inverse, true);
    writeTerminalShot("02-contribution-hover", app.terminal);
  } finally {
    app.dispose();
  }
}

async function captureLineHover(): Promise<void> {
  const app = await mount(
    defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 56,
          h: 10,
          values: lineValues,
          labels: lineLabels,
          unit: "tokens",
          yLabel: "tokens",
          startLabel: "turn 1",
          endLabel: "turn 17",
        }),
    }),
    56,
    10,
  );

  try {
    app.events.dispatch({ type: "pointermove", cellX: 28, cellY: 4, time: Date.now() } as any);
    await settle(app);
    const text = snapshotText(app.terminal);
    assertContains(text, "turn 9 x=9 y=62 tokens", "line hover");
    assert.equal(app.terminal.getCell(30, 4).style.fg, "whiteBright");
    assert.equal(app.terminal.getCell(30, 4).style.bold, true);
    writeTerminalShot("03b-line-hover", app.terminal);
  } finally {
    app.dispose();
  }
}

async function captureCandlestickHover(): Promise<void> {
  const app = await mount(
    defineComponent({
      setup: () => () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 42,
          h: 10,
          candles,
          labels: candleLabels,
          yLabel: "price",
          startLabel: "open",
          endLabel: "latest",
        }),
    }),
    42,
    10,
  );

  try {
    app.events.dispatch({ type: "pointermove", cellX: 11, cellY: 3, time: Date.now() } as any);
    await settle(app);
    const text = snapshotText(app.terminal);
    assertContains(text, "session 9", "candlestick hover");
    assertContains(text, "x=9", "candlestick hover");
    assertContains(text, "O:57 H:74 L:55 C:71", "candlestick hover");
    assert.notEqual(app.terminal.getCell(11, 3).style.inverse, true);
    writeTerminalShot("04b-candlestick-hover", app.terminal);
  } finally {
    app.dispose();
  }
}

const ResponsiveDashboard = defineComponent({
  name: "ChartE2EResponsiveDashboard",
  setup() {
    const layout = useLayout();
    const cols = computed(() => layout.clipRect?.w ?? 72);
    const rows = computed(() => layout.clipRect?.h ?? 24);
    const innerW = computed(() => Math.max(1, cols.value - 4));
    const leftW = computed(() => Math.max(28, Math.floor(innerW.value * 0.58)));
    const rightW = computed(() => Math.max(10, innerW.value - leftW.value - 2));
    const lowerY = computed(() => Math.min(12, Math.max(10, rows.value - 9)));
    const lowerH = computed(() => Math.max(6, rows.value - lowerY.value - 3));
    const summaryText = computed(() =>
      cols.value < 56
        ? "Agent tokens, trend, candles, mix."
        : "Agent token usage, trend, candles, and token mix.",
    );
    const contributionTitle = computed(() =>
      leftW.value < 36 ? "Contrib: tokens/turn" : "ContributionGraph: tokens per turn",
    );
    const candleTitle = computed(() => (rightW.value < 14 ? "OHLC" : "Candles"));

    return () =>
      h(
        TBox,
        {
          x: 0,
          y: 0,
          w: cols.value,
          h: rows.value,
          border: true,
          title: "Charts Dashboard",
          padding: 1,
          style: { fg: "whiteBright" },
        },
        {
          default: () => [
            h(TText, {
              x: 0,
              y: 0,
              w: innerW.value,
              value: summaryText.value,
              style: { fg: "cyanBright", bold: true },
            }),
            h(TText, { x: 0, y: 2, w: leftW.value, value: contributionTitle.value }),
            h(TContributionGraph, {
              x: 0,
              y: 3,
              w: leftW.value,
              values: contributionValues,
              labels: contributionLabels,
              unit: "tokens",
              rows: 7,
              columns: 18,
              max: 32,
            }),
            h(TText, { x: leftW.value + 2, y: 2, w: rightW.value, value: "Token mix" }),
            h(TPieChart, {
              x: leftW.value + 2,
              y: 3,
              w: Math.min(20, rightW.value),
              h: 8,
              values: pieValues,
              labels: pieLabels,
            }),
            h(
              TBox,
              {
                x: 0,
                y: lowerY.value,
                w: leftW.value,
                h: lowerH.value,
                border: true,
                title: "Line",
                padding: 1,
              },
              {
                default: () =>
                  h(TLineChart, {
                    x: 0,
                    y: 0,
                    w: Math.max(1, leftW.value - 4),
                    h: Math.max(1, lowerH.value - 4),
                    values: lineValues,
                    labels: lineLabels,
                    unit: "tokens",
                    yLabel: "tokens",
                    startLabel: "turn 1",
                    endLabel: "turn 17",
                  }),
              },
            ),
            h(
              TBox,
              {
                x: leftW.value + 2,
                y: lowerY.value,
                w: rightW.value,
                h: lowerH.value,
                border: true,
                title: candleTitle.value,
                padding: 1,
              },
              {
                default: () =>
                  h(TCandlestickChart, {
                    x: 0,
                    y: 0,
                    w: Math.max(1, rightW.value - 4),
                    h: Math.max(1, lowerH.value - 4),
                    candles,
                    labels: candleLabels,
                    yLabel: "price",
                    startLabel: "open",
                    endLabel: "latest",
                  }),
              },
            ),
          ],
        },
      );
  },
});

async function captureResize(): Promise<void> {
  const app = await mount(ResponsiveDashboard, 72, 24);
  try {
    writeTerminalShot("07-dashboard-72x24", app.terminal);
    assertContains(snapshotText(app.terminal), "Charts Dashboard", "dashboard initial");
    assertContains(snapshotText(app.terminal), "Token mix", "dashboard initial");

    app.terminal.resize(44, 18);
    await settle(app);
    const narrow = snapshotText(app.terminal);
    assertContains(narrow, "Charts Dashboard", "dashboard resize");
    assertContains(narrow, "Token mix", "dashboard resize");
    assert.ok(!narrow.includes("undefined"), "dashboard resize must not render undefined text");
    writeTerminalShot("08-dashboard-44x18", app.terminal);
  } finally {
    app.dispose();
  }
}

async function measurePerformance(): Promise<Record<string, number>> {
  const values = ref(Array.from({ length: 120_000 }, (_, index) => index % 37));
  let contributionFrame = values.value;
  const contributionFrames = Array.from({ length: 50 }, () => {
    const next = contributionFrame.slice();
    next[119_999] = ((next[119_999] ?? 0) + 1) % 40;
    contributionFrame = next;
    return next;
  });
  const PerfChart = defineComponent({
    setup: () => () =>
      h(TContributionGraph, {
        x: 0,
        y: 0,
        values: values.value,
        rows: 7,
        columns: 40,
        max: 40,
        showTooltip: false,
      }),
  });
  const app = await mount(PerfChart, 96, 12);
  const dirtyRowCounts: number[] = [];
  const off = app.terminal.on("commit", ({ dirtyRows }) => {
    if (dirtyRows) dirtyRowCounts.push(dirtyRows.length);
  });

  try {
    const frameDurations: number[] = [];
    for (const nextValues of contributionFrames) {
      const start = performance.now();
      values.value = nextValues;
      await settle(app);
      frameDurations.push(performance.now() - start);
    }
    const totalMs = frameDurations.reduce((sum, value) => sum + value, 0);
    const avgMs = totalMs / frameDurations.length;
    const maxMs = Math.max(...frameDurations);
    assert.ok(
      dirtyRowCounts.length > 0 && dirtyRowCounts.every((count) => count <= 7),
      "contribution updates must stay within chart dirty rows",
    );
    return {
      frames: frameDurations.length,
      totalMs: Number(totalMs.toFixed(2)),
      avgMs: Number(avgMs.toFixed(2)),
      maxMs: Number(maxMs.toFixed(2)),
      maxDirtyRows: Math.max(...dirtyRowCounts),
      ...(await measureLinePerformance()),
    };
  } finally {
    off();
    app.dispose();
  }
}

async function measureLinePerformance(): Promise<Record<string, number>> {
  const values = ref(Array.from({ length: 120_000 }, (_, index) => index % 97));
  let lineFrame = values.value;
  const lineFrames = Array.from({ length: 20 }, () => {
    const next = lineFrame.slice();
    next[119_999] = ((next[119_999] ?? 0) + 1) % 97;
    lineFrame = next;
    return next;
  });
  const PerfLineChart = defineComponent({
    setup: () => () =>
      h(TLineChart, {
        x: 0,
        y: 0,
        w: 96,
        h: 7,
        values: values.value,
        showAxes: false,
      }),
  });
  const app = createTerminalApp({
    cols: 110,
    rows: 10,
    component: PerfLineChart,
    defaultStyle: { fg: "whiteBright" },
  });
  app.mount();
  await settle(app);
  const dirtyRowCounts: number[] = [];
  const off = app.terminal.on("commit", ({ dirtyRows }) => {
    if (dirtyRows) dirtyRowCounts.push(dirtyRows.length);
  });

  try {
    const frameDurations: number[] = [];
    for (const nextValues of lineFrames) {
      const start = performance.now();
      values.value = nextValues;
      await settle(app);
      frameDurations.push(performance.now() - start);
    }
    const totalMs = frameDurations.reduce((sum, value) => sum + value, 0);
    const avgMs = totalMs / frameDurations.length;
    const maxMs = Math.max(...frameDurations);
    assert.ok(
      dirtyRowCounts.length > 0 && dirtyRowCounts.every((count) => count <= 7),
      "line updates must stay within chart dirty rows",
    );
    const maxDirtyRows = Math.max(...dirtyRowCounts);
    app.terminal.commit();
    dirtyRowCounts.length = 0;

    const beforeHoverCommits = dirtyRowCounts.length;
    app.events.dispatch({ type: "pointermove", cellX: 48, cellY: 3, time: 1_000 } as any);
    await settle(app);
    assert.ok(dirtyRowCounts.length > beforeHoverCommits, "line hover must repaint once");
    const afterFirstHover = dirtyRowCounts.length;
    app.events.dispatch({ type: "pointermove", cellX: 48, cellY: 3, time: 1_001 } as any);
    await settle(app);
    assert.equal(dirtyRowCounts.length, afterFirstHover, "same-cell line hover must not repaint");

    return {
      lineFrames: frameDurations.length,
      lineTotalMs: Number(totalMs.toFixed(2)),
      lineAvgMs: Number(avgMs.toFixed(2)),
      lineMaxMs: Number(maxMs.toFixed(2)),
      lineMaxDirtyRows: maxDirtyRows,
    };
  } finally {
    off();
    app.dispose();
  }
}

async function main(): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  await captureStaticCharts();
  await captureContributionHover();
  await captureLineHover();
  await captureCandlestickHover();
  await captureResize();
  const perf = await measurePerformance();
  await writePngShots();
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify({ outDir, perf }, null, 2)}\n`);
  console.log(`chart e2e screenshots: ${outDir}`);
  console.log(
    `chart perf: avg=${perf.avgMs}ms max=${perf.maxMs}ms dirtyRows<=${perf.maxDirtyRows}`,
  );
  console.log(
    `line chart perf: avg=${perf.lineAvgMs}ms max=${perf.lineMaxMs}ms dirtyRows<=${perf.lineMaxDirtyRows}`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
