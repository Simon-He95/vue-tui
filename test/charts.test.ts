import { describe, expect, it } from "vitest";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  ref,
  TBox,
} from "./ui-regressions-support.js";
import {
  TCandlestickChart,
  TContributionGraph,
  TLineChart,
  TPieChart,
} from "../src/experimental.js";

describe("terminal charts", () => {
  it("renders contribution values column-major with level styles", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          values: [0, 1, 2, 4],
          rows: 2,
          gap: 1,
          max: 4,
          emptyStyle: { fg: "blackBright" },
          levelStyles: [{ fg: "green" }, { fg: "greenBright" }, { fg: "yellow" }, { fg: "red" }],
        }),
      8,
      3,
    );

    expect(mounted.terminal.snapshot().lines[0]?.slice(0, 3)).toBe("■ ■");
    expect(mounted.terminal.snapshot().lines[1]?.slice(0, 3)).toBe("■ ■");
    expect(mounted.terminal.getCell(0, 0).style.fg).toBe("blackBright");
    expect(mounted.terminal.getCell(0, 1).style.fg).toBe("green");
    expect(mounted.terminal.getCell(2, 0).style.fg).toBe("greenBright");
    expect(mounted.terminal.getCell(2, 1).style.fg).toBe("red");

    mounted.unmount();
  });

  it("preserves contribution row alignment when truncating a partial final column", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          values: Array.from({ length: 10 }, () => 1),
          rows: 7,
          columns: 1,
          max: 1,
          showTooltip: false,
          emptyStyle: { fg: "blackBright" },
          levelStyles: [{ fg: "green" }],
        }),
      4,
      8,
    );

    for (let y = 0; y < 3; y++) expect(mounted.terminal.getCell(0, y).style.fg).toBe("green");
    for (let y = 3; y < 7; y++) expect(mounted.terminal.getCell(0, y).style.fg).toBe("blackBright");

    mounted.unmount();
  });

  it("renders a sampled line chart across the requested width", async () => {
    const mounted = await mountTerminal(
      () => h(TLineChart, { x: 0, y: 0, w: 5, h: 3, values: [0, 1, 0] }),
      8,
      4,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 5)).toBe("  ╭╮ ");
    expect(lines[1]?.slice(0, 5)).toBe(" ╭╯╰╮");
    expect(lines[2]?.slice(0, 5)).toBe("●╯  ╰");
    expect(mounted.terminal.getCell(2, 0).style.fg).toBe("cyanBright");

    mounted.unmount();
  });

  it("renders a single finite line point at its original x position", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 5,
          h: 3,
          values: [Number.NaN, 1, Number.NaN],
          showAxes: false,
        }),
      8,
      4,
    );

    expect(mounted.terminal.getCell(2, 1).ch).toBe("●");
    expect(mounted.terminal.getCell(0, 1).ch).toBe(" ");

    mounted.unmount();
  });

  it("does not connect line segments across non-finite samples", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 5,
          h: 3,
          values: [0, Number.NaN, 10],
          showAxes: false,
        }),
      8,
      4,
    );

    expect(mounted.terminal.getCell(0, 2).ch).toBe("●");
    expect(mounted.terminal.getCell(2, 1).ch).toBe(" ");
    expect(mounted.terminal.getCell(4, 0).ch).toBe("●");

    mounted.unmount();
  });

  it("renders line axes and labels when there is enough space", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 18,
          h: 6,
          values: [0, 10],
          yLabel: "tok",
          xLabel: "turn",
        }),
      22,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 5)).toBe("10│to");
    expect(mounted.terminal.getCell(2, 4).ch).toBe("└");
    expect(lines[5]).toContain("turn");

    mounted.unmount();
  });

  it("keeps an explicit line min when it is above all data values", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 18,
          h: 6,
          values: [0, 10],
          min: 20,
        }),
      22,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 3)).toBe("20│");
    expect(lines[3]?.slice(0, 3)).toBe("20│");
    expect(mounted.terminal.getCell(3, 3).ch).toBe("●");

    mounted.unmount();
  });

  it("keeps an explicit candlestick max when it is below all data values", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 18,
          h: 6,
          max: -5,
          candles: [
            { open: 0, high: 10, low: 0, close: 10 },
            { open: 2, high: 8, low: 2, close: 6 },
          ],
        }),
      22,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 3)).toBe("-5│");
    expect(lines[3]?.slice(0, 3)).toBe("-5│");

    mounted.unmount();
  });

  it("applies lineStyle only to plotted glyphs", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 5,
          h: 3,
          values: [0, 1, 0],
          style: { bg: "black" },
          lineStyle: { fg: "redBright" },
        }),
      8,
      4,
    );

    expect(mounted.terminal.getCell(2, 0).style).toMatchObject({ fg: "redBright", bg: "black" });
    expect(mounted.terminal.getCell(0, 0).style).toMatchObject({ bg: "black" });
    expect(mounted.terminal.getCell(0, 0).style.fg).toBeUndefined();

    mounted.unmount();
  });

  it("renders candlestick bodies and wick styles", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 2,
          h: 4,
          min: 0,
          max: 3,
          candles: [
            { open: 1, high: 3, low: 0, close: 2 },
            { open: 2, high: 3, low: 0, close: 1 },
          ],
        }),
      6,
      5,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 2)).toBe("││");
    expect(lines[1]?.slice(0, 2)).toBe("██");
    expect(lines[2]?.slice(0, 2)).toBe("██");
    expect(lines[3]?.slice(0, 2)).toBe("││");
    expect(mounted.terminal.getCell(0, 1).style.fg).toBe("greenBright");
    expect(mounted.terminal.getCell(1, 1).style.fg).toBe("redBright");

    mounted.unmount();
  });

  it("overlays partial candlestick wickStyle without dropping direction color", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 1,
          h: 4,
          min: 0,
          max: 3,
          candles: [{ open: 1, high: 3, low: 0, close: 2 }],
          wickStyle: { dim: true },
        }),
      4,
      5,
    );

    expect(mounted.terminal.getCell(0, 0).style).toMatchObject({
      fg: "greenBright",
      dim: true,
    });
    expect(mounted.terminal.getCell(0, 1).style).toMatchObject({
      fg: "greenBright",
    });

    mounted.unmount();
  });

  it("renders candlestick axes and endpoint labels when there is enough space", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 18,
          h: 6,
          min: 0,
          max: 10,
          yLabel: "px",
          startLabel: "open",
          endLabel: "latest",
          candles: [
            { open: 2, high: 8, low: 1, close: 7 },
            { open: 7, high: 9, low: 4, close: 5 },
          ],
        }),
      24,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]?.slice(0, 5)).toBe("10│px");
    expect(mounted.terminal.getCell(2, 4).ch).toBe("└");
    expect(lines[5]).toContain("open");
    expect(lines[5]).toContain("latest");

    mounted.unmount();
  });

  it("renders pie segments by angle", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TPieChart, {
          x: 0,
          y: 0,
          w: 5,
          h: 3,
          values: [1, 1],
          segmentStyles: [{ fg: "cyan" }, { fg: "magenta" }],
        }),
      8,
      4,
    );

    expect(mounted.terminal.getCell(4, 1).ch).toBe("█");
    expect(mounted.terminal.getCell(4, 1).style.fg).toBe("cyan");
    expect(mounted.terminal.getCell(0, 1).ch).toBe("█");
    expect(mounted.terminal.getCell(0, 1).style.fg).toBe("magenta");

    mounted.unmount();
  });

  it("renders pie legend labels, values, and percentages", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TPieChart, {
          x: 0,
          y: 0,
          w: 24,
          h: 6,
          values: [2, 1],
          labels: ["prompt", "output"],
          segmentStyles: [{ fg: "cyan" }, { fg: "magenta" }],
        }),
      28,
      7,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]).toContain("prompt 2 67%");
    expect(lines[1]).toContain("output 1 33%");

    mounted.unmount();
  });

  it("moves the pie legend below when a right legend would squeeze the chart", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TPieChart, {
          x: 0,
          y: 0,
          w: 20,
          h: 10,
          values: [52, 31, 17],
          labels: ["prompt", "output", "cache"],
          segmentStyles: [{ fg: "cyan" }, { fg: "magenta" }, { fg: "yellow" }],
        }),
      24,
      11,
    );

    const lines = mounted.terminal.snapshot().lines;
    expect(lines[0]).not.toContain("prompt");
    expect(lines[2]?.slice(0, 20).trim().length).toBeGreaterThan(8);
    expect(lines[7]).toContain("prompt 52 52%");
    expect(lines[8]).toContain("output 31 31%");
    expect(lines[9]).toContain("cache 17 17%");

    mounted.unmount();
  });

  it("keeps pie labels as grapheme clusters", async () => {
    const label = "e\u0301";
    const mounted = await mountTerminal(
      () =>
        h(TPieChart, {
          x: 0,
          y: 0,
          w: 24,
          h: 6,
          values: [1],
          labels: [label],
        }),
      28,
      7,
    );

    expect(mounted.terminal.snapshot().lines.join("\n")).toContain(`${label} 1 100%`);

    mounted.unmount();
  });

  it("ignores non-finite pie values", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TPieChart, {
          x: 0,
          y: 0,
          w: 24,
          h: 6,
          values: [Number.POSITIVE_INFINITY, 1],
          labels: ["bad", "good"],
        }),
      28,
      7,
    );

    const text = mounted.terminal.snapshot().lines.join("\n");
    expect(text).toContain("good 1 100%");
    expect(text).not.toContain("NaN%");
    expect(text).not.toContain("bad");

    mounted.unmount();
  });

  it("shows contribution hover tooltip with label, value, and unit", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          w: 20,
          values: [0, 5, 10, 15],
          labels: ["Mon", "Tue", "Wed", "Thu"],
          unit: "tokens",
          rows: 2,
          max: 15,
        }),
      24,
      5,
    );

    const container = mounted.container();
    const events = mounted.events();
    if (!container || !events) throw new Error("expected mounted terminal events");
    const cellWidth = 10;
    const cellHeight = 20;
    events.setMetrics({ cellWidth, cellHeight });
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        x: 0,
        y: 0,
        width: 24 * cellWidth,
        height: 5 * cellHeight,
        right: 24 * cellWidth,
        bottom: 5 * cellHeight,
        toJSON() {},
      }) as any;

    container.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: 2 * cellWidth + 1,
        clientY: 1 * cellHeight + 1,
        bubbles: true,
      }),
    );
    await nextTick();
    mounted.scheduler()?.flush();

    expect(mounted.terminal.snapshot().lines[2]).toContain("Thu 15 tokens");
    expect(mounted.terminal.getCell(2, 1).style.inverse).not.toBe(true);

    container.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: 1 * cellWidth + 1,
        clientY: 1 * cellHeight + 1,
        bubbles: true,
      }),
    );
    await nextTick();
    mounted.scheduler()?.flush();
    expect(mounted.terminal.snapshot().lines[2]).not.toContain("tokens");

    mounted.unmount();
  });

  it("shows contribution hover tooltip through the terminal event manager", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          w: 20,
          values: [0, 5, 10, 15],
          labels: ["Mon", "Tue", "Wed", "Thu"],
          unit: "tokens",
          rows: 2,
          max: 15,
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 5, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 2, cellY: 1, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.snapshot().lines[2]).toContain("Thu 15 tokens");
      expect(app.terminal.getCell(2, 1).style.inverse).not.toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("recomputes contribution hover from current values after data changes", async () => {
    const values = ref([0, 5, 10, 15]);
    const labels = ref(["Mon", "Tue", "Wed", "Thu"]);
    const App = defineComponent({
      setup: () => () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          w: 20,
          values: values.value,
          labels: labels.value,
          unit: "tokens",
          rows: 2,
          max: 30,
        }),
    });
    const app = createTerminalApp({ cols: 24, rows: 5, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 2, cellY: 1, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(app.terminal.snapshot().lines.join("\n")).toContain("Thu 15 tokens");

      values.value = [0, 5, 10, 25];
      labels.value = ["Mon", "Tue", "Wed", "Fri"];
      await nextTick();
      app.scheduler.flushNow();

      const text = app.terminal.snapshot().lines.join("\n");
      expect(text).toContain("Fri 25 tokens");
      expect(text).not.toContain("Thu 15 tokens");
    } finally {
      app.dispose();
    }
  });

  it("shows line hover tooltip with x and y data through the terminal event manager", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 30,
          h: 5,
          values: [10, 20, 15],
          labels: ["turn 1", "turn 2", "turn 3"],
          unit: "tokens",
          showAxes: false,
        }),
    });
    const app = createTerminalApp({ cols: 34, rows: 7, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 15, cellY: 2, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      const text = app.terminal.snapshot().lines.join("\n");
      expect(text).toContain("turn 2 x=2 y=20 tokens");
      expect(app.terminal.getCell(15, 0).style).toMatchObject({
        fg: "whiteBright",
        bold: true,
      });
    } finally {
      app.dispose();
    }
  });

  it("keeps line hover labels aligned with original indices when values are non-finite", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 30,
          h: 5,
          values: [1, Number.NaN, 3],
          labels: ["a", "missing", "c"],
          showAxes: false,
        }),
    });
    const app = createTerminalApp({ cols: 34, rows: 7, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 29, cellY: 0, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      const text = app.terminal.snapshot().lines.join("\n");
      expect(text).toContain("c x=3 y=3");
      expect(text).not.toContain("missing");
    } finally {
      app.dispose();
    }
  });

  it("does not show line hover tooltip in non-finite leading or trailing blank regions", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 30,
          h: 5,
          values: [Number.NaN, 1, Number.NaN],
          labels: ["left", "middle", "right"],
          showAxes: false,
        }),
    });
    const app = createTerminalApp({ cols: 34, rows: 7, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 0, cellY: 2, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(app.terminal.snapshot().lines.join("\n")).not.toContain("middle");

      app.events.dispatch({ type: "pointermove", cellX: 15, cellY: 2, time: 1_001 } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(app.terminal.snapshot().lines.join("\n")).toContain("middle x=2 y=1");

      app.events.dispatch({ type: "pointermove", cellX: 29, cellY: 2, time: 1_002 } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(app.terminal.snapshot().lines.join("\n")).not.toContain("middle");
    } finally {
      app.dispose();
    }
  });

  it("places line hover tooltip away from plotted glyphs when a clear row is available", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 36,
          h: 8,
          values: [12, 18, 16, 24, 31, 29, 42, 49],
          labels: ["turn 1", "turn 2", "turn 3", "turn 4", "turn 5", "turn 6", "turn 7", "turn 8"],
          unit: "tokens",
          yLabel: "tokens",
          startLabel: "turn 1",
          endLabel: "turn 8",
        }),
    });
    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      const before = app.terminal.snapshot().lines.map((line) => line.slice(0, 36));
      app.events.dispatch({ type: "pointermove", cellX: 18, cellY: 3, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      const after = app.terminal.snapshot().lines.map((line) => line.slice(0, 36));
      const tooltipRow = after.findIndex((line) => line.includes("turn 4 x=4 y=24 tokens"));
      expect(tooltipRow).toBeGreaterThanOrEqual(0);
      for (let y = 0; y < before.length; y++) {
        if (y === tooltipRow) continue;
        for (let x = 0; x < before[y]!.length; x++) {
          if ("●─│╭╮╯╰".includes(before[y]![x]!)) {
            expect("●─│╭╮╯╰".includes(after[y]![x]!)).toBe(true);
          }
        }
      }
    } finally {
      app.dispose();
    }
  });

  it("shows candlestick hover tooltip with y value and OHLC data", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TCandlestickChart, {
          x: 0,
          y: 0,
          w: 30,
          h: 7,
          min: 0,
          max: 10,
          labels: ["Mon", "Tue"],
          candles: [
            { open: 2, high: 8, low: 1, close: 7 },
            { open: 7, high: 9, low: 4, close: 5 },
          ],
        }),
    });
    const app = createTerminalApp({ cols: 34, rows: 8, component: App as any });
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "pointermove", cellX: 4, cellY: 2, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();

      const text = app.terminal.snapshot().lines.join("\n");
      expect(text).toContain("Tue x=2 y=5 O:7 H:9 L:4 C:5");
      expect(app.terminal.getCell(4, 2).style.inverse).not.toBe(true);

      app.events.dispatch({ type: "pointermove", cellX: 20, cellY: 2, time: 1_001 } as any);
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.snapshot().lines.join("\n")).not.toContain("Tue x=2");
    } finally {
      app.dispose();
    }
  });

  it("keeps chart tooltips inside the visible clipped viewport", async () => {
    const ContributionApp = defineComponent({
      setup: () => () =>
        h(
          TBox,
          { x: 0, y: 0, w: 12, h: 3, border: false, padding: 0 },
          {
            default: () =>
              h(TContributionGraph, {
                x: 0,
                y: 0,
                w: 30,
                h: 3,
                values: Array.from({ length: 30 }, (_, index) => index),
                labels: Array.from({ length: 30 }, (_, index) => `d${index}`),
                rows: 1,
                gap: 0,
                max: 30,
                unit: "u",
              }),
          },
        ),
    });
    const contribution = createTerminalApp({
      cols: 16,
      rows: 4,
      component: ContributionApp as any,
    });
    try {
      contribution.mount();
      await nextTick();
      contribution.scheduler.flushNow();
      contribution.events.dispatch({
        type: "pointermove",
        cellX: 10,
        cellY: 0,
        time: 1_000,
      } as any);
      await nextTick();
      contribution.scheduler.flushNow();
      expect(contribution.terminal.snapshot().lines.join("\n")).toContain("d10 10 u");
    } finally {
      contribution.dispose();
    }

    const LineApp = defineComponent({
      setup: () => () =>
        h(
          TBox,
          { x: 0, y: 0, w: 12, h: 4, border: false, padding: 0, scrollX: 18 },
          {
            default: () =>
              h(TLineChart, {
                x: 0,
                y: 0,
                w: 30,
                h: 4,
                values: Array.from({ length: 30 }, (_, index) => index),
                labels: Array.from({ length: 30 }, (_, index) => `edge${index}`),
                showAxes: false,
              }),
          },
        ),
    });
    const line = createTerminalApp({ cols: 16, rows: 5, component: LineApp as any });
    try {
      line.mount();
      await nextTick();
      line.scheduler.flushNow();
      line.events.dispatch({ type: "pointermove", cellX: 11, cellY: 0, time: 1_001 } as any);
      await nextTick();
      line.scheduler.flushNow();
      expect(line.terminal.snapshot().lines.join("\n")).toContain("edge29 x=30");
    } finally {
      line.dispose();
    }

    const CandleApp = defineComponent({
      setup: () => () =>
        h(
          TBox,
          { x: 0, y: 0, w: 12, h: 5, border: false, padding: 0, scrollX: 18 },
          {
            default: () =>
              h(TCandlestickChart, {
                x: 0,
                y: 0,
                w: 30,
                h: 5,
                min: 0,
                max: 30,
                showAxes: false,
                labels: Array.from({ length: 30 }, (_, index) => `c${index}`),
                candles: Array.from({ length: 30 }, (_, index) => ({
                  open: index,
                  high: index + 2,
                  low: index - 1,
                  close: index + 1,
                })),
              }),
          },
        ),
    });
    const candle = createTerminalApp({ cols: 16, rows: 6, component: CandleApp as any });
    try {
      candle.mount();
      await nextTick();
      candle.scheduler.flushNow();
      candle.events.dispatch({ type: "pointermove", cellX: 11, cellY: 1, time: 1_002 } as any);
      await nextTick();
      candle.scheduler.flushNow();
      expect(candle.terminal.snapshot().lines.join("\n")).toContain("c29 x=30");
    } finally {
      candle.dispose();
    }
  });

  it("does not write clipped wide chart text outside the visible rect", async () => {
    const mounted = await mountTerminal(
      () =>
        h(
          TBox,
          { x: 0, y: 0, w: 5, h: 5, border: false, padding: 0 },
          {
            default: () =>
              h(TLineChart, {
                x: 0,
                y: 0,
                w: 18,
                h: 5,
                values: [0, 10],
                startLabel: "A語",
              }),
          },
        ),
      8,
      6,
    );

    const outside = mounted.terminal.getCell(5, 4);
    expect(outside.ch).toBe(" ");
    expect(outside.continuation).not.toBe(true);

    mounted.unmount();
  });

  it("handles large line arrays without repainting repeated pointer cells", async () => {
    const App = defineComponent({
      setup: () => () =>
        h(TLineChart, {
          x: 0,
          y: 0,
          w: 160,
          h: 6,
          values: Array.from({ length: 120_000 }, (_, index) => index % 97),
          showAxes: false,
        }),
    });
    const app = createTerminalApp({ cols: 170, rows: 8, component: App as any });
    const commits: Array<readonly number[] | null> = [];
    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      app.terminal.commit();
      const off = app.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

      app.events.dispatch({ type: "pointermove", cellX: 80, cellY: 2, time: 1_000 } as any);
      await nextTick();
      app.scheduler.flushNow();
      const afterFirstHover = commits.length;
      expect(afterFirstHover).toBeGreaterThan(0);

      app.events.dispatch({ type: "pointermove", cellX: 80, cellY: 2, time: 1_001 } as any);
      await nextTick();
      app.scheduler.flushNow();
      expect(commits).toHaveLength(afterFirstHover);

      off();
    } finally {
      app.dispose();
    }
  });

  it("handles large contribution arrays and repaints only chart rows on update", async () => {
    const values = ref(Array.from({ length: 120_000 }, (_, index) => index % 23));
    const mounted = await mountTerminal(
      () =>
        h(TContributionGraph, {
          x: 0,
          y: 0,
          values: values.value,
          rows: 7,
          columns: 20,
          showTooltip: false,
        }),
      50,
      24,
    );
    mounted.scheduler()?.flush();
    mounted.terminal.commit();

    const commits: Array<readonly number[] | null> = [];
    const off = mounted.terminal.on("commit", ({ dirtyRows }) => commits.push(dirtyRows));

    values.value = values.value.map((value, index) =>
      index === values.value.length - 1 ? 30 : value,
    );
    await nextTick();
    mounted.scheduler()?.flush();

    const last = commits.at(-1);
    expect(last).not.toBeNull();
    const rows = last ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(7);
    expect(rows.every((row) => row >= 0 && row < 7)).toBe(true);

    off();
    mounted.unmount();
  });
});
