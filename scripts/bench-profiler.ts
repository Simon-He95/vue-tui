/**
 * Phase 3 Profiler Benchmark
 *
 * This script runs targeted workloads with instrumentation enabled
 * to collect cache hit/miss, allocation, and GC metrics.
 */

import { createTerminal } from "../src/core/index.js";
import { textCellWidth, wrapByCells } from "../src/vue/utils/text.js";
import {
  enableInstrumentation,
  disableInstrumentation,
  resetMetrics,
  getMetrics,
  type PerformanceMetrics,
} from "../src/core/perf/instrumentation.js";

interface WorkloadResult {
  name: string;
  description: string;
  metrics: PerformanceMetrics;
  duration: number;
}

interface ProfilerReport {
  timestamp: string;
  workloads: WorkloadResult[];
}

function formatMetrics(metrics: PerformanceMetrics): string {
  const lines: string[] = [];

  lines.push("Cell Cache Metrics:");
  lines.push(`  createCell calls: ${metrics.cell.createCellCalls}`);
  lines.push(`  charCellWidth calls: ${metrics.cell.charCellWidthCallsFromCreateCell}`);
  lines.push(`  new Cell count: ${metrics.cell.newCellCount}`);
  lines.push(`  cache hit width=1: ${metrics.cell.cellCacheHitWidth1}`);
  lines.push(`  cache hit width=2: ${metrics.cell.cellCacheHitWidth2}`);
  lines.push(`  cache miss width=1: ${metrics.cell.cellCacheMissWidth1}`);
  lines.push(`  cache miss width=2: ${metrics.cell.cellCacheMissWidth2}`);
  lines.push(`  cache clear width=1: ${metrics.cell.cellCacheClearWidth1}`);
  lines.push(`  cache clear width=2: ${metrics.cell.cellCacheClearWidth2}`);
  lines.push(`  max cache size width=1: ${metrics.cell.maxCacheSizeWidth1}`);
  lines.push(`  max cache size width=2: ${metrics.cell.maxCacheSizeWidth2}`);

  const cellHitTotal = metrics.cell.cellCacheHitWidth1 + metrics.cell.cellCacheHitWidth2;
  const cellMissTotal = metrics.cell.cellCacheMissWidth1 + metrics.cell.cellCacheMissWidth2;
  const cellTotal = cellHitTotal + cellMissTotal;
  if (cellTotal > 0) {
    const hitRate = ((cellHitTotal / cellTotal) * 100).toFixed(2);
    lines.push(`  cache hit rate: ${hitRate}%`);
  }

  lines.push("\nText Cache Metrics:");
  lines.push(`  textCellWidth calls: ${metrics.text.textCellWidthCalls}`);
  lines.push(`  text width cache hit: ${metrics.text.textWidthCacheHit}`);
  lines.push(`  text width cache miss: ${metrics.text.textWidthCacheMiss}`);
  lines.push(`  text width cache set: ${metrics.text.textWidthCacheSet}`);
  lines.push(`  text width cache evict: ${metrics.text.textWidthCacheEvict}`);
  lines.push(`  render pass cache hit: ${metrics.text.renderPassTextWidthCacheHit}`);
  lines.push(`  render pass cache miss: ${metrics.text.renderPassTextWidthCacheMiss}`);
  lines.push(`  max text length: ${metrics.text.maxTextLength}`);
  lines.push(
    `  avg text length: ${(metrics.text.totalTextLength / Math.max(1, metrics.text.textCellWidthCalls)).toFixed(2)}`,
  );
  lines.push(`  ASCII count: ${metrics.text.asciiCount}`);
  lines.push(`  non-ASCII count: ${metrics.text.nonAsciiCount}`);

  const textCacheTotal = metrics.text.textWidthCacheHit + metrics.text.textWidthCacheMiss;
  if (textCacheTotal > 0) {
    const textHitRate = ((metrics.text.textWidthCacheHit / textCacheTotal) * 100).toFixed(2);
    lines.push(`  text cache hit rate: ${textHitRate}%`);
  }

  lines.push("\nWrap Cache Metrics:");
  lines.push(`  wrapByCells calls: ${metrics.text.wrapByCellsCalls}`);
  lines.push(`  wrap cache hit: ${metrics.text.wrapCacheHit}`);
  lines.push(`  wrap cache miss: ${metrics.text.wrapCacheMiss}`);
  lines.push(`  wrap cache set: ${metrics.text.wrapCacheSet}`);
  lines.push(`  wrap cache clear: ${metrics.text.wrapCacheClear}`);

  const wrapCacheTotal = metrics.text.wrapCacheHit + metrics.text.wrapCacheMiss;
  if (wrapCacheTotal > 0) {
    const wrapHitRate = ((metrics.text.wrapCacheHit / wrapCacheTotal) * 100).toFixed(2);
    lines.push(`  wrap cache hit rate: ${wrapHitRate}%`);
  }

  lines.push("\nGrapheme Metrics:");
  lines.push(`  segmentedGraphemes calls: ${metrics.grapheme.segmentedGraphemesCalls}`);
  lines.push(`  Intl.Segmenter used: ${metrics.grapheme.intlSegmenterUsed}`);
  lines.push(`  fallback segmenter used: ${metrics.grapheme.fallbackSegmenterUsed}`);
  lines.push(`  complex grapheme count: ${metrics.grapheme.complexGraphemeCount}`);

  return lines.join("\n");
}

// Workload 1: Repeated CJK text (high Cell cache hit rate expected)
function workload_repeatedCJKText(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const terminal = createTerminal({ cols: 80, rows: 24 });
  const line = "日志行：中文测试内容".repeat(5);

  // Write same line 1000 times
  for (let i = 0; i < 1000; i++) {
    terminal.write(line, { x: 0, y: i % 24 });
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "repeated_cjk_text",
    description: "1000 writes of same CJK line (high Cell cache hit rate expected)",
    metrics,
    duration,
  };
}

// Workload 2: Unique CJK logs (low cache hit rate, cache misses and evictions)
function workload_uniqueCJKLogs(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const terminal = createTerminal({ cols: 80, rows: 24 });

  // Write 1000 unique lines
  for (let i = 0; i < 1000; i++) {
    const line = `日志${i}：中文测试内容${"测试".repeat(10)}`;
    terminal.write(line, { x: 0, y: i % 24 });
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "unique_cjk_logs",
    description: "1000 unique CJK log lines (cache misses and evictions expected)",
    metrics,
    duration,
  };
}

// Workload 3: Complex grapheme text (ZWJ, combining marks, emoji)
function workload_complexGraphemeText(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const zwj = "\u200d";
  const lines = [
    `👩${zwj}💻 Developer`,
    `👨${zwj}👩${zwj}👧${zwj}👦 Family`,
    "🇺🇸 Country flag",
    "é café" + " naïve".repeat(10), // combining marks
  ];

  // Call textCellWidth many times
  for (let i = 0; i < 500; i++) {
    for (const line of lines) {
      textCellWidth(line);
    }
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "complex_grapheme_text",
    description: "2000 textCellWidth calls with ZWJ emoji and combining marks",
    metrics,
    duration,
  };
}

// Workload 4: Long text wrapping (wrap cache behavior)
function workload_longTextWrapping(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const longLine = "这是一个很长的中文文本行，用来测试文本换行缓存的行为。".repeat(10);

  // Wrap same text multiple times at different widths
  for (let width = 40; width <= 80; width += 10) {
    for (let i = 0; i < 100; i++) {
      wrapByCells(longLine, width);
    }
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "long_text_wrapping",
    description: "500 wrapByCells calls on long CJK text at varying widths",
    metrics,
    duration,
  };
}

// Workload 5: Mixed unique and repeated chars (realistic workload)
function workload_mixedWorkload(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const terminal = createTerminal({ cols: 80, rows: 24 });

  // Simulate log viewer: some repeated prefixes, unique content
  const prefixes = ["INFO", "WARN", "ERROR", "DEBUG"];

  for (let i = 0; i < 1000; i++) {
    const prefix = prefixes[i % prefixes.length];
    const content = `${prefix}: 日志消息 ${i} - ${"内容".repeat(5)}`;
    terminal.write(content, { x: 0, y: i % 24 });
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "mixed_workload",
    description: "1000 log lines with repeated prefixes + unique content",
    metrics,
    duration,
  };
}

// Workload 6: Supplementary plane CJK
function workload_supplementaryCJK(): WorkloadResult {
  const start = performance.now();
  resetMetrics();
  enableInstrumentation();

  const terminal = createTerminal({ cols: 80, rows: 24 });
  const suppLine = "\u{20BB7}\u{2B820}\u{30000}".repeat(20);

  for (let i = 0; i < 500; i++) {
    terminal.write(suppLine, { x: 0, y: i % 24 });
  }

  const metrics = getMetrics();
  disableInstrumentation();
  const duration = performance.now() - start;

  return {
    name: "supplementary_cjk",
    description: "500 writes of supplementary plane CJK characters",
    metrics,
    duration,
  };
}

async function main() {
  console.log("Phase 3 Profiler Benchmark");
  console.log("==========================\n");

  const workloads = [
    workload_repeatedCJKText,
    workload_uniqueCJKLogs,
    workload_complexGraphemeText,
    workload_longTextWrapping,
    workload_mixedWorkload,
    workload_supplementaryCJK,
  ];

  const results: WorkloadResult[] = [];

  for (const workload of workloads) {
    console.log(`Running: ${workload.name}...`);
    const result = workload();
    results.push(result);

    console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
    console.log(formatMetrics(result.metrics));
    console.log();
  }

  const report: ProfilerReport = {
    timestamp: new Date().toISOString(),
    workloads: results,
  };

  console.log("\n✅ Profiler benchmark completed");
  console.log(`Total workloads: ${results.length}`);

  return report;
}

main().catch((error) => {
  console.error("Error running profiler:", error);
  process.exit(1);
});
