#!/usr/bin/env tsx
/**
 * Performance Baseline Harness
 * 
 * Generates reproducible performance baseline data with statistical analysis.
 * Outputs JSON with environment info, p50/p95/p99, mean, stdev, and CV.
 * 
 * Usage: pnpm run bench:perf-baseline [--output <file>]
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// Import functions to benchmark
import { charCellWidth } from '../src/core/buffer/width.js';
import { textCellWidth, sliceByCells, wrapByCells, clearTextCaches } from '../src/vue/utils/text.js';
import { createTerminal } from '../src/core/index.js';

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
}

interface BaselineReport {
  commit: string;
  unicodeVersion: string;
  node: string;
  v8: string;
  os: string;
  cpu: string;
  arch: string;
  warmup: number;
  samples: number;
  clock: string;
  timestamp: string;
  results: Record<string, BenchmarkResult>;
}

function getCommitHash(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function getV8Version(): string {
  return process.versions.v8 || 'unknown';
}

function getCPUModel(): string {
  const cpus = os.cpus();
  return cpus[0]?.model || 'unknown';
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
  const nsPerOp = sorted.map(ns => ns / totalOpsPerSample);
  
  // Percentiles
  const p50 = nsPerOp[Math.floor(n * 0.50)] || 0;
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
    unit: 'ns/op',
    iterationsPerSample,
    operationsPerIteration,
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
function benchmark(
  name: string,
  fn: () => void,
  options: BenchmarkOptions,
): BenchmarkResult {
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
 * Main benchmark suite
 */
async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;
  
  const warmup = 100;
  const samples = 1000;
  
  console.log('Performance Baseline Harness');
  console.log('============================\n');
  console.log(`Warmup: ${warmup} iterations`);
  console.log(`Samples: ${samples} iterations`);
  console.log(`Clock: process.hrtime.bigint`);
  console.log(`Unit: ns/op (nanoseconds per operation)\n`);
  
  const results: Record<string, BenchmarkResult> = {};
  
  // Scenario 1: charCellWidth ASCII
  results['charCellWidth_ascii'] = benchmark(
    'charCellWidth(ASCII)',
    () => {
      charCellWidth('a');
      charCellWidth('Z');
      charCellWidth('0');
    },
    {
      warmup,
      samples,
      iterationsPerSample: 1000,
      operationsPerIteration: 3,
    },
  );
  
  // Scenario 2: charCellWidth BMP CJK
  results['charCellWidth_bmp_cjk'] = benchmark(
    'charCellWidth(BMP CJK)',
    () => {
      charCellWidth('中');
      charCellWidth('文');
      charCellWidth('字');
    },
    {
      warmup,
      samples,
      iterationsPerSample: 1000,
      operationsPerIteration: 3,
    },
  );
  
  // Scenario 3: charCellWidth supplementary CJK
  results['charCellWidth_supplementary_cjk'] = benchmark(
    'charCellWidth(Supplementary CJK)',
    () => {
      charCellWidth('\u{20BB7}');
      charCellWidth('\u{2B820}');
      charCellWidth('\u{30000}');
    },
    {
      warmup,
      samples,
      iterationsPerSample: 1000,
      operationsPerIteration: 3,
    },
  );
  
  // Scenario 4: charCellWidth non-CJK supplementary
  results['charCellWidth_non_cjk_supplementary'] = benchmark(
    'charCellWidth(Non-CJK Supplementary)',
    () => {
      charCellWidth('\u{1D11E}');
      charCellWidth('\u{1D400}');
    },
    {
      warmup,
      samples,
      iterationsPerSample: 1000,
      operationsPerIteration: 2,
    },
  );
  
  // Scenario 5: charCellWidth emoji sequence
  results['charCellWidth_emoji_sequence'] = benchmark(
    'charCellWidth(Emoji)',
    () => {
      charCellWidth('😀');
      charCellWidth('⏱️');
      charCellWidth('👨\u200d👩\u200d👧\u200d👦');
    },
    {
      warmup,
      samples,
      iterationsPerSample: 1000,
      operationsPerIteration: 3,
    },
  );
  
  // Scenario 6: textCellWidth ASCII long (hot cache)
  const asciiLong = 'a'.repeat(100);
  results['textCellWidth_ascii_long_hot'] = benchmark(
    'textCellWidth(ASCII 100, hot cache)',
    () => {
      textCellWidth(asciiLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
    },
  );
  
  // Scenario 7: textCellWidth ASCII long (cold cache)
  results['textCellWidth_ascii_long_cold'] = benchmark(
    'textCellWidth(ASCII 100, cold cache)',
    () => {
      textCellWidth(asciiLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
      beforeEach: clearTextCaches,
    },
  );
  
  // Scenario 8: textCellWidth BMP CJK long (hot cache)
  const cjkLong = '中'.repeat(100);
  results['textCellWidth_cjk_long_hot'] = benchmark(
    'textCellWidth(BMP CJK 100, hot cache)',
    () => {
      textCellWidth(cjkLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
    },
  );
  
  // Scenario 9: textCellWidth BMP CJK long (cold cache)
  results['textCellWidth_cjk_long_cold'] = benchmark(
    'textCellWidth(BMP CJK 100, cold cache)',
    () => {
      textCellWidth(cjkLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
      beforeEach: clearTextCaches,
    },
  );
  
  // Scenario 10: textCellWidth unique (simulates unique log lines)
  let uniqueCounter = 0;
  results['textCellWidth_unique_text'] = benchmark(
    'textCellWidth(unique text, cold cache)',
    () => {
      textCellWidth(`Log line ${uniqueCounter++}: 中文内容`);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 10,
      operationsPerIteration: 1,
      beforeEach: clearTextCaches,
    },
  );
  
  // Scenario 11: textCellWidth supplementary CJK long (hot cache)
  const supplementaryCjkLong = '\u{20BB7}'.repeat(50);
  results['textCellWidth_supplementary_cjk_long_hot'] = benchmark(
    'textCellWidth(Supplementary CJK 50, hot cache)',
    () => {
      textCellWidth(supplementaryCjkLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
    },
  );
  
  // Scenario 12: textCellWidth supplementary CJK long (cold cache)
  results['textCellWidth_supplementary_cjk_long_cold'] = benchmark(
    'textCellWidth(Supplementary CJK 50, cold cache)',
    () => {
      textCellWidth(supplementaryCjkLong);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
      beforeEach: clearTextCaches,
    },
  );
  
  // Scenario 13: sliceByCells with supplementary CJK
  const sliceText = '\u{20BB7}\u{2B820}\u{30000}abc';
  results['sliceByCells_supplementary_cjk'] = benchmark(
    'sliceByCells(Supplementary CJK)',
    () => {
      sliceByCells(sliceText, 2);
      sliceByCells(sliceText, 4);
      sliceByCells(sliceText, 6);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 3,
    },
  );
  
  // Scenario 14: wrapByCells CJK long (hot cache)
  results['wrapByCells_cjk_long_hot'] = benchmark(
    'wrapByCells(CJK 100, hot cache)',
    () => {
      wrapByCells(cjkLong, 40);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
    },
  );
  
  // Scenario 15: wrapByCells CJK long (cold cache)
  results['wrapByCells_cjk_long_cold'] = benchmark(
    'wrapByCells(CJK 100, cold cache)',
    () => {
      wrapByCells(cjkLong, 40);
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
      beforeEach: clearTextCaches,
    },
  );
  
  // Scenario 16: terminal write supplementary CJK (hot same position)
  const terminal1 = createTerminal({ cols: 80, rows: 24 });
  results['terminal_write_supplementary_cjk_hot'] = benchmark(
    'terminal.write(Supplementary CJK, hot same position)',
    () => {
      terminal1.write('\u{20BB7}test\u{2B820}', { x: 0, y: 0 });
    },
    {
      warmup,
      samples,
      iterationsPerSample: 100,
      operationsPerIteration: 1,
    },
  );
  
  // Scenario 17: terminal write supplementary CJK (unique rows)
  const terminal2 = createTerminal({ cols: 80, rows: 24 });
  let rowCounter = 0;
  results['terminal_write_supplementary_cjk_unique_rows'] = benchmark(
    'terminal.write(Supplementary CJK, unique rows)',
    () => {
      const y = rowCounter % 24;
      terminal2.write(`\u{20BB7}test${rowCounter}\u{2B820}`, { x: 0, y });
      rowCounter++;
    },
    {
      warmup,
      samples,
      iterationsPerSample: 10,
      operationsPerIteration: 1,
    },
  );
  
  // Build report
  const report: BaselineReport = {
    commit: getCommitHash(),
    unicodeVersion: '17.0.0',
    node: process.version,
    v8: getV8Version(),
    os: `${os.platform()}-${os.arch()}`,
    cpu: getCPUModel(),
    arch: os.arch(),
    warmup,
    samples,
    clock: 'process.hrtime.bigint',
    timestamp: new Date().toISOString(),
    results,
  };
  
  // Output
  console.log('\n' + '='.repeat(50));
  console.log('Results Summary:');
  console.log('='.repeat(50));
  
  for (const [name, result] of Object.entries(results)) {
    console.log(`\n${name}:`);
    console.log(`  p50: ${result.p50.toFixed(2)} ns/op`);
    console.log(`  p95: ${result.p95.toFixed(2)} ns/op`);
    console.log(`  p99: ${result.p99.toFixed(2)} ns/op`);
    console.log(`  mean: ${result.mean.toFixed(2)} ns/op`);
    console.log(`  stdev: ${result.stdev.toFixed(2)} ns/op`);
    console.log(`  cv: ${result.cv.toFixed(4)} (${(result.cv * 100).toFixed(2)}%)`);
    console.log(`  iterations: ${result.iterationsPerSample} x ${result.operationsPerIteration} ops`);
  }
  
  const json = JSON.stringify(report, null, 2);
  
  if (outputFile) {
    const dir = path.dirname(outputFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputFile, `${json}\n`);
    console.log(`\n✅ Baseline written to: ${outputFile}`);
  } else {
    console.log('\n' + '='.repeat(50));
    console.log('JSON Output:');
    console.log('='.repeat(50));
    console.log(json);
  }
}

main().catch((error) => {
  console.error('Error running baseline:', error);
  process.exit(1);
});
