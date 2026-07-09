/**
 * Phase 3.2 Complete Profiler Benchmark
 *
 * Enhanced version with:
 * - Cache overflow workloads
 * - Cached/uncached grapheme variants
 * - Width churn workload
 * - Duration with/without instrumentation
 * - Heap measurement
 * - Robust error handling
 */

import { createTerminal } from "../src/core/index.js";
import { textCellWidth, wrapByCells, clearTextCaches } from "../src/vue/utils/text.js";
import {
  enableInstrumentation,
  disableInstrumentation,
  resetMetrics,
  getMetrics,
  getHeapUsed,
  type PerformanceMetrics,
} from "../src/core/perf/instrumentation.js";

interface WorkloadResult {
  name: string;
  description: string;
  durationWithoutInstrumentation: number;
  durationWithInstrumentation: number;
  overheadPercent: number;
  heapBefore: number | null;
  heapAfter: number | null;
  heapDelta: number | null;
  metrics: PerformanceMetrics;
}

interface ProfilerReport {
  timestamp: string;
  workloads: WorkloadResult[];
}

// Helper: Force GC if available
function forceGC() {
  const maybeGc = (globalThis as any).gc;
  if (typeof maybeGc === "function") {
    maybeGc();
  }
}

// Helper: Measure workload with robust error handling
function measureWorkload(
  name: string,
  description: string,
  workloadFn: () => void,
): WorkloadResult {
  let terminal: any = null;

  try {
    // Measure WITHOUT instrumentation
    disableInstrumentation();
    const startDisabled = performance.now();
    workloadFn();
    const durationWithout = performance.now() - startDisabled;

    // Measure WITH instrumentation
    forceGC();
    const heapBefore = getHeapUsed();

    resetMetrics();
    enableInstrumentation();
    const startEnabled = performance.now();

    try {
      workloadFn();
      const durationWith = performance.now() - startEnabled;

      forceGC();
      const heapAfter = getHeapUsed();

      const metrics = getMetrics();
      const overheadPercent = (durationWith / durationWithout - 1) * 100;
      const heapDelta = heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null;

      return {
        name,
        description,
        durationWithoutInstrumentation: durationWithout,
        durationWithInstrumentation: durationWith,
        overheadPercent,
        heapBefore,
        heapAfter,
        heapDelta,
        metrics,
      };
    } finally {
      disableInstrumentation();
    }
  } finally {
    if (terminal?.dispose) {
      terminal.dispose();
    }
  }
}

// ============================================================================
// WORKLOADS
// ============================================================================

// Workload 1: Cell Cache Overflow Width=1
function workload_cellCacheOverflowWidth1() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // Write 200 unique printable ASCII chars (exceeds MAX=128)
  for (let i = 0; i < 200; i++) {
    const ch = String.fromCharCode(0x21 + (i % 94));
    terminal.write(ch, { x: i % 80, y: Math.floor(i / 80) });
  }
  terminal.dispose();
}

// Workload 2: Cell Cache Overflow Width=2
function workload_cellCacheOverflowWidth2() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // Write 200 unique CJK chars (exceeds MAX=128)
  for (let i = 0; i < 200; i++) {
    const ch = String.fromCodePoint(0x4e00 + i);
    const x = (i * 2) % 80;
    const y = Math.floor((i * 2) / 80);
    terminal.write(ch, { x, y });
  }
  terminal.dispose();
}

// Workload 3: Many Styles Many Chars
function workload_manyStylesManyChars() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  // 50 styles × 10 chars each = stress bucket count
  for (let styleIdx = 0; styleIdx < 50; styleIdx++) {
    const style = { fg: styleIdx };
    for (let charIdx = 0; charIdx < 10; charIdx++) {
      const ch = String.fromCodePoint(0x4e00 + styleIdx * 10 + charIdx);
      terminal.write(ch, { x: charIdx * 2, y: styleIdx % 24, style });
    }
  }
  terminal.dispose();
}

// Workload 4: Complex Grapheme Cached
function workload_complexGraphemeCached() {
  const lines = [
    "👩\u200d💻 Developer",
    "👨\u200d👩\u200d👧\u200d👦 Family",
    "🇺🇸 Flag",
    "e\u0301 café",
  ];

  // Call 500 times - should mostly hit cache
  for (let i = 0; i < 500; i++) {
    for (const line of lines) {
      textCellWidth(line);
    }
  }
}

// Workload 5: Complex Grapheme Uncached
function workload_complexGraphemeUncached() {
  // Generate 1000 unique complex strings
  for (let i = 0; i < 1000; i++) {
    const text = `👨\u200d💻-${i} e\u0301-${i}`;
    textCellWidth(text);
  }
}

// Workload 6: Wrap Width Churn
function workload_wrapWidthChurn() {
  const longLine = "这是一个很长的中文文本行，用来测试文本换行缓存的行为。".repeat(10);

  // Wrap at 50 different widths (exceeds MAX_WRAP_CACHE_BUCKETS=32)
  for (let width = 20; width <= 70; width++) {
    wrapByCells(longLine, width);
  }
}

// Workload 7: Repeated CJK (baseline from Phase 3.1)
function workload_repeatedCJK() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  const line = "日志行：中文测试内容".repeat(5);

  for (let i = 0; i < 1000; i++) {
    terminal.write(line, { x: 0, y: i % 24 });
  }
  terminal.dispose();
}

// Workload 8: Mixed Workload
function workload_mixed() {
  const terminal = createTerminal({ cols: 80, rows: 24 });
  const prefixes = ["INFO", "WARN", "ERROR", "DEBUG"];

  for (let i = 0; i < 1000; i++) {
    const prefix = prefixes[i % prefixes.length];
    const content = `${prefix}: 日志消息 ${i} - ${"内容".repeat(5)}`;
    terminal.write(content, { x: 0, y: i % 24 });
  }
  terminal.dispose();
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatMetrics(result: WorkloadResult): string {
  const lines: string[] = [];
  const { metrics } = result;

  // Duration and overhead
  lines.push(
    `Duration without instrumentation: ${result.durationWithoutInstrumentation.toFixed(2)}ms`,
  );
  lines.push(`Duration with instrumentation: ${result.durationWithInstrumentation.toFixed(2)}ms`);
  lines.push(`Instrumentation overhead: ${result.overheadPercent.toFixed(2)}%`);

  // Heap
  if (result.heapDelta !== null) {
    lines.push(`Heap delta: ${(result.heapDelta / 1024 / 1024).toFixed(2)} MB`);
  }

  lines.push("");

  // Cell cache
  lines.push("Cell Cache:");
  lines.push(`  createCell calls: ${metrics.cell.createCellCalls}`);
  lines.push(`  new cells: ${metrics.cell.newCellCount}`);
  lines.push(
    `  hit rate: ${calculateHitRate(
      metrics.cell.cellCacheHitWidth1 + metrics.cell.cellCacheHitWidth2,
      metrics.cell.cellCacheMissWidth1 + metrics.cell.cellCacheMissWidth2,
    )}`,
  );
  lines.push(
    `  cache clears: ${metrics.cell.cellCacheClearWidth1 + metrics.cell.cellCacheClearWidth2}`,
  );
  lines.push(
    `  bucket count (w1/w2): ${metrics.cell.registeredBucketCountWidth1}/${metrics.cell.registeredBucketCountWidth2}`,
  );
  lines.push(`  estimated retained cells: ${metrics.cell.estimatedRegisteredBucketCells}`);
  lines.push(
    `  max single bucket size (w1/w2): ${metrics.cell.maxCacheSizeWidth1}/${metrics.cell.maxCacheSizeWidth2}`,
  );

  lines.push("");

  // Text cache
  lines.push("Text Cache:");
  lines.push(`  textCellWidth calls: ${metrics.text.textCellWidthCalls}`);
  lines.push(
    `  text cache hit rate: ${calculateHitRate(
      metrics.text.textWidthCacheHit,
      metrics.text.textWidthCacheMiss,
    )}`,
  );
  lines.push(
    `  wrap cache hit rate: ${calculateHitRate(
      metrics.text.wrapCacheHit,
      metrics.text.wrapCacheMiss,
    )}`,
  );
  lines.push(`  wrap width bucket clears: ${metrics.text.wrapWidthBucketMapClear}`);

  lines.push("");

  // Grapheme
  lines.push("Grapheme:");
  lines.push(`  segmentation required: ${metrics.grapheme.graphemeSegmentationRequiredCalls}`);
  lines.push(`  Intl.Segmenter used: ${metrics.grapheme.intlSegmenterUsed}`);
  lines.push(`  fallback used: ${metrics.grapheme.fallbackSegmenterUsed}`);

  return lines.join("\n");
}

function calculateHitRate(hits: number, misses: number): string {
  const total = hits + misses;
  if (total === 0) return "N/A";
  return `${((hits / total) * 100).toFixed(2)}%`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("Phase 3.2 Complete Profiler Benchmark");
  console.log("======================================\n");

  const workloads = [
    {
      fn: workload_cellCacheOverflowWidth1,
      name: "cell_cache_overflow_w1",
      desc: "Cell cache overflow width=1 (200 unique ASCII)",
    },
    {
      fn: workload_cellCacheOverflowWidth2,
      name: "cell_cache_overflow_w2",
      desc: "Cell cache overflow width=2 (200 unique CJK)",
    },
    {
      fn: workload_manyStylesManyChars,
      name: "many_styles_many_chars",
      desc: "Many styles with many chars (50 styles × 10 chars)",
    },
    {
      fn: workload_complexGraphemeCached,
      name: "complex_grapheme_cached",
      desc: "Complex grapheme cached (4 lines × 500 iterations)",
    },
    {
      fn: workload_complexGraphemeUncached,
      name: "complex_grapheme_uncached",
      desc: "Complex grapheme uncached (1000 unique strings)",
    },
    {
      fn: workload_wrapWidthChurn,
      name: "wrap_width_churn",
      desc: "Wrap width churn (50 widths, exceeds bucket limit)",
    },
    {
      fn: workload_repeatedCJK,
      name: "repeated_cjk",
      desc: "Repeated CJK baseline (1000 same lines)",
    },
    {
      fn: workload_mixed,
      name: "mixed_workload",
      desc: "Mixed workload (1000 log lines with repeated prefixes)",
    },
  ];

  const results: WorkloadResult[] = [];

  for (const { fn, name, desc } of workloads) {
    console.log(`\nRunning: ${name}...`);
    const result = measureWorkload(name, desc, fn);
    results.push(result);

    console.log(formatMetrics(result));
    console.log("─".repeat(60));
  }

  const report: ProfilerReport = {
    timestamp: new Date().toISOString(),
    workloads: results,
  };

  console.log("\n✅ Profiler benchmark completed");
  console.log(`Total workloads: ${results.length}`);
  console.log(
    `\nAverage overhead: ${(results.reduce((sum, r) => sum + r.overheadPercent, 0) / results.length).toFixed(2)}%`,
  );

  return report;
}

main().catch((error) => {
  console.error("Error running profiler:", error);
  process.exit(1);
});
