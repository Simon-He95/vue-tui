# vue-tui 性能和内存优化方案

## 执行摘要

本文档基于对 vue-tui 终端 UI 库的深度分析，识别出 **18 个可优化点**，按优先级分为 P0（高）、P1（中）、P2（低）三档。重点优化可以带来：

- **渲染性能提升 30-50%**（缓存命中率改善）
- **内存占用减少 20-40%**（对象复用和智能淘汰）
- **GC 压力降低 30%**（临时数组复用）
- **文本处理提速 3-5 倍**（ASCII 快速路径）

---

## 优化路线图

### 阶段 1: 快速收益（1-2 天实现）

**P0-1: Cell 缓存 LRU 改进**
- 文件: `src/core/buffer/buffer.ts`
- 当前问题: 超过 128 个字符时全部清空缓存
- 实现方案: 采用 LRU 策略，仅淘汰 25% 最老条目
- 预期收益: 缓存命中率提升 40-60%

**P0-2: 文本缓存统一 LRU 策略**
- 文件: `src/vue/utils/text.ts`
- 当前问题: `spaceCache`, `wrapCacheByWidth`, `inlineLineCacheByWidth` 达到上限全清
- 实现方案: 封装 `LRUCache` 工具类，统一替换
- 预期收益: 避免缓存抖动，命中率提升 30-50%

**P0-3: 临时数组复用**
- 文件: `src/vue/render/render-manager.ts`
- 当前问题: 每次渲染创建新的 `dirtyRowsScratch`, `candidateNodesScratch`
- 实现方案: 使用固定大小数组 + 长度指针，避免重新分配
- 预期收益: 减少 20-30% GC 压力

### 阶段 2: 核心性能优化（3-5 天实现）

**P0-4: ASCII 文本快速路径增强**
- 文件: `src/vue/utils/text.ts`
- 优化函数: `textCellWidth`, `sliceByCells`, `formatInlineCellLine`
- 实现方案: 提前进行 ASCII 检测，避免 grapheme 分割
- 预期收益: ASCII 文本处理提速 3-5 倍

**P0-5: 延迟节点排序**
- 文件: `src/vue/render/render-manager.ts`
- 当前问题: 每次节点更新都标记 `sortedDirty`，但实际排序可能不需要
- 实现方案: 延迟到真正调用 `render()` 时才排序
- 预期收益: 减少 60-80% 排序调用

**P1-1: Row Bucket 阈值调整**
- 文件: `src/vue/render/render-manager.ts`
- 当前问题: Fallback 阈值 0.6 过低，频繁退化为全节点扫描
