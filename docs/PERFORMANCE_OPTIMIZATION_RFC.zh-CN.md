# vue-tui 性能优化 RFC

**文档类型**: RFC / 草案  
**状态**: 待实施  
**创建日期**: 2026-07-09  
**修订版本**: v3 (基于三轮 review 反馈)

---

## 📋 执行摘要

本 RFC 基于代码审查和多轮 review 反馈，提出 vue-tui 性能优化方向和实施建议。

**重要说明**:

- ✅ 本文档是**优化方向草案**，非最终实施方案
- ⚠️ 所有诊断和收益预期基于代码审查，需要真实 baseline 数据验证
- 📊 后续应拆分为多个小 PR，每个 PR 配真实性能数据

---

## 🔍 发现的潜在问题

### 问题 #1: 补充平面 CJK 宽度覆盖不足

**根因诊断**:

当前 `isFullWidthCodePoint` 的 fast reject:

```typescript
// src/core/buffer/width.ts
if (codePoint < 0x1100 || codePoint > 0xffe6) return false;
```

这会将 `𠮷` (U+20BB7) 等补充平面 CJK 扩展字符直接排除，导致宽度计算错误。

**建议方向**:

使用 Unicode `EastAsianWidth.txt` 生成/维护 `W/F` 范围表，并保留当前对 emoji、VS16、ambiguous、box drawing 等 terminal-specific tailoring。

参考: [Unicode Annex #11: East Asian Width](https://www.unicode.org/reports/tr11/)

**测试建议**:

```typescript
// CJK Extensions 基本测试
expect(charCellWidth("𠮷")).toBe(2); // U+20BB7, Ext B
expect(textCellWidth("𠮷x")).toBe(3);
expect(sliceByCells("𠮷x", 1)).toBe("");
expect(sliceByCells("𠮷x", 2)).toBe("𠮷");

// 终端集成测试
terminal.write("𠮷x", { x: 0, y: 0 });
expect(terminal.getCell(0, 0).ch).toBe("𠮷");
expect(terminal.getCell(0, 0).width).toBe(2);
expect(terminal.getCell(1, 0).continuation).toBe(true);
expect(terminal.getCell(2, 0).ch).toBe("x");

// 反例：非 CJK 补充平面字符
expect(charCellWidth("𝄞")).toBe(1); // U+1D11E musical symbol

// 其他 CJK 扩展区代表字符
expect(charCellWidth("\u{2A700}")).toBe(2); // Ext C
expect(charCellWidth("\u{2B740}")).toBe(2); // Ext D
expect(charCellWidth("\u{2CEB0}")).toBe(2); // Ext E
expect(charCellWidth("\u{2EBF0}")).toBe(2); // Ext F
expect(charCellWidth("\u{30000}")).toBe(2); // Ext G
expect(charCellWidth("\u{31350}")).toBe(2); // Ext H
```

**优先级**: P1 (功能正确性)  
**预期难度**: 中等  
**建议实施**: 独立 PR，不依赖性能优化

---

### 问题 #2: Cell 缓存策略可能的改进空间

**当前状态**:

```typescript
// src/core/buffer/buffer.ts
const cellCacheWidth1 = new WeakMap<Style, Map<string, Cell>>();
const cellCacheWidth2 = new WeakMap<Style, Map<string, Cell>>();

const MAX_CACHED_CELLS_PER_STYLE = 128;

// 超过上限时全部清空
if (map.size > MAX_CACHED_CELLS_PER_STYLE) map.clear();
```

**关键事实**:

`createCell` 流程是:

1. 先调用 `charCellWidth(ch, widthProvider)` 计算宽度
2. 根据 width 选择 width1/width2 cache
3. 查找或创建 Cell 对象

**因此，这个 cache 优化主要减少 `Cell` 对象分配和对象复用，不直接减少宽度计算成本。**

**建议方向**:

```typescript
// 方案 A: 简单调大上限 (Quick Win)
const MAX_CACHED_CELLS_PER_STYLE = 512; // 原 128

// 方案 B: 部分淘汰 (如果方案 A 不够)
// 注意: 外层 WeakMap 不可遍历，但内层 Map 可以
function evictOldestInStyleMap(map: Map<string, Cell>, keepRatio = 0.75) {
  const toDelete = Math.floor(map.size * (1 - keepRatio));
  const keys = Array.from(map.keys());
  for (let i = 0; i < toDelete; i++) {
    map.delete(keys[i]);
  }
}
```

**验收标准**（不只是 hit rate）:

- `createCell` 调用次数
- `Cell` 新建次数
- `map.clear()` 次数
- width1/width2 cache hit/miss
- p50/p95 渲染耗时
- heap delta / retained memory
- LRU 或 partial eviction 的额外开销

**门槛**: 只有当 cache miss 对 p95 或 allocation pressure 有**可见影响**时才优化；hit rate 只是辅助指标。

**优先级**: P2 (性能优化，需先证明是瓶颈)

---

### 问题 #3: Provider-Aware 缓存策略 (Future Consideration)

**当前状态**:

```typescript
// src/vue/utils/text.ts
const renderPassTextWidthCache = new Map<string, number>(); // 全局
const textWidthProviderStack: WidthProvider[] = []; // 全局
```

源码中 `canUseDefaultTextCache` 只允许 `"default"` 和 `"narrow-ambiguous"` 使用默认 cache。`"cjk"` 和 function provider 不走默认 cache。

当前 `default` 和 `narrow-ambiguous` 对 ambiguous 字符的宽度规则相同，因此**目前没有明确的 provider cache 污染证据**。

**未来考虑**:

如果引入更多 provider 或改变 cache 策略，需要同时审查这些 cache:

- `renderPassTextWidthCache`
- `textWidthCache`
- `inlineLineCacheByWidth`
- `wrapCacheByWidth`

**防回归测试建议**:

```typescript
// 确保 default 和 narrow-ambiguous 一致
expect(textCellWidth("Ω", "default")).toBe(textCellWidth("Ω", "narrow-ambiguous"));

// 确保 cjk 不复用 default cache
clearTextCaches();
expect(textCellWidth("Ω", "default")).toBe(1);
expect(textCellWidth("Ω", "cjk")).toBe(2);
```

**优先级**: P3 (未来考虑，需要先证明存在问题)

---

### 问题 #4: 长文本性能优化方向

**性能分类**:

长文本热点需要区分三类:

1. **ASCII fast path**: 已优化，直接返回 `text.length`
2. **普通非 ASCII**: code point iteration + `charCellWidth`
3. **复杂 grapheme**: ZWJ/VS/combining mark/emoji modifier 等需要 `Intl.Segmenter`

**关键澄清**:

**纯 CJK 长文本不会走完整 grapheme segmentation**。当前 `segmentedGraphemes` 只在检测到 ZWJ、variation selector、combining mark 等情况时才返回 segmenter，否则只用 `for...of` 按 code point 迭代。

真正昂贵的通常是第三类（复杂 grapheme），纯 CJK 的成本主要来自逐 code point 宽度判断和 cache 行为。

**建议方向**:

```typescript
const MAX_GLOBAL_CACHEABLE_TEXT_LENGTH = 1000;
const MAX_RENDER_PASS_CACHEABLE_TEXT_LENGTH = 4000;

// 全局 cache 受长 transcript/日志污染风险高，应限制
const useGlobalCache = useCache && text.length <= MAX_GLOBAL_CACHEABLE_TEXT_LENGTH;

// render-pass cache 只在 render pass 期间存在，风险较小
const useRenderPassCache =
  useCache && renderPassDepth > 0 && text.length <= MAX_RENDER_PASS_CACHEABLE_TEXT_LENGTH;
```

**Grapheme-aware 分块 (如果需要)**:

不要一次性 `Array.from()` 成大数组，使用 streaming chunk:

```typescript
let chunk: string[] = [];
let cells = 0;

forEachGrapheme(text, (g) => {
  chunk.push(g);
  if (chunk.length >= SEGMENT_SIZE) {
    cells += computeChunkWidth(chunk, provider);
    chunk = [];
  }
});

if (chunk.length) {
  cells += computeChunkWidth(chunk, provider);
}
```

**优先级**: P2 (性能优化)  
**建议实施**: Profiler 确认 `textCellWidth` 是热点后再实施

---

## 🛠️ 建议的实施路线

### Phase 1: 功能正确性修复

**PR #1: Unicode Width Correctness**

- 基于 Unicode `EastAsianWidth.txt` 生成/维护 W/F 范围
- 添加补充平面 CJK 测试（Extension B/C/D/E/F/G/H/I）
- 添加非 CJK 补充平面反例（如音乐符号）
- 保留现有 emoji/VS16/keycap/combining mark 测试
- **不涉及性能优化**

**验收**: 新增测试通过，现有测试不失败

---

### Phase 2: 真实性能基线

**PR #2: Real Baseline Benchmark**

**需要新增或包装 baseline harness**，因为现有脚本不统一输出所需格式:

- `check-bench-baselines.ts`: 跑 bench 并检查预算，只打印 pass/fail
- `bench-dom-renderer.ts`: 单次 scenario 测量，非 samples/p50/p95
- `bench-stdout-column-diff.ts`: 输出 table 和 ratio，非 JSON baseline

**建议**: 新增 `pnpm run bench:perf-baseline` harness，复用现有场景，但添加:

```json
{
  "commit": "abc123",
  "node": "v18.19.0",
  "os": "darwin-arm64",
  "warmup": 100,
  "samples": 1000,
  "results": {
    "textCellWidth_ascii_100": {
      "p50": 45,
      "p95": 68,
      "samples": 1000
    },
    "textCellWidth_cjk_100": {
      "p50": 152,
      "p95": 201,
      "samples": 1000
    }
  }
}
```

**验收**: 可重复运行，数据稳定，环境信息完整

---

### Phase 3: 低风险 Quick Wins

**PR #3: Cache Parameter Tuning** (如果 Phase 2 数据显示需要)

```typescript
// 方案 A: 调大上限
const MAX_CACHED_CELLS_PER_STYLE = 512; // 原 128
```

**必需数据**:

- Before/after `createCell` 调用次数
- Before/after `Cell` 新建次数
- Before/after `map.clear()` 次数
- Before/after p50/p95 渲染耗时
- Heap delta

**验收**: Cache miss 对 p95 的影响降低，无内存泄漏

---

### Phase 4: Profiler 驱动优化

**仅在 profiler 证明瓶颈后实施**:

**PR #4: Long Text Strategy** (如果 `textCellWidth` 是 top hotspot)

- 实现 `MAX_GLOBAL/RENDER_PASS_CACHEABLE_TEXT_LENGTH`
- 或 grapheme-safe streaming chunking

**验收**: 不拆 grapheme，长文本场景更稳定，有 before/after 数据

**PR #5: Provider-Aware Cache** (如果可证明污染)

- 实现缓存分桶，覆盖所有相关 cache

**验收**: 可复现的污染场景被修复

**PR #6: Virtual Scroll Optimizations**

- 基于 profiler 数据优化实际瓶颈

**验收**: 滚动场景 FPS 稳定提升，有工作负载描述

---

## ⚠️ 需要避免的陷阱

### 1. Unicode 完整性

❌ **错误**: 只添加 0x20000-0x3FFFD，漏掉其他 Extension  
✅ **正确**: 基于 EastAsianWidth.txt，覆盖所有 W/F 范围

❌ **错误**: 把所有补充平面字符都判宽  
✅ **正确**: 添加非 CJK 补充平面反例测试

### 2. 破坏 Grapheme

❌ **错误**: 按 UTF-16 index 直接切分文本  
✅ **正确**: 基于 grapheme 边界或 streaming chunk

### 3. 过度优化

❌ **错误**: 没有数据支持就实施复杂优化  
✅ **正确**: Profiler 先行，数据驱动决策

### 4. 验收标准不足

❌ **错误**: 只报 cache hit rate 提升  
✅ **正确**: 提供完整指标（allocation、p50/p95、heap delta）

---

## 📋 严格的验收标准

### Correctness PR

- ✅ 基于 EastAsianWidth.txt 的宽度判断
- ✅ 覆盖 Extension B/C/D/E/F/G/H/I 测试
- ✅ 包含非 CJK 补充平面反例
- ✅ 现有 emoji/VS16/grapheme 测试仍通过

### Baseline PR

- ✅ 新增或包装 baseline harness
- ✅ 输出 JSON 包含: commit, Node, OS, warmup, samples, p50/p95
- ✅ 多次运行数据稳定（变异系数 < 10%）

### Cache Tuning PR

- ✅ Before/after createCell/new Cell 次数
- ✅ Before/after map.clear 次数
- ✅ Before/after p50/p95
- ✅ Heap delta 测量
- ✅ 证明 cache miss 对 p95 有可见影响

### Long Text PR

- ✅ Profiler 证明 textCellWidth 是 hotspot
- ✅ Grapheme safety 证明（不拆 ZWJ/combining）
- ✅ Before/after benchmarks
- ✅ CJK/emoji/混合文本测试

### Virtual Scroll PR

- ✅ Profiler 指出具体瓶颈
- ✅ 滚动工作负载描述
- ✅ Dirty rows, candidate fallback 指标
- ✅ FPS 或 frame duration 数据

---

## 🎓 经验教训

### 从三轮 Review 学到的

1. ✅ **根因诊断需要准确** - 不是代理对误判，是补充平面覆盖不足
2. ✅ **区分优化目标** - Cell cache 优化对象分配，不是宽度计算
3. ✅ **理解实际实现** - 纯 CJK 不走完整 grapheme segmentation
4. ✅ **验收标准完整** - 不只是 hit rate，要有完整性能指标
5. ✅ **文档诚实一致** - 不引用已删除的报告

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

**最后更新**: 2026-07-09 (v3, 基于三轮 review 修正)
