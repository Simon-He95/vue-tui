import assert from "node:assert/strict";
import { Window } from "happy-dom";
import type { DomRendererRowRenderStats } from "../src/renderer/dom/dom-renderer.js";
import type { Style } from "../src/core/types.js";
import { createDomRenderer, createTerminal } from "../src/index.js";

const ROWS = 100;
const COLS = 24;

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

const win = new Window();
setGlobal("window", win);
setGlobal("document", win.document);
setGlobal("navigator", win.navigator);
setGlobal("Node", win.Node);
setGlobal("Element", win.Element);
setGlobal("HTMLElement", win.HTMLElement);
setGlobal("HTMLSpanElement", win.HTMLSpanElement);
setGlobal("SVGElement", win.SVGElement);
setGlobal("DocumentFragment", win.DocumentFragment);
setGlobal("Text", win.Text);
setGlobal("Event", win.Event);
setGlobal("EventTarget", win.EventTarget);
setGlobal("CustomEvent", win.CustomEvent);
setGlobal("MouseEvent", win.MouseEvent);
setGlobal("KeyboardEvent", win.KeyboardEvent);
setGlobal("getComputedStyle", win.getComputedStyle.bind(win));
setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
  cb(performance.now());
  return 1;
});
setGlobal("cancelAnimationFrame", () => {});

type RowRenderSnapshot = Readonly<{
  lastFlush: DomRendererRowRenderStats;
  total: DomRendererRowRenderStats;
}>;

type RoundSnapshot = Readonly<{
  firstFlush: DomRendererRowRenderStats;
  secondFlush: DomRendererRowRenderStats;
  total: DomRendererRowRenderStats;
}>;

type Scenario = Readonly<{
  terminal: ReturnType<typeof createTerminal>;
  renderer: ReturnType<typeof createDomRenderer>;
  container: HTMLElement;
}>;

type PrepassOptions = Readonly<{
  enableRowKeyPrepass: boolean;
}>;

function createScenario(options: Parameters<typeof createDomRenderer>[2] = {}): Scenario {
  const terminal = createTerminal({ cols: COLS, rows: ROWS });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createDomRenderer(terminal, container, {
    syncFlushMaxRows: ROWS,
    syncFlushCellBudget: ROWS * COLS * 4,
    ...options,
  });
  return { terminal, renderer, container };
}

function disposeScenario(scenario: Scenario): void {
  scenario.renderer.dispose();
  scenario.terminal.dispose();
  scenario.container.remove();
}

function lastFlush(scenario: Scenario): DomRendererRowRenderStats {
  const stats = scenario.renderer.debugStats.rowRender.lastFlush;
  assert.ok(stats);
  return stats;
}

function snapshot(scenario: Scenario): RowRenderSnapshot {
  return {
    lastFlush: lastFlush(scenario),
    total: scenario.renderer.debugStats.rowRender.total,
  };
}

function commit(scenario: Scenario): DomRendererRowRenderStats {
  scenario.terminal.commit({ planes: ["default"], sync: true });
  return lastFlush(scenario);
}

function writePlainRows(scenario: Scenario, prefix: string): void {
  for (let y = 0; y < ROWS; y++) {
    scenario.terminal.fill(0, y, COLS, 1, " ");
    scenario.terminal.write(`${prefix}-${y}`, { x: 0, y });
  }
}

function writeSingleStyledRows(scenario: Scenario, ch: string, style: Style): void {
  for (let y = 0; y < ROWS; y++) scenario.terminal.fill(0, y, COLS, 1, ch, style);
}

function writeMultiSegmentRows(scenario: Scenario, left: string, right: string): void {
  const half = COLS / 2;
  for (let y = 0; y < ROWS; y++) {
    scenario.terminal.fill(0, y, half, 1, left, { fg: "red" });
    scenario.terminal.fill(half, y, COLS - half, 1, right, { fg: "blue" });
  }
}

function writeFallbackRows(scenario: Scenario): void {
  const hrefRows = ROWS / 2;
  for (let y = 0; y < hrefRows; y++) {
    scenario.terminal.fill(0, y, COLS, 1, "H", { href: `https://example.com/${y}` });
  }
  for (let y = hrefRows; y < ROWS; y++) {
    scenario.terminal.write("中", { x: 0, y, style: { fg: "red" } });
    scenario.terminal.fill(2, y, COLS - 2, 1, "W", { fg: "blue" });
  }
}

function runScenario<T>(
  fn: (scenario: Scenario) => T,
  options?: Parameters<typeof createDomRenderer>[2],
): T {
  const scenario = createScenario(options);
  try {
    return fn(scenario);
  } finally {
    disposeScenario(scenario);
  }
}

function runPrepassModes<T>(run: (enableRowKeyPrepass: boolean) => T): {
  default: T;
  prepass: T;
} {
  return {
    default: run(false),
    prepass: run(true),
  };
}

function benchPlainRows(): RowRenderSnapshot {
  return runScenario((scenario) => {
    writePlainRows(scenario, "line");
    const stats = commit(scenario);

    assert.ok(stats.plainTextRows > 0);
    assert.equal(stats.fragmentRows, 0);
    assert.equal(stats.spansCreated, 0);

    return snapshot(scenario);
  });
}

function benchChangedPlainRows(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writePlainRows(scenario, "plain-a");
    const firstFlush = commit(scenario);

    writePlainRows(scenario, "plain-b");
    const secondFlush = commit(scenario);

    assert.ok(secondFlush.plainTextRows > 0);
    assert.equal(secondFlush.cacheHits, 0);
    assert.equal(secondFlush.fragmentRows, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

function benchSingleStyledRows(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writeSingleStyledRows(scenario, "A", { fg: "red" });
    const firstFlush = commit(scenario);

    assert.ok(firstFlush.singleStyledRows > 0);
    assert.ok(firstFlush.spansCreated > 0);
    assert.equal(firstFlush.fragmentRows, 0);

    writeSingleStyledRows(scenario, "B", { fg: "red" });
    const secondFlush = commit(scenario);

    assert.ok(secondFlush.singleStyledRows > 0);
    assert.ok(secondFlush.spansReused > 0);
    assert.equal(secondFlush.fragmentRows, 0);
    assert.equal(secondFlush.replaceChildren, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

function benchChangedMultiSegmentRows(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writeMultiSegmentRows(scenario, "A", "B");
    const firstFlush = commit(scenario);

    assert.ok(firstFlush.fragmentRows > 0);
    assert.ok(firstFlush.spansCreated > 0);

    writeMultiSegmentRows(scenario, "C", "D");
    const secondFlush = commit(scenario);

    assert.equal(secondFlush.cacheHits, 0);
    assert.ok(secondFlush.segmentReuseRows > 0);
    assert.ok(secondFlush.spansReused > 0);
    assert.equal(secondFlush.fragmentRows, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

function benchFallbackRows(): RowRenderSnapshot {
  return runScenario((scenario) => {
    writeFallbackRows(scenario);
    const stats = commit(scenario);

    assert.ok(stats.fragmentRows > 0);
    assert.equal(stats.segmentReuseRows, 0);

    return snapshot(scenario);
  });
}

function benchCacheHits(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writePlainRows(scenario, "cached");
    const firstFlush = commit(scenario);

    writePlainRows(scenario, "cached");
    const secondFlush = commit(scenario);

    assert.ok(secondFlush.cacheHits > 0);
    assert.equal(secondFlush.plainTextRows, 0);
    assert.equal(secondFlush.fragmentRows, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

function benchSingleStyledCacheHits(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writeSingleStyledRows(scenario, "A", { fg: "red" });
    const firstFlush = commit(scenario);

    writeSingleStyledRows(scenario, "A", { fg: "red" });
    const secondFlush = commit(scenario);

    assert.ok(secondFlush.cacheHits > 0);
    assert.equal(secondFlush.singleStyledRows, 0);
    assert.equal(secondFlush.spansReused, 0);
    assert.equal(secondFlush.replaceChildren, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

function benchMultiSegmentCacheHits(options: PrepassOptions): RoundSnapshot {
  return runScenario((scenario) => {
    writeMultiSegmentRows(scenario, "A", "B");
    const firstFlush = commit(scenario);

    writeMultiSegmentRows(scenario, "A", "B");
    const secondFlush = commit(scenario);

    assert.ok(secondFlush.cacheHits > 0);
    assert.equal(secondFlush.segmentReuseRows, 0);
    assert.equal(secondFlush.spansReused, 0);
    assert.equal(secondFlush.fragmentRows, 0);

    return {
      firstFlush,
      secondFlush,
      total: scenario.renderer.debugStats.rowRender.total,
    };
  }, options);
}

const results = {
  plain: benchPlainRows(),
  cacheHitPlain: runPrepassModes((enableRowKeyPrepass) =>
    benchCacheHits({ enableRowKeyPrepass }),
  ),
  cacheHitSingleStyled: runPrepassModes((enableRowKeyPrepass) =>
    benchSingleStyledCacheHits({ enableRowKeyPrepass }),
  ),
  cacheHitMultiSegment: runPrepassModes((enableRowKeyPrepass) =>
    benchMultiSegmentCacheHits({ enableRowKeyPrepass }),
  ),
  changedPlain: runPrepassModes((enableRowKeyPrepass) =>
    benchChangedPlainRows({ enableRowKeyPrepass }),
  ),
  singleStyled: runPrepassModes((enableRowKeyPrepass) =>
    benchSingleStyledRows({ enableRowKeyPrepass }),
  ),
  changedMultiSegment: runPrepassModes((enableRowKeyPrepass) =>
    benchChangedMultiSegmentRows({ enableRowKeyPrepass }),
  ),
  fallback: benchFallbackRows(),
};

console.log(JSON.stringify(results, null, 2));
