#!/usr/bin/env tsx
/**
 * Performance Baseline Harness
 *
 * Generates reproducible performance baseline data with statistical analysis.
 * Outputs JSON with environment info, p50/p95/p99, mean, stdev, and CV.
 *
 * Usage:
 *   pnpm run bench:perf-baseline [--output <file>]
 *   pnpm run bench:perf-baseline -- --warmup 200 --samples 2000
 *   BENCH_SMOKE=1 pnpm run bench:perf-baseline
 */

import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import * as assert from "node:assert";
import { execSync } from "node:child_process";

// Import functions to benchmark
import {
  EAW_UNICODE_VERSION,
  EAW_SOURCE_SHA256,
} from "../src/core/buffer/eaw-ranges-unicode-17.js";
import { charCellWidth } from "../src/core/buffer/width.js";
import {
  textCellWidth,
  sliceByCells,
  wrapByCells,
  clearTextCaches,
} from "../src/vue/utils/text.js";
import { createTerminal } from "../src/core/index.js";

// Blackhole sink to prevent V8 optimization
let sinkValue = 0;

function consumeNumber(value: number): void {
  sinkValue = (sinkValue + value) | 0;
}

function consumeString(value: string): void {
  sinkValue = (sinkValue + value.length) | 0;
  if (value.length) {
    sinkValue = (sinkValue + value.charCodeAt(0) + value.charCodeAt(value.length - 1)) | 0;
  }
}

function consumeArray(value: readonly string[]): void {
  sinkValue = (sinkValue + value.length) | 0;
  for (let i = 0; i < Math.min(value.length, 3); i++) {
    consumeString(value[i] ?? "");
  }
}

interface BenchmarkResult {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  stdev: number;
  cv: number;
  samples: number;
  min: number;
  max: number;
  unit: string;
  iterationsPerSample: number;
  operationsPerIteration: number;
  stability: "stable" | "noisy" | "unstable";
}

interface BaselineReport {
  schemaVersion: number;
  benchmarkSuite: string;
  mode: "smoke" | "full";
  commit: string;
  eawUnicodeVersion: string;
  eawSourceSha256: string;
  runtimeUnicodeVersion: string | undefined;
  icu: string | undefined;
  node: string;
  v8: string;
  os: string;
  cpu: string;
  arch: string;
  warmup: number;
  samples: number;
  clock: string;
  timestamp: string;
  blackhole: number;
  results: Record<string, BenchmarkResult>;
}

function getCommitHash(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getV8Version(): string {
  return process.versions.v8 || "unknown";
}

function getCPUModel(): string {
  const cpus = os.cpus();
  return cpus[0]?.model || "unknown";
}

function getStability(cv: number): "stable" | "noisy" | "unstable" {
  if (cv < 0.1) return "stable";
  if (cv < 0.5) return "noisy";
  return "unstable";
}

/**
 * Sanity check: ensure functions return expected values before benchmarking
 */
function sanityCheck(): void {
  console.log("Running sanity checks...");

  // Character width
  assert.strictEqual(charCellWidth("a"), 1, "ASCII should be width 1");
  assert.strictEqual(charCellWidth("中"), 2, "BMP CJK should be width 2");
  assert.strictEqual(charCellWidth("\u{20BB7}"), 2, "Supplementary CJK (𠮷) should be width 2");
  assert.strictEqual(charCellWidth("\u{2B820}"), 2, "Supplementary CJK Ext E should be width 2");
  assert.strictEqual(charCellWidth("\u{30000}"), 2, "Supplementary CJK Ext G should be width 2");
  assert.strictEqual(charCellWidth("\u{1D11E}"), 1, "Musical symbol should be width 1");
  assert.strictEqual(charCellWidth("⏱"), 1, "Stopwatch without VS16 should be width 1");
  assert.strictEqual(charCellWidth("⏱️"), 2, "Stopwatch with VS16 should be width 2");

  // Text width
  assert.strictEqual(textCellWidth("\u{20BB7}x"), 3, "𠮷x should be width 3 (2+1)");
  assert.strictEqual(textCellWidth("中文"), 4, "中文 should be width 4 (2+2)");

  // Slice
  assert.strictEqual(sliceByCells("\u{20BB7}x", 1), "", "Slicing at 1 should return empty");
  assert.strictEqual(sliceByCells("\u{20BB7}x", 2), "\u{20BB7}", "Slicing at 2 should return 𠮷");
  assert.strictEqual(
    sliceByCells("\u{20BB7}x", 3),
    "\u{20BB7}x",
    "Slicing at 3 should return full",
  );

  // Wrap
  const wrapped = wrapByCells("中文中文", 4);
  assert.strictEqual(wrapped.length, 2, "中文中文 wrapped at 4 should be 2 lines");
  assert.strictEqual(wrapped[0], "中文", "First line should be 中文");
  assert.strictEqual(wrapped[1], "中文", "Second line should be 中文");

  console.log("✅ All sanity checks passed\n");
}

/**
 * Calculate statistical metrics from samples
 */
function calculateStats(
  samples: number[],
  iterationsPerSample: number,
  operationsPerIteration: number,
): BenchmarkResult {
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;

  // Convert to ns/op
  const totalOpsPerSample = iterationsPerSample * operationsPerIteration;
  const nsPerOp = sorted.map((ns) => ns / totalOpsPerSample);

  // Percentiles
  const p50 = nsPerOp[Math.floor(n * 0.5)] || 0;
  const p95 = nsPerOp[Math.floor(n * 0.95)] || 0;
  const p99 = nsPerOp[Math.floor(n * 0.99)] || 0;

  // Mean
  const sum = nsPerOp.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Standard deviation
  const variance = nsPerOp.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const stdev = Math.sqrt(variance);

  // Coefficient of variation
  const cv = mean === 0 ? 0 : stdev / mean;

  return {
    p50,
    p95,
    p99,
    mean,
    stdev,
    cv,
    samples: n,
    min: nsPerOp[0] || 0,
    max: nsPerOp[n - 1] || 0,
    unit: "ns/op",
    iterationsPerSample,
    operationsPerIteration,
    stability: getStability(cv),
  };
}

interface BenchmarkOptions {
  warmup: number;
  samples: number;
  iterationsPerSample: number;
  operationsPerIteration: number;
  beforeEach?: () => void;
}

/**
 * Run a benchmark function multiple times and collect timing samples
 */
function benchmark(name: string, fn: () => void, options: BenchmarkOptions): BenchmarkResult {
  const { warmup, samples, iterationsPerSample, operationsPerIteration, beforeEach } = options;

  console.log(`  Running: ${name}...`);

  // Warmup
  for (let i = 0; i < warmup; i++) {
    if (beforeEach) beforeEach();
    for (let j = 0; j < iterationsPerSample; j++) {
      fn();
    }
  }

  // Collect samples
  const timings: number[] = [];
  for (let i = 0; i < samples; i++) {
    if (beforeEach) beforeEach();

    const start = process.hrtime.bigint();
    for (let j = 0; j < iterationsPerSample; j++) {
      fn();
    }
    const end = process.hrtime.bigint();

    timings.push(Number(end - start));
  }

  return calculateStats(timings, iterationsPerSample, operationsPerIteration);
}

/**
 * Read flag value and validate
 */
function readFlagValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index < 0) return null;

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

/**
 * Parse and validate positive integer
 */
function parsePositiveInt(value: string | undefined, name: string): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  // Validate known flags
  const knownFlags = new Set(["--output", "--warmup", "--samples"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      if (!knownFlags.has(arg)) {
        throw new Error(`Unknown argument: ${arg}`);
      }
      i++; // skip value
    }
  }

  // Read flag values with validation
  const outputFile = readFlagValue(args, "--output");
  const warmupStr = readFlagValue(args, "--warmup");
  const samplesStr = readFlagValue(args, "--samples");

  const warmupArg = parsePositiveInt(warmupStr, "--warmup");
  const samplesArg = parsePositiveInt(samplesStr, "--samples");

  // Environment variables for smoke mode
  const isSmoke = process.env.BENCH_SMOKE === "1";
  const envWarmup = parsePositiveInt(process.env.BENCH_WARMUP, "BENCH_WARMUP");
  const envSamples = parsePositiveInt(process.env.BENCH_SAMPLES, "BENCH_SAMPLES");

  let warmup = 100;
  let samples = 1000;

  if (isSmoke) {
    warmup = 1;
    samples = 3;
  } else {
    if (warmupArg != null) warmup = warmupArg;
    else if (envWarmup != null) warmup = envWarmup;

    if (samplesArg != null) samples = samplesArg;
    else if (envSamples != null) samples = envSamples;
  }

  return { outputFile, warmup, samples, isSmoke };
}

/**
 * Main benchmark suite
 */
async function main() {
  const { outputFile, warmup, samples, isSmoke } = parseArgs();

  console.log("Performance Baseline Harness");
  console.log("============================\n");
  if (isSmoke) {
    console.log("🔥 SMOKE MODE: Quick validation");
  }
  console.log(`Warmup: ${warmup} iterations`);
  console.log(`Samples: ${samples} iterations`);
  console.log(`Clock: process.hrtime.bigint`);
  console.log(`Unit: ns/op (nanoseconds per operation)\n`);

  // Run sanity checks first
  sanityCheck();

  const results: Record<string, BenchmarkResult> = {};

  // Adjust iterations for smoke mode
  const charIter = isSmoke ? 1 : 1000;
  const textIter = isSmoke ? 1 : 100;
  const fastIter = isSmoke ? 1 : 10;

  // Pre-generate corpus for unique text scenarios (true no-cache)
  // Size = total operations needed (warmup + samples) * iterations + safety margin
  const uniqueOps = (warmup + samples) * fastIter + 100;

  const cjkCorpus = Array.from({ length: uniqueOps }, (_, i) => `日志${i}：${"中文".repeat(50)}`);
  const asciiCorpus = Array.from(
    { length: uniqueOps },
    (_, i) => `Log ${i}: ${"text ".repeat(20)}`,
  );
  const wrapCorpus = Array.from(
    { length: uniqueOps },
    (_, i) => `包装文本${i}${"测试".repeat(30)}`,
  );
  let cjkIdx = 0;
  let asciiIdx = 0;
  let wrapIdx = 0;

  console.log(`Generated unique corpus: ${uniqueOps} entries per type\n`);

  // Scenario 1: charCellWidth ASCII
  results["charCellWidth_ascii"] = benchmark(
    "charCellWidth(ASCII)",
    () => {
      consumeNumber(charCellWidth("a"));
      consumeNumber(charCellWidth("Z"));
      consumeNumber(charCellWidth("0"));
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 3,
    },
  );

  // Scenario 2: charCellWidth BMP CJK
  results["charCellWidth_bmp_cjk"] = benchmark(
    "charCellWidth(BMP CJK)",
    () => {
      consumeNumber(charCellWidth("中"));
      consumeNumber(charCellWidth("文"));
      consumeNumber(charCellWidth("字"));
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 3,
    },
  );

  // Scenario 3: charCellWidth supplementary CJK
  results["charCellWidth_supplementary_cjk"] = benchmark(
    "charCellWidth(Supplementary CJK)",
    () => {
      consumeNumber(charCellWidth("\u{20BB7}"));
      consumeNumber(charCellWidth("\u{2B820}"));
      consumeNumber(charCellWidth("\u{30000}"));
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 3,
    },
  );

  // Scenario 4: charCellWidth non-CJK supplementary
  results["charCellWidth_non_cjk_supplementary"] = benchmark(
    "charCellWidth(Non-CJK Supplementary)",
    () => {
      consumeNumber(charCellWidth("\u{1D11E}"));
      consumeNumber(charCellWidth("\u{1D400}"));
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 2,
    },
  );

  // Scenario 5: charCellWidth emoji sequence
  results["charCellWidth_emoji_sequence"] = benchmark(
    "charCellWidth(Emoji)",
    () => {
      consumeNumber(charCellWidth("😀"));
      consumeNumber(charCellWidth("⏱️"));
      consumeNumber(charCellWidth("👨\u200d👩\u200d👧\u200d👦"));
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 3,
    },
  );

  // Scenario 6: textCellWidth ASCII fast path (does not use cache)
  const asciiLong = "a".repeat(100);
  results["textCellWidth_ascii_long_fast_path"] = benchmark(
    "textCellWidth(ASCII 100, fast path)",
    () => {
      consumeNumber(textCellWidth(asciiLong));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Text scenarios: Clear cache at scenario boundaries to prevent cross-contamination
  // Hot cache scenarios will rebuild cache during warmup
  // Unique scenarios test cache-miss path with each new input
  clearTextCaches();

  // Scenario 7: textCellWidth unique ASCII (simulates unique log lines)
  results["textCellWidth_ascii_unique"] = benchmark(
    "textCellWidth(ASCII unique, fast path)",
    () => {
      consumeNumber(textCellWidth(asciiCorpus[asciiIdx++]!));
    },
    {
      warmup,
      samples,
      iterationsPerSample: fastIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 8: textCellWidth BMP CJK (hot cache)
  const cjkLong = "中".repeat(100);
  results["textCellWidth_cjk_long_hot"] = benchmark(
    "textCellWidth(BMP CJK 100, hot cache)",
    () => {
      consumeNumber(textCellWidth(cjkLong));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 9: textCellWidth unique CJK (simulates unique log lines)
  results["textCellWidth_cjk_unique"] = benchmark(
    "textCellWidth(CJK unique, cache-miss path)",
    () => {
      consumeNumber(textCellWidth(cjkCorpus[cjkIdx++]!));
    },
    {
      warmup,
      samples,
      iterationsPerSample: fastIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 10: textCellWidth supplementary CJK (hot cache)
  const supplementaryCjkLong = "\u{20BB7}".repeat(50);
  results["textCellWidth_supplementary_cjk_long_hot"] = benchmark(
    "textCellWidth(Supplementary CJK 50, hot cache)",
    () => {
      consumeNumber(textCellWidth(supplementaryCjkLong));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 11: textCellWidth complex grapheme (hot cache) - ZWJ emoji, regional indicators, combining marks
  const ZWJ = "\u200d";
  const womanTechnologist = `👩${ZWJ}💻`;
  const family = `👨${ZWJ}👩${ZWJ}👧${ZWJ}👦`;
  const complexGraphemeHot = womanTechnologist.repeat(20) + "🇺🇸".repeat(20) + "e\u0301".repeat(50);
  results["textCellWidth_complex_grapheme_hot"] = benchmark(
    "textCellWidth(complex grapheme, hot cache)",
    () => {
      consumeNumber(textCellWidth(complexGraphemeHot));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 12: textCellWidth complex grapheme (unique) - tests segmentedGraphemes path
  const complexGraphemeCorpus = Array.from(
    { length: uniqueOps },
    (_, i) => `${family}${i}🇺🇸${"e\u0301".repeat(10)}`,
  );
  let complexIdx = 0;
  results["textCellWidth_complex_grapheme_unique"] = benchmark(
    "textCellWidth(complex grapheme unique, cache-miss path)",
    () => {
      consumeNumber(textCellWidth(complexGraphemeCorpus[complexIdx++]!));
    },
    {
      warmup,
      samples,
      iterationsPerSample: fastIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 13: blackhole overhead baseline
  results["harness_blackhole_overhead"] = benchmark(
    "harness blackhole overhead",
    () => {
      consumeNumber(1);
      consumeNumber(2);
      consumeNumber(3);
    },
    {
      warmup,
      samples,
      iterationsPerSample: charIter,
      operationsPerIteration: 3,
    },
  );

  // Scenario 14: sliceByCells with supplementary CJK
  const sliceText = "\u{20BB7}\u{2B820}\u{30000}abc";
  results["sliceByCells_supplementary_cjk"] = benchmark(
    "sliceByCells(Supplementary CJK)",
    () => {
      consumeString(sliceByCells(sliceText, 2));
      consumeString(sliceByCells(sliceText, 4));
      consumeString(sliceByCells(sliceText, 6));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 3,
    },
  );

  clearTextCaches();

  // Scenario 15: wrapByCells CJK (hot cache)
  results["wrapByCells_cjk_long_hot"] = benchmark(
    "wrapByCells(CJK 100, hot cache)",
    () => {
      consumeArray(wrapByCells(cjkLong, 40));
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 16: wrapByCells unique text (no cache)
  results["wrapByCells_cjk_unique"] = benchmark(
    "wrapByCells(unique text, cache-miss path)",
    () => {
      consumeArray(wrapByCells(wrapCorpus[wrapIdx++]!, 40));
    },
    {
      warmup,
      samples,
      iterationsPerSample: fastIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 17: terminal write supplementary CJK (hot same position)
  const terminal1 = createTerminal({ cols: 80, rows: 24 });
  results["terminal_write_supplementary_cjk_hot"] = benchmark(
    "terminal.write(Supplementary CJK, hot same position)",
    () => {
      terminal1.write("\u{20BB7}test\u{2B820}", { x: 0, y: 0 });
    },
    {
      warmup,
      samples,
      iterationsPerSample: textIter,
      operationsPerIteration: 1,
    },
  );

  // Scenario 18: terminal write supplementary CJK (cycling rows, buffer write only)
  const terminal2 = createTerminal({ cols: 80, rows: 24 });
  let rowCounter = 0;
  results["terminal_write_supplementary_cjk_cycling_rows"] = benchmark(
    "terminal.write(Supplementary CJK, cycling rows)",
    () => {
      const y = rowCounter % 24;
      terminal2.write(`\u{20BB7}test${rowCounter}\u{2B820}`, { x: 0, y });
      rowCounter++;
    },
    {
      warmup,
      samples,
      iterationsPerSample: fastIter,
      operationsPerIteration: 1,
    },
  );

  // Verify scenario count
  const expectedScenarios = 18;
  const actualScenarios = Object.keys(results).length;
  assert.strictEqual(
    actualScenarios,
    expectedScenarios,
    `Expected ${expectedScenarios} scenarios, got ${actualScenarios}`,
  );

  // Verify all results have required fields
  for (const [name, result] of Object.entries(results)) {
    assert.ok(typeof result.p50 === "number", `${name}: p50 must be number`);
    assert.ok(typeof result.p95 === "number", `${name}: p95 must be number`);
    assert.ok(typeof result.p99 === "number", `${name}: p99 must be number`);
    assert.ok(typeof result.mean === "number", `${name}: mean must be number`);
    assert.ok(typeof result.stdev === "number", `${name}: stdev must be number`);
    assert.ok(typeof result.cv === "number", `${name}: cv must be number`);
    assert.ok(result.unit === "ns/op", `${name}: unit must be ns/op`);
  }

  // Build report
  const report: BaselineReport = {
    schemaVersion: 1,
    benchmarkSuite: "unicode-width-text-v1",
    mode: isSmoke ? "smoke" : "full",
    commit: getCommitHash(),
    eawUnicodeVersion: EAW_UNICODE_VERSION,
    eawSourceSha256: EAW_SOURCE_SHA256,
    runtimeUnicodeVersion: process.versions.unicode,
    icu: process.versions.icu,
    node: process.version,
    v8: getV8Version(),
    os: `${os.platform()}-${os.arch()}`,
    cpu: getCPUModel(),
    arch: os.arch(),
    warmup,
    samples,
    clock: "process.hrtime.bigint",
    timestamp: new Date().toISOString(),
    blackhole: sinkValue,
    results,
  };

  // Output
  console.log("\n" + "=".repeat(50));
  console.log("Results Summary:");
  console.log("=".repeat(50));

  for (const [name, result] of Object.entries(results)) {
    const stabilityMark =
      result.stability === "stable" ? "✓" : result.stability === "noisy" ? "~" : "⚠";
    console.log(`\n${name}: ${stabilityMark}`);
    console.log(`  p50: ${result.p50.toFixed(2)} ns/op`);
    console.log(`  p95: ${result.p95.toFixed(2)} ns/op`);
    console.log(`  p99: ${result.p99.toFixed(2)} ns/op`);
    console.log(`  mean: ${result.mean.toFixed(2)} ns/op`);
    console.log(`  stdev: ${result.stdev.toFixed(2)} ns/op`);
    console.log(`  cv: ${result.cv.toFixed(4)} (${(result.cv * 100).toFixed(2)}%)`);
    console.log(`  stability: ${result.stability}`);
    console.log(
      `  iterations: ${result.iterationsPerSample} x ${result.operationsPerIteration} ops`,
    );
  }

  console.log(`\n(Blackhole sink: ${sinkValue})`);

  const json = JSON.stringify(report, null, 2);

  if (outputFile) {
    const dir = path.dirname(outputFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputFile, `${json}\n`);
    console.log(`\n✅ Baseline written to: ${outputFile}`);
  } else {
    console.log("\n" + "=".repeat(50));
    console.log("JSON Output:");
    console.log("=".repeat(50));
    console.log(json);
  }

  console.log(`\n✅ Benchmark completed: ${actualScenarios} scenarios`);
}

main().catch((error) => {
  console.error("Error running baseline:", error);
  process.exit(1);
});
