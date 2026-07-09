#!/usr/bin/env tsx
/**
 * 性能对比分析脚本
 * 对比 baseline 和 optimized 数据，生成详细的分析报告
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface BaselineData {
  timestamp: number
  version: string
  commit: string
  environment: any
  benchmarks: any
  bugValidation: any
}

interface ComparisonResult {
  metric: string
  baseline: number
  optimized: number
  change: number
  changePercent: number
  improvement: boolean
  passed: boolean
  threshold?: number
}

interface BugFixValidation {
  bugName: string
  fixedInBaseline: boolean
  fixedInOptimized: boolean
  fixed: boolean
  details: any
}

interface ComparisonReport {
  summary: {
    overallPerformanceGain: number
    bugsFixed: number
    regressionsDetected: number
    acceptancePassed: boolean
    totalScore: number
  }
  detailed: {
    textProcessing: ComparisonResult[]
    cachePerformance: ComparisonResult[]
    renderingPerformance: ComparisonResult[]
    virtualScrollPerformance: ComparisonResult[]
    memoryPerformance: ComparisonResult[]
  }
  bugFixes: BugFixValidation[]
  regressionAnalysis: {
    performanceRegressions: ComparisonResult[]
    memoryRegressions: ComparisonResult[]
  }
  acceptanceCriteria: {
    criteria: string
    target: string | number
    actual: string | number
    passed: boolean
  }[]
}

// 计算性能变化
function calculateChange(
  baseline: number,
  optimized: number,
): { change: number; changePercent: number; improvement: boolean } {
  const change = optimized - baseline
  const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0
  const improvement = change < 0 // 时间越小越好
  
  return { change, changePercent, improvement }
}

// 对比文本处理性能
function compareTextProcessing(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  const categories = [
    'asciiShort',
    'asciiLong',
    'cjkShort',
    'cjkLong',
    'emojiMixed',
    'superLong',
  ]
  
  for (const category of categories) {
    const baselineVal = baseline.textProcessing[category].avgTimeMs
    const optimizedVal = optimized.textProcessing[category].avgTimeMs
    const { change, changePercent, improvement } = calculateChange(
      baselineVal,
      optimizedVal,
    )
    
    // ASCII 目标提升 >50%, CJK 目标 >20%, 超长文本目标 <100ms
    let threshold = 20
    if (category.startsWith('ascii')) threshold = 50
    if (category === 'superLong') threshold = 100 // absolute time
    
    const passed = category === 'superLong'
      ? optimizedVal < threshold
      : Math.abs(changePercent) > threshold
    
    results.push({
      metric: `Text Processing: ${category}`,
      baseline: baselineVal,
      optimized: optimizedVal,
      change,
      changePercent,
      improvement,
      passed,
      threshold,
    })
  }
  
  return results
}

// 对比缓存性能
function compareCachePerformance(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  const metrics = [
    'cellCacheHitRate',
    'textCacheHitRate',
    'wrapCacheHitRate',
    'evictionFrequency',
  ]
  
  for (const metric of metrics) {
    const baselineVal = baseline.cachePerformance[metric]
    const optimizedVal = optimized.cachePerformance[metric]
    const { change, changePercent, improvement } = calculateChange(
      baselineVal,
      optimizedVal,
    )
    
    // 命中率提升目标 >20%, 淘汰频率应该稳定（变化 <10%）
    const isEviction = metric === 'evictionFrequency'
    const threshold = isEviction ? 10 : 20
    const passed = isEviction
      ? Math.abs(changePercent) < threshold
      : changePercent > threshold
    
    results.push({
      metric: `Cache: ${metric}`,
      baseline: baselineVal,
      optimized: optimizedVal,
      change,
      changePercent,
      improvement: !isEviction ? changePercent > 0 : Math.abs(changePercent) < 10,
      passed,
      threshold,
    })
  }
  
  return results
}

// 对比渲染性能
function compareRenderingPerformance(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  const categories = [
    'smallTerminal',
    'mediumTerminal',
    'largeTerminal',
    'fullRepaint',
    'partialRepaint',
  ]
  
  for (const category of categories) {
    const baselineVal = baseline.renderingPerformance[category].avgTimeMs
    const optimizedVal = optimized.renderingPerformance[category].avgTimeMs
    const { change, changePercent, improvement } = calculateChange(
      baselineVal,
      optimizedVal,
    )
    
    results.push({
      metric: `Rendering: ${category}`,
      baseline: baselineVal,
      optimized: optimizedVal,
      change,
      changePercent,
      improvement,
      passed: improvement, // Any improvement is good
    })
  }
  
  return results
}

// 对比虚拟滚动性能
function compareVirtualScrollPerformance(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  const categories = [
    'smallList',
    'mediumList',
    'largeList',
    'rapidScroll',
    'bidirectionalScroll',
  ]
  
  for (const category of categories) {
    const baselineVal = baseline.virtualScrollPerformance[category].avgTimeMs
    const optimizedVal = optimized.virtualScrollPerformance[category].avgTimeMs
    const { change, changePercent, improvement } = calculateChange(
      baselineVal,
      optimizedVal,
    )
    
    results.push({
      metric: `Virtual Scroll: ${category}`,
      baseline: baselineVal,
      optimized: optimizedVal,
      change,
      changePercent,
      improvement,
      passed: improvement,
    })
  }
  
  return results
}

// 对比内存性能
function compareMemoryPerformance(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const results: ComparisonResult[] = []
  
  const baselineHeap = baseline.memoryPerformance.baseline.heapUsed
  const optimizedHeap = optimized.memoryPerformance.baseline.heapUsed
  const { change, changePercent } = calculateChange(baselineHeap, optimizedHeap)
  
  // 内存增长应 <2MB
  const memoryIncreaseMB = change / (1024 * 1024)
  const passed = memoryIncreaseMB < 2
  
  results.push({
    metric: 'Memory: Baseline Heap',
    baseline: baselineHeap,
    optimized: optimizedHeap,
    change,
    changePercent,
    improvement: change < 0,
    passed,
    threshold: 2, // MB
  })
  
  return results
}

// 验证 Bug 修复
function validateBugFixes(
  baseline: any,
  optimized: any,
): BugFixValidation[] {
  const bugs = [
    'surrogatePairDetection',
    'multiInstanceIsolation',
    'longTextPerformance',
  ]
  
  return bugs.map((bug) => ({
    bugName: bug,
    fixedInBaseline: baseline.bugValidation[bug].passed,
    fixedInOptimized: optimized.bugValidation[bug].passed,
    fixed: !baseline.bugValidation[bug].passed && optimized.bugValidation[bug].passed,
    details: {
      baseline: baseline.bugValidation[bug],
      optimized: optimized.bugValidation[bug],
    },
  }))
}

// 检测性能回退
function detectRegressions(
  baseline: any,
  optimized: any,
): ComparisonResult[] {
  const allComparisons = [
    ...compareTextProcessing(baseline, optimized),
    ...compareCachePerformance(baseline, optimized),
    ...compareRenderingPerformance(baseline, optimized),
    ...compareVirtualScrollPerformance(baseline, optimized),
  ]
  
  return allComparisons.filter((c) => !c.improvement && Math.abs(c.changePercent) > 5)
}

// 生成对比报告
export function generateComparisonReport(
  baseline: BaselineData,
  optimized: BaselineData,
): ComparisonReport {
  const textProcessing = compareTextProcessing(
    baseline.benchmarks,
    optimized.benchmarks,
  )
  const cachePerformance = compareCachePerformance(
    baseline.benchmarks,
    optimized.benchmarks,
  )
  const renderingPerformance = compareRenderingPerformance(
    baseline.benchmarks,
    optimized.benchmarks,
  )
  const virtualScrollPerformance = compareVirtualScrollPerformance(
    baseline.benchmarks,
    optimized.benchmarks,
  )
  const memoryPerformance = compareMemoryPerformance(
    baseline.benchmarks,
    optimized.benchmarks,
  )
  
  const bugFixes = validateBugFixes(baseline, optimized)
  const regressions = detectRegressions(baseline.benchmarks, optimized.benchmarks)
  
  const allResults = [
    ...textProcessing,
    ...cachePerformance,
    ...renderingPerformance,
    ...virtualScrollPerformance,
    ...memoryPerformance,
  ]
  
  const improvements = allResults.filter((r) => r.improvement)
  const overallGain = improvements.reduce((sum, r) => sum + Math.abs(r.changePercent), 0) / improvements.length
  
  const bugsFixed = bugFixes.filter((b) => b.fixed).length
  const passedCriteria = allResults.filter((r) => r.passed).length
  const totalCriteria = allResults.length
  const totalScore = (passedCriteria / totalCriteria) * 100
  
  const acceptanceCriteria = [
    {
      criteria: 'Bug #1: Surrogate Pair Detection',
      target: '100% accuracy',
      actual: bugFixes[0].fixed ? '100%' : 'Failed',
      passed: bugFixes[0].fixed,
    },
    {
      criteria: 'Bug #2: Multi-Instance Isolation',
      target: 'Complete isolation',
      actual: bugFixes[1].fixed ? 'Isolated' : 'Failed',
      passed: bugFixes[1].fixed,
    },
    {
      criteria: 'Bug #3: Long Text Performance',
      target: '<100ms',
      actual: optimized.bugValidation.longTextPerformance.details.timeMs,
      passed: bugFixes[2].fixed,
    },
    {
      criteria: 'ASCII Performance Improvement',
      target: '>+50%',
      actual: textProcessing[0].changePercent.toFixed(1) + '%',
      passed: textProcessing[0].passed,
    },
    {
      criteria: 'Cache Hit Rate Improvement',
      target: '>+20%',
      actual: cachePerformance[0].changePercent.toFixed(1) + '%',
      passed: cachePerformance[0].passed,
    },
    {
      criteria: 'Memory Increase',
      target: '<2MB',
      actual: (memoryPerformance[0].change / (1024 * 1024)).toFixed(2) + 'MB',
      passed: memoryPerformance[0].passed,
    },
  ]
  
  return {
    summary: {
      overallPerformanceGain: overallGain,
      bugsFixed,
      regressionsDetected: regressions.length,
      acceptancePassed: totalScore >= 80 && bugsFixed === 3,
      totalScore,
    },
    detailed: {
      textProcessing,
      cachePerformance,
      renderingPerformance,
      virtualScrollPerformance,
      memoryPerformance,
    },
    bugFixes,
    regressionAnalysis: {
      performanceRegressions: regressions,
      memoryRegressions: memoryPerformance.filter((m) => !m.improvement),
    },
    acceptanceCriteria,
  }
}

// CLI 入口
async function main() {
  try {
    const dataDir = path.join(process.cwd(), '.performance-data')
    
    // 读取基线和优化数据
    const baselinePath = path.join(dataDir, 'baseline-latest.json')
    const optimizedPath = path.join(dataDir, 'optimized-latest.json')
    
    console.log('📊 Comparing performance data...')
    console.log(`Baseline: ${baselinePath}`)
    console.log(`Optimized: ${optimizedPath}`)
    
    const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8'))
    const optimized = JSON.parse(await fs.readFile(optimizedPath, 'utf-8'))
    
    const report = generateComparisonReport(baseline, optimized)
    
    // 保存报告
    const reportPath = path.join(dataDir, `comparison-${Date.now()}.json`)
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
    
    console.log('\n✅ Comparison report generated!')
    console.log(`📁 Report: ${reportPath}`)
    
    // 输出摘要
    console.log('\n📈 Summary:')
    console.log(`  Overall Performance Gain: ${report.summary.overallPerformanceGain.toFixed(1)}%`)
    console.log(`  Bugs Fixed: ${report.summary.bugsFixed}/3`)
    console.log(`  Regressions Detected: ${report.summary.regressionsDetected}`)
    console.log(`  Total Score: ${report.summary.totalScore.toFixed(1)}/100`)
    console.log(`  Acceptance: ${report.summary.acceptancePassed ? '✅ PASSED' : '❌ FAILED'}`)
    
  } catch (error) {
    console.error('❌ Error comparing performance:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

