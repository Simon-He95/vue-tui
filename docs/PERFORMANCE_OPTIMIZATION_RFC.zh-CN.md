# vue-tui 性能优化 RFC

**文档类型**: RFC / 草案  
**状态**: 待实施  
**创建日期**: 2026-07-09  
**审查团队**: 7 位专业 agents 深度分析

---

## 📋 执行摘要

本 RFC 基于 7 位专业 agents 对 vue-tui 代码库的深度审查，提出了性能优化方向和实施建议。

**重要说明**: 
- ✅ 本文档是**优化方向草案**，非最终实施方案
- ⚠️ 所有诊断和收益预期基于代码审查，需要真实 baseline 数据验证
- 📊 后续应拆分为多个小 PR，每个 PR 配真实性能数据

---

## 🎯 审查发现

### 审查范围

- **代码量**: 7328 行核心代码
- **审查时长**: 4+ 小时
- **审查团队**: 
  - Marcus & Elena: 性能分析
  - Alex: 边界情况
  - Victor: 风险评估
  - Chen: 实施难度
  - Sophia: 虚拟滚动
  - Maya: 可观测性

---

## 🔍 发现的潜在问题

### 问题 #1: 补充平面 CJK 宽度覆盖不足

**修正后的诊断**（基于 review 反馈）:

原诊断错误地认为 `isAscii()` 会误判代理对。实际上代理对的 UTF-16 code unit (0xD800-0xDFFF) 一定 > 0x7F，不会被当作 ASCII。

**真正的问题**:

`charCellWidth` 的 fullwidth 范围主要覆盖 BMP 内的 CJK 区间，对补充平面的 CJK 扩展字符（如 `𠮷`、CJK Extension B/C 等）可能计算不准确。

```typescript
// src/core/buffer/width.ts
// 当前 isFullWidthCodePoint 使用快速拒绝:
if (codePoint > 0xffe6) return false;
// 这会排除很多补充平面 CJK (0x20000-0x3FFFD)
```

**建议方向**:
1. 引入/生成 Unicode East Asian Width 表
2. 维护补充平面 CJK 区间 (0x20000-0x3FFFD)
3. 确保 emoji、VS16、keycap、ZWJ grapheme 继续走 grapheme-safe 路径
4. 在现有 `unicode-width.test.ts` 基础上补充测试用例

**优先级**: P1 (功能正确性)  
**预期难度**: 中等  
**建议实施**: 独立 PR，不依赖性能优化

---

### 问题 #2: 缓存策略可能的改进空间（需数据验证）

**当前状态**:

```typescript
// src/core/buffer/buffer.ts
const cellCacheWidth1 = new WeakMap<Style, Map<string, Cell>>();
const cellCacheWidth2 = new WeakMap<Style, Map<string, Cell>>();

// 每个 style 最多缓存 128 个字符
const MAX_CACHED_CELLS_PER_STYLE = 128;

// 超过上限时全部清空
if (map.size > MAX_CACHED_CELLS_PER_STYLE) map.clear();
```

**潜在问题**:
1. 清空策略可能导致缓存抖动
2. 128 的上限对 CJK 场景可能偏小
3. 缺少缓存命中率监控

**建议方向**（需验证）:

```typescript
// 方案 A: 简单调大上限 (Quick Win)
const MAX_CACHED_CELLS_PER_STYLE = 512; // 原 128

// 方案 B: 每个 style 内部的 LRU (如果方案 A 不够)
// 注意: 外层 WeakMap 不可遍历，但内层 Map 可以
function evictOldestInStyleMap(map: Map<string, Cell>, keepRatio = 0.75) {
  const toDelete = Math.floor(map.size * (1 - keepRatio));
  const keys = Array.from(map.keys());
  for (let i = 0; i < toDelete; i++) {
    map.delete(keys[i]);
  }
}
```

**优先级**: P2 (性能优化，需先证明是瓶颈)  
**建议实施**: 
1. 先收集真实缓存命中率数据
2. 如果命中率 < 70%，尝试方案 A
3. 如果方案 A 后仍 < 80%，考虑方案 B

---

### 问题 #3: Provider-Aware 缓存策略（Future Consideration）

**当前状态**:

```typescript
// src/vue/utils/text.ts
const renderPassTextWidthCache = new Map<string, number>(); // 全局
const textWidthProviderStack: WidthProvider[] = []; // 全局
```

**潜在风险** (review 指出需要证据):

当前默认文本宽度缓存只对 `"default"` 和 `"narrow-ambiguous"` 启用，这两个 provider 对 ambiguous 字符的宽度规则相同。真正有差异的 `"cjk"` provider 不走默认缓存。

**因此当前可能不存在实际污染问题。**

**建议方向**（如果未来引入更多 provider）:

```typescript
// 选项 A: Provider 作为缓存 key 的一部分
type BuiltinProviderKey = "default" | "narrow-ambiguous" | "cjk";
const builtinTextWidthCaches = new Map<BuiltinProviderKey, Map<string, number>>();

// 选项 B: WeakMap 用于 function provider
const functionProviderCaches = new WeakMap<WidthProviderFn, Map<string, number>>();
```

**优先级**: P3 (未来考虑，需要先证明存在问题)  
**建议实施**: 仅在可以复现缓存污染时实施

---

### 问题 #4: 长文本性能（需要 Grapheme-Safe 方案）

**确认的问题**:

非 ASCII 长文本（CJK、emoji、混合文本）在 `textCellWidth` 中需要完整的 grapheme 分割和宽度计算，性能可能不佳。

**错误的方案** (已在 review 中指出):

```typescript
// ❌ 不能这样做 - 会破坏 grapheme
const SEGMENT_SIZE = 256;
for (let i = 0; i < text.length; i += SEGMENT_SIZE) {
  total += textCellWidth(text.slice(i, i + SEGMENT_SIZE));
}
```

这会切断代理对、组合字符、ZWJ emoji、variation selector 等。

**正确的方向**:

```typescript
// 方案 A: ASCII fast path (已存在)
if (isAscii(text)) return text.length;

// 方案 B: 不缓存超长唯一字符串
const MAX_CACHEABLE_TEXT_LENGTH = 1000;
if (text.length > MAX_CACHEABLE_TEXT_LENGTH) {
  return computeWidthNoGlobalCache(text, provider);
}

// 方案 C: Grapheme-aware 分段 (如果需要)
// 必须基于 segmentedGraphemes 的结果分块
const segments = segmentedGraphemes(text);
let width = 0;
for (let i = 0; i < segments.length; i += SEGMENT_SIZE) {
  const chunk = segments.slice(i, i + SEGMENT_SIZE);
  width += computeChunkWidth(chunk, provider);
}
```

**优先级**: P2 (性能优化)  
**建议实施**:
1. 先用 profiler 确认 `textCellWidth` 是热点
2. 收集真实长文本场景数据
3. 优先尝试方案 B（不缓存超长文本）
4. 仅在必要时实施方案 C

---

## 📊 收益预期修正

### 原预期 vs 修正后预期

| 指标 | 原预期 | 修正后 | 说明 |
|------|--------|--------|------|
| 整体性能 | 3-7x | **待验证** | 需要真实 baseline |
| ASCII 文本 | 5x | **待验证** | Fast path 已大量存在 |
| 缓存命中率 | +80% | **+10-30%** | 需要真实数据验证 |
| 内存占用 | -38% | **待验证** | 依赖实施方案 |

### 保守目标（基于 review 建议）

```text
P0: 不引入功能回退或性能回退
P1: 在现有 benchmark 中关键路径 p50/p95 不下降
P2: 如果 profiler 确认某个函数是 top hotspot，该函数提升 20-50%
```

---

## 🛠️ 建议的实施路线

### Phase 1: 功能正确性修复

**PR #1: Unicode Width Correctness**

- 修复补充平面 CJK / East Asian Width 覆盖
- 添加确定性测试（`𠮷`、CJK Extension B/C 等）
- 不涉及性能优化
- **验收**: 新增测试通过，现有测试不失败

---

### Phase 2: 真实性能基线

**PR #2: Real Baseline Benchmark**

- 基于现有脚本（`bench:baseline`、`bench:dom-renderer` 等）
- 收集真实场景数据，不使用 mock
- 输出格式化 JSON（环境、commit、warmup、samples、p50/p95）
- **验收**: 可重复运行，数据稳定

---

### Phase 3: 低风险 Quick Wins

**PR #3: Cache Parameter Tuning**

- 调整缓存上限（`MAX_CACHED_CELLS_PER_STYLE` 等）
- 配真实 benchmark 验证收益
- 不引入复杂 LRU
- **验收**: 缓存命中率提升 > 10%，无性能回退

---

### Phase 4: 按需优化（基于 Profiler 数据）

**PR #4: Long Text Strategy** (如果 profiler 显示需要)

- 实现 `MAX_CACHEABLE_TEXT_LENGTH`
- 或 grapheme-safe chunking
- **验收**: 不拆 grapheme，长文本场景更稳定

**PR #5: Provider-Aware Cache** (如果可证明污染)

- 实现缓存分桶
- **验收**: 可复现的污染场景被修复

**PR #6: Virtual Scroll Optimizations** (如果 profiler 显示需要)

- 基于 Sophia 的分析
- **验收**: 虚拟滚动场景 FPS 稳定提升

---

## ⚠️ 需要避免的陷阱

### 1. 诊断错误

❌ **错误**: "代理对被误判为 ASCII"  
✅ **正确**: "补充平面 CJK 宽度覆盖不足"

### 2. 破坏 Unicode 完整性

❌ **错误**: 按 UTF-16 index 直接切分文本  
✅ **正确**: 基于 grapheme 边界切分

### 3. 过度优化

❌ **错误**: 没有数据支持就实施复杂优化  
✅ **正确**: Profiler 先行，数据驱动决策

### 4. Mock 验收系统

❌ **错误**: 硬编码假数据冒充真实 benchmark  
✅ **正确**: 基于真实代码路径的性能测试

---

## 📋 监控建议

### 缓存监控（Maya 的建议）

```typescript
// 开发模式下添加统计
if (process.env.NODE_ENV === 'development') {
  let cellCacheHits = 0;
  let cellCacheMisses = 0;
  
  export function getCellCacheStats() {
    return {
      hits: cellCacheHits,
      misses: cellCacheMisses,
      hitRate: cellCacheHits / (cellCacheHits + cellCacheMisses) || 0,
    };
  }
}
```

### 性能监控扩展

```typescript
export type FramePerfSample = {
  // 现有字段...
  
  // 可选：优化相关指标
  cacheMissRate?: number;
  asciiTextRatio?: number;
  longTextCount?: number;
};
```

---

## 🎓 经验教训

### 从这次 Review 学到的

1. ✅ **代码审查必不可少** - AI 分析可能误判根因
2. ✅ **真实数据优先于假设** - 不要基于假设设定目标
3. ✅ **小步快跑** - 拆分 PR 比大 PR 更安全
4. ✅ **功能优先于性能** - 先修复正确性问题
5. ✅ **验证优先于实施** - Profiler 数据驱动优化

### Review 指出的关键问题

- Bug #1 根因判断错误 ✅ 已修正
- Bug #2 缺少证据 ✅ 已降级
- 验收脚本是 mock ✅ 已删除
- 测试用例有错误 ✅ 已删除
- 收益预期过高 ✅ 已调整

---

## 🔗 参考资料

### 审查报告
- [ULTIMATE_REVIEW_CONCLUSION.zh-CN.md](./ULTIMATE_REVIEW_CONCLUSION.zh-CN.md) - 5 agents 综合结论
- [COMPREHENSIVE_REVIEW_REPORT.zh-CN.md](./COMPREHENSIVE_REVIEW_REPORT.zh-CN.md) - 详细审查
- [VIRTUAL_SCROLL_OPTIMIZATION_REVIEW.md](./VIRTUAL_SCROLL_OPTIMIZATION_REVIEW.md) - Sophia 虚拟滚动分析

### 相关测试
- `test/core/buffer/unicode-width.test.ts` - 现有 Unicode 测试
- `scripts/bench-*.ts` - 现有性能基准脚本

---

## ✅ 下一步行动

1. **立即**: 合并本 RFC，作为优化方向参考
2. **Week 1**: 实施 PR #1 (Unicode Correctness)
3. **Week 2**: 实施 PR #2 (Real Baseline)
4. **Week 3**: 根据 baseline 数据决定 Quick Wins
5. **Week 4+**: 基于 profiler 数据按需优化

---

**文档状态**: ✅ RFC / 草案  
**实施状态**: ⏳ 待实施  
**验证方式**: 真实 baseline + profiler 数据驱动  

**审查团队**: 7 agents + 1 人工 reviewer  
**最后更新**: 2026-07-09（基于 review 反馈修正）
