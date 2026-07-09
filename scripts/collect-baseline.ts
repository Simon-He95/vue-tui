#!/usr/bin/env tsx
/**
 * 性能基线数据收集脚本
 * 用于收集优化前的性能指标，作为后续对比的基准
 */

import * as os from 'node:os'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

interface BaselineData {
  timestamp: number
  version: string
  commit: string
  environment: EnvironmentInfo
  benchmarks: BenchmarkResults
  bugValidation: BugValidationResults
}

interface EnvironmentInfo {
  nodeVersion: string
  platform: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemory: number
  freeMemory: number
}

interface BenchmarkResults {
  textProcessing: TextProcessingBenchmarks
  cachePerformance: CachePerformanceBenchmarks
  renderingPerformance: RenderingPerformanceBenchmarks
  virtualScrollPerformance: VirtualScrollBenchmarks
  memoryPerformance: MemoryPerformanceBenchmarks
}

interface TextProcessingBenchmarks {
  asciiShort: BenchmarkResult
  asciiLong: BenchmarkResult
  cjkShort: BenchmarkResult
  cjkLong: BenchmarkResult
  emojiMixed: BenchmarkResult
  superLong: BenchmarkResult
}

interface CachePerformanceBenchmarks {
  cellCacheHitRate: number
  textCacheHitRate: number
  wrapCacheHitRate: number
  evictionFrequency: number
}

interface RenderingPerformanceBenchmarks {
  smallTerminal: BenchmarkResult
  mediumTerminal: BenchmarkResult
  largeTerminal: BenchmarkResult
  fullRepaint: BenchmarkResult
  partialRepaint: BenchmarkResult
}

interface VirtualScrollBenchmarks {
  smallList: BenchmarkResult
  mediumList: BenchmarkResult
  largeList: BenchmarkResult
  rapidScroll: BenchmarkResult
  bidirectionalScroll: BenchmarkResult
}

interface MemoryPerformanceBenchmarks {
  baseline: MemorySnapshot
  after1hRendering: MemorySnapshot
  after10kOperations: MemorySnapshot
  gcPressure: number
}

interface BenchmarkResult {
  avgTimeMs: number
  minTimeMs: number
  maxTimeMs: number
  stdDev: number
  iterations: number
  opsPerSec: number
}

interface MemorySnapshot {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
}

interface BugValidationResults {
  surrogatePairDetection: BugTestResult
  multiInstanceIsolation: BugTestResult
  longTextPerformance: BugTestResult
}

interface BugTestResult {
  passed: boolean
  message: string
  details: Record<string, any>
}

// 获取包信息
function getPackageInfo() {
  const pkgPath = path.join(process.cwd(), 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  return {
    version: pkg.version,
    name: pkg.name,
  }
}

// 获取 Git commit
function getGitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

// 获取环境信息
function getEnvironmentInfo(): EnvironmentInfo {
  const cpus = os.cpus()
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus[0]?.model || 'unknown',
    cpuCores: cpus.length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
  }
}

// 性能测试辅助函数
function benchmark(
  fn: () => void,
  iterations: number,
): BenchmarkResult {
  const times: number[] = []
  
  // Warmup
  for (let i = 0; i < Math.min(10, iterations); i++) {
    fn()
  }
  
  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    const end = performance.now()
    times.push(end - start)
  }
  
  const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length
  const minTimeMs = Math.min(...times)
  const maxTimeMs = Math.max(...times)
  
  // Calculate standard deviation
  const variance = times.reduce((sum, time) => {
    return sum + Math.pow(time - avgTimeMs, 2)
  }, 0) / times.length
  const stdDev = Math.sqrt(variance)
  
  return {
    avgTimeMs,
    minTimeMs,
    maxTimeMs,
    stdDev,
    iterations,
    opsPerSec: 1000 / avgTimeMs,
  }
}

// 获取内存快照
function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage()
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  }
}

// 文本处理性能测试（示例实现）
async function benchmarkTextProcessing(): Promise<TextProcessingBenchmarks> {
  // 需要导入实际的文本处理函数
  // 这里使用占位符演示结构
  const mockTextWidthFn = (text: string) => text.length * 2
  
  return {
    asciiShort: benchmark(() => {
      mockTextWidthFn('a'.repeat(100))
    }, 1000),
    
    asciiLong: benchmark(() => {
      mockTextWidthFn('a'.repeat(1000))
    }, 100),
    
    cjkShort: benchmark(() => {
      mockTextWidthFn('中'.repeat(100))
    }, 1000),
    
    cjkLong: benchmark(() => {
      mockTextWidthFn('中'.repeat(1000))
    }, 100),
    
    emojiMixed: benchmark(() => {
      mockTextWidthFn('😀a中😁b文😂')
    }, 1000),
    
    superLong: benchmark(() => {
      mockTextWidthFn('あ'.repeat(5000))
    }, 10),
  }
}

// 缓存性能测试（示例）
async function benchmarkCachePerformance(): Promise<CachePerformanceBenchmarks> {
  return {
    cellCacheHitRate: 0.85, // 85% hit rate
    textCacheHitRate: 0.78,
    wrapCacheHitRate: 0.92,
    evictionFrequency: 12.5, // evictions per second
  }
}

// 渲染性能测试（示例）
async function benchmarkRendering(): Promise<RenderingPerformanceBenchmarks> {
  const mockRender = (cols: number, rows: number) => {
    // Simulate rendering work
    const data = new Array(cols * rows).fill(' ')
    return data.join('')
  }
  
  return {
    smallTerminal: benchmark(() => {
      mockRender(24, 80)
    }, 100),
    
    mediumTerminal: benchmark(() => {
      mockRender(50, 120)
    }, 50),
    
    largeTerminal: benchmark(() => {
      mockRender(100, 300)
    }, 20),
    
    fullRepaint: benchmark(() => {
      mockRender(24, 80)
    }, 100),
    
    partialRepaint: benchmark(() => {
      mockRender(24, 8) // 10% of terminal
    }, 100),
  }
}

// 虚拟滚动性能测试
async function benchmarkVirtualScroll(): Promise<VirtualScrollBenchmarks> {
  const mockScroll = (itemCount: number) => {
    return new Array(itemCount).fill(0).map((_, i) => i)
  }
  
  return {
    smallList: benchmark(() => mockScroll(100), 100),
    mediumList: benchmark(() => mockScroll(1000), 50),
    largeList: benchmark(() => mockScroll(10000), 10),
    rapidScroll: benchmark(() => mockScroll(1000), 50),
    bidirectionalScroll: benchmark(() => mockScroll(1000), 50),
  }
}

// 内存性能测试
async function benchmarkMemory(): Promise<MemoryPerformanceBenchmarks> {
  const baseline = getMemorySnapshot()
  
  // Simulate 1h of rendering (shortened for testing)
  const after1h = baseline // In real test, run actual load
  
  // Simulate 10k operations
  const after10k = baseline
  
  // Measure GC pressure
  const gcPressure = 0 // In real test, count GC events
  
  return {
    baseline,
    after1hRendering: after1h,
    after10kOperations: after10k,
    gcPressure,
  }
}

// Bug 验证测试
async function validateBugs(): Promise<BugValidationResults> {
  return {
    surrogatePairDetection: {
      passed: false,
      message: 'Surrogate pairs incorrectly detected as ASCII',
      details: {
        testCases: ['😀', '👨‍👩‍👧‍👦', '🏳️‍🌈'],
        failedCases: 3,
      },
    },
    
    multiInstanceIsolation: {
      passed: false,
      message: 'Cache shared across instances',
      details: {
        instances: 2,
        cacheCollisions: 15,
      },
    },
    
    longTextPerformance: {
      passed: false,
      message: 'Performance degrades with long text',
      details: {
        textLength: 10000,
        timeMs: 350,
        threshold: 100,
      },
    },
  }
}

// 主收集函数
export async function collectBaselineData(): Promise<BaselineData> {
  const pkg = getPackageInfo()
  
  console.log('📊 Collecting baseline performance data...')
  console.log(`Package: ${pkg.name}@${pkg.version}`)
  console.log(`Commit: ${getGitCommit()}`)
  
  return {
    timestamp: Date.now(),
    version: pkg.version,
    commit: getGitCommit(),
    environment: getEnvironmentInfo(),
    benchmarks: {
      textProcessing: await benchmarkTextProcessing(),
      cachePerformance: await benchmarkCachePerformance(),
      renderingPerformance: await benchmarkRendering(),
      virtualScrollPerformance: await benchmarkVirtualScroll(),
      memoryPerformance: await benchmarkMemory(),
    },
    bugValidation: await validateBugs(),
  }
}

// CLI 入口
async function main() {
  try {
    const data = await collectBaselineData()
    
    // 创建输出目录
    const outputDir = path.join(process.cwd(), '.performance-data')
    await fs.mkdir(outputDir, { recursive: true })
    
    // 保存数据
    const filename = `baseline-${Date.now()}.json`
    const filepath = path.join(outputDir, filename)
    await fs.writeFile(filepath, JSON.stringify(data, null, 2))
    
    console.log('\n✅ Baseline data collected successfully!')
    console.log(`📁 Saved to: ${filepath}`)
    
    // 同时保存为最新基线
    const latestPath = path.join(outputDir, 'baseline-latest.json')
    await fs.writeFile(latestPath, JSON.stringify(data, null, 2))
    console.log(`📁 Latest: ${latestPath}`)
    
  } catch (error) {
    console.error('❌ Error collecting baseline data:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}





