/**
 * Phase 3.2 Complete Profiler Benchmark - CORRECTED VERSION
 *
 * Fixes all review issues:
 * 1. clearTextCaches() between runs to avoid cache pollution
 * 2. Unique styles per run (href with runId) to isolate bucket creation
 * 3. Fixed w1 overflow to use 200 truly unique width=1 chars (Latin Extended)
 * 4. withTerminal() helper for robust cleanup
 * 5. Fixed style type issues (href instead of fg: number)
 * 6. Added P50/P95/Max bucket size output
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

interface WorkloadContext {
  runId: string;
}

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

// Helper: Force GC if available
function forceGC() {
  const maybeGc = (globalThis as any).gc;
  if (typeof maybeGc === "function") {
    maybeGc();
  }
}

// Helper: Robust terminal lifecycle management
function withTerminal<T>(
  options: Parameters<typeof createTerminal>[0],
  fn: (terminal: ReturnType<typeof createTerminal>) => T,
): T {
  const terminal = createTerminal(options);
  try {
    return fn(terminal);
  } finally {
    terminal.dispose();
  }
}

// Helper: Measure workload with proper cache isolation
function measureWorkload(
  name: string,
  description: string,
  workloadFn: (ctx: WorkloadContext) => void,
): WorkloadResult {
  // Measure WITHOUT instrumentation
  clearTextCaches();
  forceGC();
  disableInstrumentation();

  const startDisabled = performance.now();
  workloadFn({ runId: "control-run-00000" });
  const durationWithout = performance.now() - startDisabled;

  // Clear caches between runs to avoid pollution
  clearTextCaches();
  forceGC();

  // Measure WITH instrumentation
  const heapBefore = getHeapUsed();

  resetMetrics();
  enableInstrumentation();
  const startEnabled = performance.now();

  try {
    workloadFn({ runId: "profile-run-00000" });
    const durationWith = performance.now() - startEnabled;

    forceGC();
    const heapAfter = getHeapUsed();

    const metrics = getMetrics();
    const overheadPercent = durationWithout > 0 ? (durationWith / durationWithout - 1) * 100 : 0;
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
}

// ============================================================================
// WORKLOADS - All fixed per review
// ============================================================================

// Workload 1: Cell Cache Overflow Width=1 (FIXED - 200 unique width=1 chars)
function workload_cellCacheOverflowWidth1(ctx: WorkloadContext) {
  withTerminal({ cols: 80, rows: 24 }, (terminal) => {
    const style = { href: `perf:w1:${ctx.runId}` };
    // Write 200 unique width=1 chars (Latin Extended-A and beyond)
    for (let i = 0; i < 200; i++) {
      const ch = String.fromCharCode(0x0100 + i);
      terminal.write(ch, { x: i % 80, y: Math.floor(i / 80), style });
    }
  });
}

// Workload 2: Cell Cache Overflow Width=2
function workload_cellCacheOverflowWidth2(ctx: WorkloadContext) {
  withTerminal({ cols: 80, rows: 24 }, (terminal) => {
    const style = { href: `perf:w2:${ctx.runId}` };
    // Write 200 unique CJK chars
    for (let i = 0; i < 200; i++) {
      const ch = String.fromCodePoint(0x4e00 + i);
      const x = (i * 2) % 80;
      const y = Math.floor((i * 2) / 80);
      terminal.write(ch, { x, y, style });
    }
  });
}

// Workload 3: Many Styles Many Chars (FIXED - proper href style)
function workload_manyStylesManyChars(ctx: WorkloadContext) {
  withTerminal({ cols: 80, rows: 24 }, (terminal) => {
    // 50 styles × 10 chars each
    for (let styleIdx = 0; styleIdx < 50; styleIdx++) {
      const style = { href: `perf:style:${ctx.runId}:${styleIdx}` };
      for (let charIdx = 0; charIdx < 10; charIdx++) {
        const ch = String.fromCodePoint(0x4e00 + styleIdx * 10 + charIdx);
        terminal.write(ch, { x: charIdx * 2, y: styleIdx % 24, style });
      }
    }
  });
}

// Workload 4: Complex Grapheme Cached
function workload_complexGraphemeCached(_ctx: WorkloadContext) {
  const lines = [
    "👩\u200d💻 Developer",
    "👨\u200d👩\u200d👧\u200d👦 Family",
    "🇺🇸 Flag",
    "e\u0301 café",
  ];

  for (let i = 0; i < 500; i++) {
    for (const line of lines) {
      textCellWidth(line);
    }
  }
}

// Workload 5: Complex Grapheme Uncached (unique per run)
function workload_complexGraphemeUncached(ctx: WorkloadContext) {
  // Generate 1000 unique complex strings per run
  for (let i = 0; i < 1000; i++) {
    const text = `👨\u200d💻-${ctx.runId}-${i} e\u0301-${ctx.runId}-${i}`;
    textCellWidth(text);
  }
}

// Workload 6: Wrap Width Churn
function workload_wrapWidthChurn(_ctx: WorkloadContext) {
  const longLine = "这是一个很长的中文文本行，用来测试文本换行缓存的行为。".repeat(10);

  // 50 widths exceeds MAX_WRAP_CACHE_BUCKETS=32
  for (let width = 20; width <= 70; width++) {
    wrapByCells(longLine, width);
  }
}

// Workload 7: Repeated CJK (baseline)
function workload_repeatedCJK(ctx: WorkloadContext) {
  withTerminal({ cols: 80, rows: 24 }, (terminal) => {
    const style = { href: `perf:repeated:${ctx.runId}` };
    const line = "日志行：中文测试内容".repeat(5);

    for (let i = 0; i < 1000; i++) {
      terminal.write(line, { x: 0, y: i % 24, style });
    }
  });
}

// Workload 8: Mixed Workload
function workload_mixed(ctx: WorkloadContext) {
  withTerminal({ cols: 80, rows: 24 }, (terminal) => {
    const prefixes = ["INFO", "WARN", "ERROR", "DEBUG"];

    for (let i = 0; i < 1000; i++) {
      const prefix = prefixes[i % prefixes.length]!;
      const style = { href: `perf:mixed:${ctx.runId}:${prefix}` };
      const content = `${prefix}: 日志消息 ${i} - ${"内容".repeat(5)}`;
      terminal.write(content, { x: 0, y: i % 24, style });
    }
  });
}

// ============================================================================
// FORMATTING - Enhanced with P50/P95
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

  if (result.heapDelta !== null) {
    lines.push(`Heap delta: ${(result.heapDelta / 1024 / 1024).toFixed(2)} MB`);
  }

  lines.push("");

  // Cell cache with bucket distribution
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
    `  cache clears (w1/w2): ${metrics.cell.cellCacheClearWidth1}/${metrics.cell.cellCacheClearWidth2}`,
  );

  lines.push(
    `  registered bucket count (w1/w2): ${metrics.cell.registeredBucketCountWidth1}/${metrics.cell.registeredBucketCountWidth2}`,
  );

  if (
    metrics.cell.registeredBucketCountWidth1 > 0 ||
    metrics.cell.registeredBucketCountWidth2 > 0
  ) {
    lines.push(
      `  bucket size P50 (w1/w2): ${metrics.cell.registeredBucketSizeP50Width1}/${metrics.cell.registeredBucketSizeP50Width2}`,
    );
    lines.push(
      `  bucket size P95 (w1/w2): ${metrics.cell.registeredBucketSizeP95Width1}/${metrics.cell.registeredBucketSizeP95Width2}`,
    );
    lines.push(
      `  bucket size Max (w1/w2): ${metrics.cell.registeredBucketSizeMaxWidth1}/${metrics.cell.registeredBucketSizeMaxWidth2}`,
    );
  }

  lines.push(`  estimated registered cells: ${metrics.cell.estimatedRegisteredBucketCells}`);
  lines.push(
    `  max observed cache size (w1/w2): ${metrics.cell.maxCacheSizeWidth1}/${metrics.cell.maxCacheSizeWidth2}`,
  );

  lines.push("");

  // Text cache
  lines.push("Text Cache:");
  lines.push(`  textCellWidth calls: ${metrics.text.textCellWidthCalls}`);
  lines.push(
    `  text cache hit rate: ${calculateHitRate(metrics.text.textWidthCacheHit, metrics.text.textWidthCacheMiss)}`,
  );
  lines.push(
    `  wrap cache hit rate: ${calculateHitRate(metrics.text.wrapCacheHit, metrics.text.wrapCacheMiss)}`,
  );
  lines.push(`  wrap width bucket clears: ${metrics.text.wrapWidthBucketMapClear}`);

  lines.push("");

  // Grapheme
  lines.push("Grapheme:");
  lines.push(`  segmentation required: ${metrics.grapheme.graphemeSegmentationRequiredCalls}`);
  lines.push(`  Intl.Segmenter used: ${metrics.grapheme.intlSegmenterUsed}`);

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
  const gcAvailable = typeof (globalThis as any).gc === "function";

  console.log("Phase 3.2 Complete Profiler Benchmark (Corrected)");
  console.log("==================================================\n");
  console.log("Environment:");
  console.log(`- Node: ${process.version}`);
  console.log(`- GC available: ${gcAvailable}`);
  if (!gcAvailable) {
    console.log(
      "  ⚠️  Heap delta is advisory only. Run with --expose-gc for accurate GC measurements.",
    );
  }
  console.log("");
  console.log("Fixes applied:");
  console.log("- clearTextCaches() between runs");
  console.log("- Unique styles per run (isolated bucket creation)");
  console.log("- Fixed w1 overflow (200 unique width=1 chars)");
  console.log("- withTerminal() for robust cleanup");
  console.log("- P50/P95/Max bucket size metrics");
  console.log("- Fixed runId consistency (same length for overhead measurement)");
  console.log("");
  console.log("⚠️  Note: Overhead percentages are smoke signals only.");
  console.log("   For rigorous performance measurement, use Phase 2 baseline harness.");
  console.log("");

  const workloads = [
    {
      fn: workload_cellCacheOverflowWidth1,
      name: "cell_cache_overflow_w1",
      desc: "Cell cache overflow width=1 (200 unique Latin Extended)",
    },
    {
      fn: workload_cellCacheOverflowWidth2,
      name: "cell_cache_overflow_w2",
      desc: "Cell cache overflow width=2 (200 unique CJK)",
    },
    {
      fn: workload_manyStylesManyChars,
      name: "many_styles_many_chars",
      desc: "Many styles (50) with many chars (10 each)",
    },
    {
      fn: workload_complexGraphemeCached,
      name: "complex_grapheme_cached",
      desc: "Complex grapheme cached (4 lines × 500 iterations)",
    },
    {
      fn: workload_complexGraphemeUncached,
      name: "complex_grapheme_uncached",
      desc: "Complex grapheme uncached (1000 unique per run)",
    },
    {
      fn: workload_wrapWidthChurn,
      name: "wrap_width_churn",
      desc: "Wrap width churn (50 widths > 32 bucket limit)",
    },
    { fn: workload_repeatedCJK, name: "repeated_cjk", desc: "Repeated CJK baseline (1000 lines)" },
    {
      fn: workload_mixed,
      name: "mixed_workload",
      desc: "Mixed workload (1000 log lines, 4 prefixes)",
    },
  ];

  const results: WorkloadResult[] = [];

  for (const { fn, name, desc } of workloads) {
    console.log(`\nRunning: ${name}...`);
    const result = measureWorkload(name, desc, fn);
    results.push(result);

    console.log(formatMetrics(result));
    console.log("─".repeat(70));
  }

  console.log("\n✅ Profiler benchmark completed");
  console.log(`Total workloads: ${results.length}`);
  console.log(
    `Average overhead: ${(results.reduce((sum, r) => sum + r.overheadPercent, 0) / results.length).toFixed(2)}%`,
  );

  return results;
}

main().catch((error) => {
  console.error("Error running profiler:", error);
  process.exit(1);
});
