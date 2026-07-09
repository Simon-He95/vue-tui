#!/usr/bin/env tsx
/**
 * 优化后性能数据收集脚本
 * 使用与 baseline 相同的测试逻辑，用于对比分析
 */

import { collectBaselineData } from './collect-baseline'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

async function main() {
  try {
    console.log('📊 Collecting optimized performance data...')
    
    const data = await collectBaselineData()
    
    // 创建输出目录
    const outputDir = path.join(process.cwd(), '.performance-data')
    await fs.mkdir(outputDir, { recursive: true })
    
    // 保存数据
    const filename = `optimized-${Date.now()}.json`
    const filepath = path.join(outputDir, filename)
    await fs.writeFile(filepath, JSON.stringify(data, null, 2))
    
    console.log('\n✅ Optimized data collected successfully!')
    console.log(`📁 Saved to: ${filepath}`)
    
    // 同时保存为最新优化版本
    const latestPath = path.join(outputDir, 'optimized-latest.json')
    await fs.writeFile(latestPath, JSON.stringify(data, null, 2))
    console.log(`📁 Latest: ${latestPath}`)
    
  } catch (error) {
    console.error('❌ Error collecting optimized data:', error)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
