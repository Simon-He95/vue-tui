import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  enableInstrumentation,
  disableInstrumentation,
  resetMetrics,
  getMetrics,
  isInstrumentationEnabled,
} from "../src/core/perf/instrumentation.js";
import { createTerminal } from "../src/core/index.js";
import { textCellWidth } from "../src/vue/utils/text.js";

describe("Performance Instrumentation", () => {
  beforeEach(() => {
    disableInstrumentation();
    resetMetrics();
  });

  afterEach(() => {
    disableInstrumentation();
  });

  it("keeps metrics at zero when disabled", () => {
    resetMetrics();
    disableInstrumentation();

    const terminal = createTerminal({ cols: 10, rows: 1 });
    terminal.write("abc中", { x: 0, y: 0 });

    const metrics = getMetrics();
    expect(metrics.cell.createCellCalls).toBe(0);
    expect(metrics.cell.newCellCount).toBe(0);
    expect(metrics.cell.cellCacheHitWidth1).toBe(0);
    expect(metrics.cell.cellCacheHitWidth2).toBe(0);
  });

  it("records metrics only when enabled", () => {
    resetMetrics();
    enableInstrumentation();

    try {
      const terminal = createTerminal({ cols: 10, rows: 1 });
      terminal.write("abc中", { x: 0, y: 0 });

      const metrics = getMetrics();
      expect(metrics.cell.createCellCalls).toBeGreaterThan(0);
      expect(isInstrumentationEnabled()).toBe(true);
    } finally {
      disableInstrumentation();
    }
  });

  it("stops recording after disable", () => {
    resetMetrics();
    enableInstrumentation();

    const terminal = createTerminal({ cols: 10, rows: 1 });
    terminal.write("abc", { x: 0, y: 0 });

    const countAfterEnable = getMetrics().cell.createCellCalls;
    expect(countAfterEnable).toBeGreaterThan(0);

    disableInstrumentation();

    terminal.write("def", { x: 0, y: 0 });
    const countAfterDisable = getMetrics().cell.createCellCalls;

    expect(countAfterDisable).toBe(countAfterEnable);
    expect(isInstrumentationEnabled()).toBe(false);
  });

  it("tracks text cache metrics when enabled", () => {
    resetMetrics();
    enableInstrumentation();

    try {
      // First call - cache miss
      textCellWidth("测试");
      let metrics = getMetrics();
      expect(metrics.text.textCellWidthCalls).toBe(1);
      expect(metrics.text.textWidthCacheMiss).toBe(1);

      // Second call - cache hit
      textCellWidth("测试");
      metrics = getMetrics();
      expect(metrics.text.textCellWidthCalls).toBe(2);
      expect(metrics.text.textWidthCacheHit).toBe(1);
    } finally {
      disableInstrumentation();
    }
  });

  it("tracks ASCII vs non-ASCII", () => {
    resetMetrics();
    enableInstrumentation();

    try {
      textCellWidth("abc");
      textCellWidth("中文");

      const metrics = getMetrics();
      expect(metrics.text.asciiCount).toBe(1);
      expect(metrics.text.nonAsciiCount).toBe(1);
    } finally {
      disableInstrumentation();
    }
  });

  it("resets all metrics to zero", () => {
    enableInstrumentation();

    try {
      const terminal = createTerminal({ cols: 10, rows: 1 });
      terminal.write("test", { x: 0, y: 0 });

      let metrics = getMetrics();
      expect(metrics.cell.createCellCalls).toBeGreaterThan(0);

      resetMetrics();

      metrics = getMetrics();
      expect(metrics.cell.createCellCalls).toBe(0);
      expect(metrics.cell.newCellCount).toBe(0);
      expect(metrics.text.textCellWidthCalls).toBe(0);
    } finally {
      disableInstrumentation();
    }
  });
});
