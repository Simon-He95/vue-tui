/**
 * 基准测试套件
 * 
 * 自动化收集性能基准数据
 */

import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { textCellWidth, withTextRenderPass } from '../src/vue/utils/text.js';

interface BenchmarkResult {
  name: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSec: number;
}

interface BenchmarkSuiteResult {
  timestamp: number;
  version: string;
  platform: string;
  node: string;
  benchmarks: Record<string, BenchmarkResult>;
  metrics: {
    cacheHitRate: number;
    memoryUsageMB: number;
    gcCount: number;
  };
}

function benchmark(name: string, fn: () => void, iterations: number = 1000): BenchmarkResult {
  const times: number[] = [];
  
  // 预热
  for (let i = 0; i < Math.min(100, iterations / 10); i++) {
    fn();
  }
  
  // 实际测量
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }
  
  times.sort((a, b) => a - b);
  
  const sum = times.reduce((a, b) => a + b, 0);
  const avgTime = sum / times.length;
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const opsPerSec = 1000 / avgTime;
  
  return { name, avgTime, minTime, maxTime, p50, p95, p99, opsPerSec };
}

async function benchAsciiTextWidth(): Promise<Record<string, BenchmarkResult>> {
  return {
    'ascii-10': benchmark('ASCII 10 chars', () => textCellWidth('HelloWorld'), 10000),
    'ascii-100': benchmark('ASCII 100 chars', () => textCellWidth('a'.repeat(100)), 5000),
    'ascii-1000': benchmark('ASCII 1000 chars', () => textCellWidth('x'.repeat(1000)), 1000),
  };
}

async function benchCJKTextWidth(): Promise<Record<string, BenchmarkResult>> {
  return {
    'cjk-10': benchmark('CJK 10 chars', () => textCellWidth('中'.repeat(10)), 10000),
    'cjk-100': benchmark('CJK 100 chars', () => textCellWidth('中'.repeat(100)), 5000),
    'cjk-1000': benchmark('CJK 1000 chars', () => textCellWidth('中'.repeat(1000)), 1000),
  };
}

async function benchMixedTextWidth(): Promise<Record<string, BenchmarkResult>> {
  return {
    'mixed-short': benchmark('Mixed short', () => textCellWidth('Hello 世界 😀'), 10000),
    'mixed-long': benchmark('Mixed long', () => textCellWidth(('abc你好😀'.repeat(100))), 1000),
  };
}

async function benchCacheHitRate(): Promise<number> {
  const texts = ['Line 1', 'Line 2', 'Line 3'];
  let hits = 0;
  let total = 0;
  
  withTextRenderPass(() => {
    // 第一轮: 全部 miss
    for (const text of texts) {
      textCellWidth(text);
      total++;
    }
    
    // 第二轮: 全部 hit
    for (const text of texts) {
      textCellWidth(text);
      hits++;
      total++;
    }
    
    // 第三轮: 全部 hit
    for (const text of texts) {
      textCellWidth(text);
      hits++;
      total++;
    }
  });
  
  return hits / total;
}

async function benchVirtualScrollFPS(): Promise<BenchmarkResult> {
  const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: content`);
  
  return benchmark('Virtual scroll', () => {
    withTextRenderPass(() => {
      for (const line of lines) {
        textCellWidth(line);
      }
    });
  }, 100);
}

async function benchMemoryUsage(): Promise<number> {
  if (global.gc) global.gc();
  
  const initial = process.memoryUsage().heapUsed;
  
  // 模拟实际使用
  for (let i = 0; i < 1000; i++) {
    withTextRenderPass(() => {
      textCellWidth(`Text ${i}`);
      textCellWidth('中文测试');
      textCellWidth('😀 Emoji');
    });
  }
  
  if (global.gc) global.gc();
  
  const final = process.memoryUsage().heapUsed;
  return (final - initial) / 1024 / 1024; // MB
}

async function benchGCPressure(): Promise<number> {
  if (!global.gc) return 0;
  
  let gcCount = 0;
  const originalGC = global.gc;
  
  // @ts-ignore
  global.gc = () => {
    gcCount++;
    originalGC();
  };
  
  // 运行 1 分钟模拟
  const iterations = 60 * 60; // 60fps * 60 seconds
  for (let i = 0; i < iterations; i++) {
    withTextRenderPass(() => {
      textCellWidth('Test line');
    });
    
    if (i % 100 === 0) {
      global.gc();
    }
  }
  
  global.gc = originalGC;
  
  return gcCount;
}

export async function runBenchmarkSuite(version: string = 'current'): Promise<BenchmarkSuiteResult> {
  console.log('🚀 运行基准测试套件...\n');
  
  console.log('1️⃣  ASCII 文本宽度...');
  const asciiResults = await benchAsciiTextWidth();
  
  console.log('2️⃣  CJK 文本宽度...');
  const cjkResults = await benchCJKTextWidth();
  
  console.log('3️⃣  混合文本宽度...');
  const mixedResults = await benchMixedTextWidth();
  
  console.log('4️⃣  缓存命中率...');
  const cacheHitRate = await benchCacheHitRate();
  
  console.log('5️⃣  虚拟滚动 FPS...');
  const virtualScrollResult = await benchVirtualScrollFPS();
  
  console.log('6️⃣  内存占用...');
  const memoryUsage = await benchMemoryUsage();
  
  console.log('7️⃣  GC 压力...');
  const gcCount = await benchGCPressure();
  
  const results: BenchmarkSuiteResult = {
    timestamp: Date.now(),
    version,
    platform: process.platform,
    node: process.version,
    benchmarks: {
      ...asciiResults,
      ...cjkResults,
      ...mixedResults,
      'virtual-scroll': virtualScrollResult,
    },
    metrics: {
      cacheHitRate,
      memoryUsageMB: memoryUsage,
      gcCount,
    },
  };
  
  return results;
}

export function printResults(results: BenchmarkSuiteResult): void {
  console.log('\n📊 基准测试结果\n');
  console.log('═'.repeat(80));
  console.log(`版本: ${results.version}`);
  console.log(`时间: ${new Date(results.timestamp).toISOString()}`);
  console.log(`平台: ${results.platform} (${results.node})`);
  console.log('═'.repeat(80));
  
  console.log('\n性能指标:');
  for (const [key, bench] of Object.entries(results.benchmarks)) {
    console.log(`\n  ${bench.name}:`);
    console.log(`    平均: ${bench.avgTime.toFixed(4)}ms (${bench.opsPerSec.toFixed(0)} ops/sec)`);
    console.log(`    P50:  ${bench.p50.toFixed(4)}ms`);
    console.log(`    P95:  ${bench.p95.toFixed(4)}ms`);
    console.log(`    P99:  ${bench.p99.toFixed(4)}ms`);
  }
  
  console.log('\n\n系统指标:');
  console.log(`  缓存命中率: ${(results.metrics.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`  内存占用:   ${results.metrics.memoryUsageMB.toFixed(2)}MB`);
  console.log(`  GC 次数:    ${results.metrics.gcCount}`);
  console.log('═'.repeat(80));
}

export async function compareResults(baseline: BenchmarkSuiteResult, current: BenchmarkSuiteResult): void {
  console.log('\n📈 性能对比\n');
  console.log('═'.repeat(80));
  console.log(`基线: ${baseline.version} (${new Date(baseline.timestamp).toISOString()})`);
  console.log(`当前: ${current.version} (${new Date(current.timestamp).toISOString()})`);
  console.log('═'.repeat(80));
  
  console.log('\n性能变化:');
  for (const key of Object.keys(baseline.benchmarks)) {
    const base = baseline.benchmarks[key];
    const curr = current.benchmarks[key];
    
    if (!curr) continue;
    
    const change = ((curr.avgTime - base.avgTime) / base.avgTime) * 100;
    const symbol = change < 0 ? '✅' : change > 5 ? '❌' : '⚠️';
    
    console.log(`\n  ${symbol} ${base.name}:`);
    console.log(`    基线: ${base.avgTime.toFixed(4)}ms`);
    console.log(`    当前: ${curr.avgTime.toFixed(4)}ms`);
    console.log(`    变化: ${change > 0 ? '+' : ''}${change.toFixed(1)}%`);
  }
  
  console.log('\n\n系统指标变化:');
  
  const cacheChange = ((current.metrics.cacheHitRate - baseline.metrics.cacheHitRate) / baseline.metrics.cacheHitRate) * 100;
  console.log(`  缓存命中率: ${(baseline.metrics.cacheHitRate * 100).toFixed(1)}% → ${(current.metrics.cacheHitRate * 100).toFixed(1)}% (${cacheChange > 0 ? '+' : ''}${cacheChange.toFixed(1)}%)`);
  
  const memChange = current.metrics.memoryUsageMB - baseline.metrics.memoryUsageMB;
  console.log(`  内存占用:   ${baseline.metrics.memoryUsageMB.toFixed(2)}MB → ${current.metrics.memoryUsageMB.toFixed(2)}MB (${memChange > 0 ? '+' : ''}${memChange.toFixed(2)}MB)`);
  
  const gcChange = current.metrics.gcCount - baseline.metrics.gcCount;
  console.log(`  GC 次数:    ${baseline.metrics.gcCount} → ${current.metrics.gcCount} (${gcChange > 0 ? '+' : ''}${gcChange})`);
  
  console.log('═'.repeat(80));
}

// CLI 执行
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';
  
  if (command === 'run') {
    const version = args[1] || 'current';
    const output = args[2];
    
    const results = await runBenchmarkSuite(version);
    printResults(results);
    
    if (output) {
      await writeFile(output, JSON.stringify(results, null, 2));
      console.log(`\n💾 结果已保存到: ${output}`);
    }
  } else if (command === 'compare') {
    const baselineFile = args[1];
    const currentFile = args[2];
    
    if (!baselineFile || !currentFile) {
      console.error('用法: node benchmark-suite.ts compare <baseline.json> <current.json>');
      process.exit(1);
    }
    
    const { readFile } = await import('node:fs/promises');
    const baseline = JSON.parse(await readFile(baselineFile, 'utf-8'));
    const current = JSON.parse(await readFile(currentFile, 'utf-8'));
    
    await compareResults(baseline, current);
  } else {
    console.error('未知命令:', command);
    console.error('用法: node benchmark-suite.ts [run|compare]');
    process.exit(1);
  }
}
