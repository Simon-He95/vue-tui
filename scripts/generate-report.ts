#!/usr/bin/env tsx
/**
 * 生成 Markdown 格式的验收报告
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

interface ComparisonReport {
  summary: any
  detailed: any
  bugFixes: any[]
  regressionAnalysis: any
  acceptanceCriteria: any[]
}

function formatNumber(num: number, decimals = 2): string {
  return num.toFixed(decimals)
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

function formatStatus(passed: boolean): string {
  return passed ? '✅' : '❌'
}

function formatChange(change: number, isTime = true): string {
  const sign = change > 0 ? '+' : ''
  const suffix = isTime ? 'ms' : '%'
  return `${sign}${formatNumber(change)}${suffix}`
}

export function generateMarkdownReport(
  report: ComparisonReport,
  baseline: any,
  optimized: any,
): string {
  const date = new Date().toLocaleDateString('zh-CN')
  const time = new Date().toLocaleTimeString('zh-CN')
  
  let md = `# vue-tui 优化方案验收报告\n\n`
  
  // 执行摘要
  md += `## 执行摘要\n\n`
  md += `- **验收日期**: ${date} ${time}\n`
  md += `- **基线版本**: ${baseline.version} (${baseline.commit.substring(0, 7)})\n`
  md += `- **优化版本**: ${optimized.version} (${optimized.commit.substring(0, 7)})\n`
  md += `- **测试环境**: ${baseline.environment.platform}/${baseline.environment.arch}, Node ${baseline.environment.nodeVersion}\n`
  md += `- **总体结果**: ${report.summary.acceptancePassed ? '✅ **通过**' : '❌ **失败**'}\n`
  md += `- **总分**: ${formatNumber(report.summary.totalScore)}/100\n\n`
  
  md += `### 关键指标\n\n`
  md += `- 总体性能提升: **${formatNumber(report.summary.overallPerformanceGain)}%**\n`
  md += `- Bug 修复数: **${report.summary.bugsFixed}/3**\n`
  md += `- 性能回退数: **${report.summary.regressionsDetected}**\n\n`
  
  md += `---\n\n`
  
  // Bug 修复验证
  md += `## 1. Bug 修复验证\n\n`
  
  report.bugFixes.forEach((bug: any, index: number) => {
    md += `### Bug #${index + 1}: ${bug.bugName}\n\n`
    md += `- **修复前状态**: ${bug.details.baseline.message}\n`
    md += `- **修复后状态**: ${bug.details.optimized.message}\n`
    md += `- **修复结果**: ${bug.fixed ? '✅ 已修复' : '❌ 未修复'}\n`
    md += `- **详细信息**:\n`
    md += `  - 基线: \`${JSON.stringify(bug.details.baseline.details)}\`\n`
    md += `  - 优化: \`${JSON.stringify(bug.details.optimized.details)}\`\n`
    md += `- **验收结论**: ${formatStatus(bug.fixed)}\n\n`
  })
  
  md += `---\n\n`
  
  // 性能优化验证
  md += `## 2. 性能优化验证\n\n`
  
  // 文本处理性能
  md += `### 2.1 文本处理性能\n\n`
  md += `| 场景 | 基线 (ms) | 优化后 (ms) | 变化 | 提升 | 目标 | 状态 |\n`
  md += `|------|-----------|-------------|------|------|------|------|\n`
  
  report.detailed.textProcessing.forEach((result: any) => {
    const scenario = result.metric.replace('Text Processing: ', '')
    md += `| ${scenario} | ${formatNumber(result.baseline)} | ${formatNumber(result.optimized)} | ${formatChange(result.change)} | ${formatNumber(Math.abs(result.changePercent))}% | ${result.threshold || 'N/A'} | ${formatStatus(result.passed)} |\n`
  })
  
  md += `\n`
  
  // 缓存性能
  md += `### 2.2 缓存性能\n\n`
  md += `| 指标 | 基线 | 优化后 | 变化 | 目标 | 状态 |\n`
  md += `|------|------|--------|------|------|------|\n`
  
  report.detailed.cachePerformance.forEach((result: any) => {
    const metric = result.metric.replace('Cache: ', '')
    const unit = metric.includes('Rate') ? '%' : '/s'
    md += `| ${metric} | ${formatNumber(result.baseline)}${unit} |`
  report.detailed.cachePerformance.forEach((result: any) => {
    const metric = result.metric.replace('Cache: ', '')
    const unit = metric.includes('Rate') ? '%' : '/s'
    md += `| ${metric} | ${formatNumber(result.baseline)}${unit} | ${formatNumber(result.optimized)}${unit} | ${formatNumber(result.change)}${unit} | ${result.threshold}${unit.includes('Rate') ? '%' : ''} | ${formatStatus(result.passed)} |\n`
  })
  
  md += `\n`
  
  // 渲染性能
  md += `### 2.3 渲染性能\n\n`
  md += `| 场景 | 基线 (ms) | 优化后 (ms) | 变化 | 提升 | 状态 |\n`
  md += `|------|-----------|-------------|------|------|------|\n`
  
  report.detailed.renderingPerformance.forEach((result: any) => {
    const scenario = result.metric.replace('Rendering: ', '')
    md += `| ${scenario} | ${formatNumber(result.baseline)} | ${formatNumber(result.optimized)} | ${formatChange(result.change)} | ${formatNumber(Math.abs(result.changePercent))}% | ${formatStatus(result.passed)} |\n`
  })
  
  md += `\n`
  
  // 虚拟滚动性能
  md += `### 2.4 虚拟滚动性能\n\n`
  md += `| 场景 | 基线 (ms) | 优化后 (ms) | 变化 | 提升 | 状态 |\n`
  md += `|------|-----------|-------------|------|------|------|\n`
  
  report.detailed.virtualScrollPerformance.forEach((result: any) => {
    const scenario = result.metric.replace('Virtual Scroll: ', '')
    md += `| ${scenario} | ${formatNumber(result.baseline)} | ${formatNumber(result.optimized)} | ${formatChange(result.change)} | ${formatNumber(Math.abs(result.changePercent))}% | ${formatStatus(result.passed)} |\n`
  })
  
  md += `\n`
  
  // 内存性能
  md += `### 2.5 内存性能\n\n`
  md += `| 指标 | 基线 | 优化后 | 变化 | 状态 |\n`
  md += `|------|------|--------|------|------|\n`
  
  report.detailed.memoryPerformance.forEach((result: any) => {
    const metric = result.metric.replace('Memory: ', '')
    md += `| ${metric} | ${formatBytes(result.baseline)} | ${formatBytes(result.optimized)} | ${formatBytes(result.change)} | ${formatStatus(result.passed)} |\n`
  })
  
  md += `\n`
  md += `---\n\n`
  
  // 破坏性变更检测
  md += `## 3. 破坏性变更检测\n\n`
  md += `### 3.1 性能回退检测\n\n`
  
  if (report.regressionAnalysis.performanceRegressions.length === 0) {
    md += `✅ **未检测到性能回退**\n\n`
  } else {
    md += `⚠️ **检测到 ${report.regressionAnalysis.performanceRegressions.length} 项性能回退**\n\n`
    md += `| 指标 | 基线 | 优化后 | 变化 |\n`
    md += `|------|------|--------|------|\n`
    
    report.regressionAnalysis.performanceRegressions.forEach((reg: any) => {
      md += `| ${reg.metric} | ${formatNumber(reg.baseline)} | ${formatNumber(reg.optimized)} | ${formatChange(reg.change)} (${formatNumber(reg.changePercent)}%) |\n`
    })
    md += `\n`
  }
  
  md += `---\n\n`
  
  // 验收标准评估
  md += `## 4. 验收标准评估\n\n`
  md += `| 验收项 | 目标 | 实际 | 状态 |\n`
  md += `|--------|------|------|------|\n`
  
  report.acceptanceCriteria.forEach((criteria: any) => {
    md += `| ${criteria.criteria} | ${criteria.target} | ${criteria.actual} | ${formatStatus(criteria.passed)} |\n`
  })
  
  md += `\n`
  md += `---\n\n`
  
  // 风险和问题
  md += `## 5. 风险和问题\n\n`
  
  const failedCriteria = report.acceptanceCriteria.filter((c: any) => !c.passed)
  
  if (failedCriteria.length === 0 && report.summary.regressionsDetected === 0) {
    md += `✅ **未发现问题**\n\n`
  } else {
    md += `### 未通过的验收项\n\n`
    failedCriteria.forEach((criteria: any) => {
      md += `- ❌ **${criteria.criteria}**: 目标 ${criteria.target}, 实际 ${criteria.actual}\n`
    })
    
    if (report.summary.regressionsDetected > 0) {
      md += `\n### 性能回退\n\n`
      md += `- 检测到 ${report.summary.regressionsDetected} 项性能指标下降\n`
      md += `- 建议审查相关优化代码\n`
    }
    
    md += `\n`
  }
  
  md += `### 建议的后续行动\n\n`
  
  if (report.summary.acceptancePassed) {
    md += `- ✅ 所有验收标准通过，建议批准发布\n`
    md += `- 建议进行最终的集成测试和回归测试\n`
  } else {
    md += `- ❌ 部分验收标准未通过，需要进一步优化\n`
    failedCriteria.forEach((criteria: any) => {
      md += `  - 修复: ${criteria.criteria}\n`
    })
  }
  
  md += `\n`
  md += `---\n\n`
  
  // 最终验收决策
  md += `## 6. 最终验收决策\n\n`
  md += `- **总体评分**: ${formatNumber(report.summary.totalScore)}/100\n`
  md += `- **验收结论**: ${report.summary.acceptancePassed ? '✅ **通过**' : report.summary.totalScore >= 70 ? '⚠️ **有条件通过**' : '❌ **不通过**'}\n`
  md += `- **批准发布**: ${report.summary.acceptancePassed ? '**是**' : '**否**'}\n\n`
  
  if (report.summary.totalScore >= 70 && !report.summary.acceptancePassed) {
    md += `> ⚠️ **有条件通过说明**: 虽然部分指标未达到目标，但整体得分超过 70 分，建议在修复关键问题后发布。\n\n`
  }
  
  md += `---\n\n`
  md += `**报告生成时间**: ${new Date().toISOString()}\n`
  
  return md
}

// CLI 入口
async function main() {
  try {
    const dataDir = path.join(process.cwd(), '.performance-data')
    
    // 读取数据
    const baselinePath = path.join(dataDir, 'baseline-latest.json')
    const optimizedPath = path.join(dataDir, 'optimized-latest.json')
    const comparisonFiles = (await fs.readdir(dataDir))
      .filter((f: string) => f.startsWith('comparison-'))
      .sort()
      .reverse()
    
    if (comparisonFiles.length === 0) {
      throw new Error('No comparison report found. Run compare-performance.ts first.')
    }
    
    const comparisonPath = path.join(dataDir, comparisonFiles[0])
    
    console.log('📄 Generating acceptance report...')
    
    const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8'))
    const optimized = JSON.parse(await fs.readFile(optimizedPath, 'utf-8'))
    const comparison = JSON.parse(await fs.readFile(comparisonPath, 'utf-8'))
    
    const markdown = generateMarkdownReport(comparison, baseline, optimized)
    
    // 保存报告
    const reportPath = path.join(dataDir, `acceptance-report-${Date.now()}.md`)
    await fs.writeFile(reportPath, markdown)
    
    console.log('\n✅ Acceptance report generated!')
    console.log(`📁 Report: ${reportPath}`)
    
  } catch (error) {
    console.error('❌ Error generating report:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
