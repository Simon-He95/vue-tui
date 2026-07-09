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
import { execSync } from 'node:child_process';

// Import functions to benchmark
import { charCellWidth } from '../src/core/buffer/width.js';
import { textCellWidth, sliceByCells, wrapByCells } from '../src/vue/utils/text.js';
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
function calculateStats(samples: number[]): BenchmarkResult {
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  
  // Percentiles
  const p50 = sorted[Math.floor(n * 0.50)] || 0;
  const p95 = sorted[Math.floor(n * 0.95)] || 0;
  const p99 = sorted[Math.floor(n * 0.99)] || 0;
  
  // Mean
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  
  // Standard deviation
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
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
    min: sorted[0] || 0,
    max: sorted[n - 1] || 0,
  };
}

/**
 * Run a benchmark function multiple times and collect timing samples
 */
function benchmark(
  name: string,
  fn: () => void,
  warmup: number,
  samples: number,
): BenchmarkResult {
  console.log(`  Running: ${name}...`);
  
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }
  
  // Collect samples
  const timings: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    timings.push(Number(end - start));
  }
  
  return calculateStats(timings);
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
  console.log(`Clock: process.hrtime.bigint\n`);
  
  const results: Record<string, BenchmarkResult> = {};
  
  // Scenario 1: charCellWidth ASCII
  results['charCellWidth_ascii'] = benchmark(
    'charCellWidth(ASCII)',
    () => {
      charCellWidth('a');
      charCellWidth('Z');
      charCellWidth('0');
    },
    warmup,
    samples,
  );
  
  // Scenario 2: charCellWidth BMP CJK
  results['charCellWidth_bmp_cjk'] = benchmark(
    'charCellWidth(BMP CJK)',
    () => {
      charCellWidth('中');
      charCellWidth('文');
      charCellWidth('字');
    },
    warmup,
    samples,
  );
  
  // Scenario 3: charCellWidth supplementary CJK
  results['charCellWidth_supplementary_cjk'] = benchmark(
    'charCellWidth(Supplementary CJK)',
    () => {
      charCellWidth('\u{20BB7}'); // 𠮷
      charCellWidth('\u{2B820}'); // Extension E
      charCellWidth('\u{30000}'); // Extension G
    },
    warmup,
    samples,
  );
  
  // Scenario 4: charCellWidth non-CJK supplementary
  results['charCellWidth_non_cjk_supplementary'] = benchmark(
    'charCellWidth(Non-CJK Supplementary)',
    () => {
      charCellWidth('\u{1D11E}'); // Musical symbol
      charCellWidth('\u{1D400}'); // Mathematical alphanumeric
    },
    warmup,
    samples,
  );
  
  // Scenario 5: charCellWidth emoji sequence
  results['charCellWidth_emoji_sequence'] = benchmark(
    'charCellWidth(Emoji)',
    () => {
      charCellWidth('😀');
      charCellWidth('⏱️'); // With VS16
      charCellWidth('👨‍👩‍👧‍👦'); // ZWJ sequence
    },
    warmup,
    samples,
  );
  
  // Scenario 6: textCellWidth ASCII long
  const asciiLong = 'a'.repeat(100);
  results['textCellWidth_ascii_long'] = benchmark(
    'textCellWidth(ASCII 100)',
    () => {
      textCellWidth(asciiLong);
    },
    warmup,
    samples,
  );
  
  // Scenario 7: textCellWidth BMP CJK long
  const cjkLong = '中'.repeat(100);
  results['textCellWidth_cjk_long'] = benchmark(
    'textCellWidth(BMP CJK 100)',
    () => {
      textCellWidth(cjkLong);
    },
    warmup,
    samples,
  );
  
  // Scenario 8: textCellWidth supplementary CJK long
  const supplementaryCjkLong = '\u{20BB7}'.repeat(50);
  results['textCellWidth_supplementary_cjk_long'] = benchmark(
    'textCellWidth(Supplementary CJK 50)',
    () => {
      textCellWidth(supplementaryCjkLong);
    },
    warmup,
    samples,
  );
  
  // Scenario 9: sliceByCells with supplementary CJK
  const sliceText = '\u{20BB7}\u{2B820}\u{30000}abc';
  results['sliceByCells_supplementary_cjk'] = benchmark(
    'sliceByCells(Supplementary CJK)',
    () => {
      sliceByCells(sliceText, 2);
      sliceByCells(sliceText, 4);
      sliceByCells(sliceText, 6);
    },
    warmup,
    samples,
  );
  
  // Scenario 10: wrapByCells CJK long
  results['wrapByCells_cjk_long'] = benchmark(
    'wrapByCells(CJK 100)',
    () => {
      wrapByCells(cjkLong, 40);
    },
    warmup,
    samples,
  );
  
  // Scenario 11: terminal write supplementary CJK
  const terminal = createTerminal({ cols: 80, rows: 24 });
  results['terminal_write_supplementary_cjk'] = benchmark(
    'terminal.write(Supplementary CJK)',
    () => {
      terminal.write('\u{20BB7}test\u{2B820}', { x: 0, y: 0 });
    },
    warmup,
    samples,
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
    console.log(`  p50: ${result.p50}ns`);
    console.log(`  p95: ${result.p95}ns`);
    console.log(`  p99: ${result.p99}ns`);
    console.log(`  mean: ${result.mean.toFixed(2)}ns`);
    console.log(`  stdev: ${result.stdev.toFixed(2)}ns`);
    console.log(`  cv: ${result.cv.toFixed(4)}`);
  }
  
  const json = JSON.stringify(report, null, 2);
  
  if (outputFile) {
    fs.writeFileSync(outputFile, json);
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
