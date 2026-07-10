# vue-tui 性能优化 RFC

**文档类型**: RFC / 路线图  
**状态**: Phase 1-3 已完成；Phase 4.0 checkpoint 完成；Phase 4.1+ 待定  
**创建日期**: 2026-07-09  
**最后更新**: 2026-07-10 (Phase 4.0 checkpoint)  
**修订版本**: v5 (Phase roadmap 更新)  
**Unicode 版本**: 17.0.0

---

## Phase Status

| Phase | Scope                              | Status                                | PR   |
| ----- | ---------------------------------- | ------------------------------------- | ---- |
| 1     | Unicode width correctness          | ✅ Complete                           | #114 |
| 2     | Statistical baseline harness       | ✅ Complete                           | #115 |
| 3.1   | Instrumentation foundation         | ✅ Complete                           | #116 |
| 3.2   | Complete instrumentation           | ✅ Complete                           | #117 |
| 4.0   | Cell-cache tuning decision gate    | ✅ Checkpoint: no change              | #118 |
| 4.1   | Targeted cache workload validation | ⏸️ Optional for tuning / deferred     | -    |
| 4.2   | Long-text cache admission          | ⏸️ Not measured                       | -    |
| 4.3   | Provider-aware cache               | ⏸️ No reproducible issue              | -    |
| 4.4   | Virtual-scroll optimization        | ⏸️ Requires browser profiler evidence | -    |
| -     | **Phase 3 disabled-path overhead** | ⚠️ **Required** (independent)         | TBD  |

**Note**: Phase 4.0 completed the Cell-cache tuning decision checkpoint. Current cache implementation unchanged. Comprehensive cache validation (4.1+) and original Phase 4 work (long-text, provider, virtual-scroll) remain deferred or unmeasured.

**Critical**: Phase 3 instrumentation hooks are in production hot paths. Disabled-path overhead validation is required independently of cache tuning decisions.

---

> **Update 2026-07-10**: Phase 4.0 (Cell-Cache Tuning Checkpoint) 完成于 PR #118。决策：基于当前合成工作负载数据，不修改 cache 参数或 eviction 策略。这是有限的决策 checkpoint，不代表全面的 cache 验证。
>
> **Update 2026-07-09**: Phase 1 (Unicode Width Correctness) 已在 PR #114 实现。

## 📋 执行摘要

本 RFC 基于代码审查和多轮 review 反馈，提出 vue-tui 性能优化方向和实施建议。

- ✅ **Phase 1-3 已完成** - Unicode correctness, baseline, instrumentation
- ✅ **Phase 4.0 checkpoint 完成** - Cell-cache 决策：无需调整
- ⏳ **Phase 4.1+ 待实施** - 目标 cache 工作负载（若继续 cache 优化）
- ⚠️ **Phase 3 overhead 验证必需** - 独立于 cache 工作
- 📊 后续优化应拆分为多个小 PR，每个 PR 配真实性能数据
- 📊 所有收益预期基于代码审查，需要真实 baseline 数据验证

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

**基于 Unicode 17.0.0** 的 `EastAsianWidth.txt` 生成/维护 `W/F` 范围表。

**重要说明**: East_Asian_Width 是基础数据，不是现代终端宽度的最终规则。Unicode UAX #11 明确指出 East_Asian_Width 不适合作为现代 terminal emulator 的开箱即用方案，terminal 需要 case-by-case tailoring。

**宽度判断优先级**:

1. Custom widthProvider
2. Grapheme/emoji sequence rules (ZWJ, VS16, keycap, emoji tag sequence)
3. Terminal overrides (box drawing remains narrow)
4. Unicode EastAsianWidth W/F table
5. Ambiguous 仅在 provider === "cjk" 时视为 wide
6. Default fallback: narrow

参考:

- [Unicode Annex #11: East Asian Width](https://www.unicode.org/reports/tr11/)
- [EastAsianWidth.txt (Unicode 17.0.0)](https://www.unicode.org/Public/17.0.0/ucd/EastAsianWidth.txt)
- [Blocks.txt (Unicode 17.0.0)](https://www.unicode.org/Public/17.0.0/ucd/Blocks.txt)

**测试建议** (基于 Unicode 17.0.0):

```typescript
// CJK Extensions 完整覆盖 (Unicode 17.0.0 包含 Extension J)
expect(charCellWidth("\u{20BB7}")).toBe(2); // Ext B
expect(charCellWidth("\u{2A700}")).toBe(2); // Ext C
expect(charCellWidth("\u{2B740}")).toBe(2); // Ext D
expect(charCellWidth("\u{2B820}")).toBe(2); // Ext E
expect(charCellWidth("\u{2CEB0}")).toBe(2); // Ext F
expect(charCellWidth("\u{30000}")).toBe(2); // Ext G (TIP)
expect(charCellWidth("\u{31350}")).toBe(2); // Ext H (TIP)
expect(charCellWidth("\u{2EBF0}")).toBe(2); // Ext I (SIP)
expect(charCellWidth("\u{323B0}")).toBe(2); // Ext J (TIP, Unicode 17.0.0)

// 基本功能测试
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

// 回归测试：现有 tailoring 必须保留
expect(charCellWidth("⏱")).toBe(1); // 无 VS16 时窄
expect(charCellWidth("⏱️")).toBe(2); // 有 VS16 时宽
// Box drawing 在 cjk mode 仍然窄 (现有行为)
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

**建议方向** (需 profiler 验证):

```typescript
// 方案 A: Candidate - 调大上限 (需谨慎评估)
const MAX_CACHED_CELLS_PER_STYLE = 512; // 原 128

// 注意: Cache 按 Style 分桶，width1/width2 各一套
// 如果 live styles 多，512 会增加 retained memory

// 方案 B: FIFO-like partial eviction (如果方案 A 不够)
// 注意: 这不是真 LRU，真 LRU 需要在 get 时 refresh order
function evictOldestInStyleMap(map: Map<string, Cell>, keepRatio = 0.75) {
  const toDelete = Math.floor(map.size * (1 - keepRatio));
  const keys = Array.from(map.keys());
  for (let i = 0; i < toDelete; i++) {
    map.delete(keys[i]);
  }
}
```

**验收标准** (完整指标):

- `createCell` 调用次数
- `Cell` 新建次数
- `map.clear()` 次数
- width1/width2 cache hit/miss
- **Live Style 数量**
- **每个 live Style 下 width1/width2 cache size 分布**
- **Cache 容量调整后的 retained Cell 上限估算**
- p50/p95 渲染耗时
- heap delta / retained memory
- Partial eviction 的额外开销 (如适用)

**门槛**: 只有当 cache miss 对 p95 或 allocation pressure 有**可见影响**时才优化；hit rate 只是辅助指标。

**优先级**: P2 (性能优化，需先 profiler 证明是瓶颈)

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

// Nested provider 场景
clearTextCaches();
withTextRenderPass(() => {
  expect(textCellWidth("Ω", "default")).toBe(1);
  expect(textCellWidth("Ω", "cjk")).toBe(2);
});
withTextRenderPass(() => {
  expect(textCellWidth("Ω", "default")).toBe(1);
});
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

**关于 Chunking**:

当前 `textCellWidth` / `sliceByCells` 已经是 streaming iteration，**不应为了"分块"引入额外 string[] 分配**。

只有在 profiler 证明需要以下目标时才考虑 chunk:

1. 跨 render pass 复用 chunk width
2. 长文本中断/分片计算
3. 避免 wrap/split 产生大中间数组

**验收标准**:

需要 benchmark 两类场景:

```typescript
// Scenario A: unique long text
// 10k 条不同日志，验证 cache 不污染/heap 不膨胀

// Scenario B: repeated long text
// 同一长文本多次渲染，验证限制长度不会误伤真实复用收益
```

**优先级**: P2 (性能优化)  
**建议实施**: Profiler 确认 `textCellWidth` 是热点后再实施

---

## 🛠️ 建议的实施路线

### Phase 1: 功能正确性修复

**PR #1: Unicode Width Correctness**

- 基于 Unicode 17.0.0 `EastAsianWidth.txt` 生成/维护 W/F 范围
- 测试覆盖所有 CJK Extensions (B/C/D/E/F/G/H/I/J)
- 添加非 CJK 补充平面反例（如音乐符号）
- 保留现有 emoji/VS16/keycap/combining mark 测试
- 确保宽度判断优先级正确（custom provider → grapheme → terminal override → EAW table）
- **不涉及性能优化**

**验收**: 新增测试通过，现有测试不失败，回归测试覆盖 tailoring

---

### Phase 2: 真实性能基线

**PR #2: Real Baseline Benchmark**

**需要新增 baseline harness**，因为现有脚本不统一输出所需格式:

- `check-bench-baselines.ts`: 跑 bench 并检查预算，只打印 pass/fail
- `bench-dom-renderer.ts`: 单次 scenario 测量，非 samples/p50/p95
- `bench-stdout-column-diff.ts`: 输出 table 和 ratio，非 JSON baseline

**建议**: 新增 `pnpm run bench:perf-baseline` harness，复用现有场景，输出:

```json
{
  "commit": "abc123",
  "unicodeVersion": "17.0.0",
  "node": "v18.19.0",
  "v8": "10.2.154.26",
  "os": "darwin-arm64",
  "cpu": "Apple M1",
  "warmup": 100,
  "samples": 1000,
  "clock": "process.hrtime.bigint",
  "gc": "--expose-gc (if memory benchmark)",
  "results": {
    "textCellWidth_ascii_100": {
      "p50": 45,
      "p95": 68,
      "p99": 80,
      "mean": 50,
      "stdev": 5,
      "cv": 0.1,
      "samples": 1000
    }
  }
}
```

**注意**: DOM renderer 性能数据应区分 happy-dom 和真实浏览器。声称用户可感知的 DOM 渲染提升时，需补充 Playwright/browser benchmark。

**验收**: 可重复运行，数据稳定（CV < 10%），环境信息完整

---

### Phase 3: 低风险 Candidate Optimizations

**PR #3: Cache Parameter Tuning** (如果 Phase 2 数据显示需要)

仅作为 profiler-driven candidate，不是 quick-win。

**必需数据**:

- Before/after `createCell` 调用次数
- Before/after `Cell` 新建次数
- Before/after `map.clear()` 次数
- Live Style 数量和分布
- 每个 Style 下 cache size 分布
- Before/after p50/p95 渲染耗时
- Heap delta 和 retained Cell 估算

**验收**: Cache miss 对 p95 的影响降低，retained memory 在可接受范围

---

### Phase 4: Profiler 驱动优化

**仅在 profiler 证明瓶颈后实施**:

**PR #4: Long Text Strategy** (如果 `textCellWidth` 是 top hotspot)

- 实现 `MAX_GLOBAL/RENDER_PASS_CACHEABLE_TEXT_LENGTH`
- Benchmark unique vs repeated long text 场景

**验收**: 长文本场景更稳定，有 before/after 数据，heap 不膨胀

**PR #5: Provider-Aware Cache** (如果可证明污染)

- 实现缓存分桶，覆盖所有相关 cache

**验收**: 可复现的污染场景被修复，nested provider 测试通过

**PR #6: Virtual Scroll Optimizations**

- 基于 profiler 数据优化实际瓶颈

**验收**: 滚动场景 FPS 稳定提升，有工作负载描述

---

## ⚠️ 需要避免的陷阱

### 1. Unicode 完整性

❌ **错误**: 只添加部分 Extension，使用过时 Unicode 版本  
✅ **正确**: Pin Unicode 17.0.0，测试所有 Extension (B-J)，添加反例

❌ **错误**: 把所有补充平面字符都判宽  
✅ **正确**: 基于 EastAsianWidth.txt，保留 terminal tailoring 优先级

### 2. 破坏 Grapheme

❌ **错误**: 按 UTF-16 index 直接切分文本  
✅ **正确**: 基于 grapheme 边界

### 3. 过度优化

❌ **错误**: 没有 profiler 数据就调 cache 参数或做 chunking  
✅ **正确**: Profiler 先行，数据驱动决策

### 4. 验收标准不足

❌ **错误**: 只报 cache hit rate 提升  
✅ **正确**: 提供完整指标（live styles、allocation、p50/p95、heap）

---

## 📋 严格的验收标准

### Correctness PR

- ✅ 基于 Unicode 17.0.0 EastAsianWidth.txt
- ✅ 测试覆盖所有 Extension (B/C/D/E/F/G/H/I/J)
- ✅ 包含非 CJK 补充平面反例
- ✅ 回归测试：⏱ vs ⏱️，box drawing 仍窄
- ✅ 现有 emoji/VS16/grapheme 测试仍通过

### Baseline PR

- ✅ 新增 baseline harness (现有脚本不足)
- ✅ JSON 包含: commit, Unicode version, Node, V8, OS, CPU, p50/p95/p99/mean/stdev/CV
- ✅ 多次运行数据稳定（CV < 10%）
- ✅ DOM benchmark 区分 happy-dom vs 真实浏览器

### Cache Tuning PR

- ✅ Profiler 证明 Cell allocation 是瓶颈
- ✅ Before/after: createCell count, new Cell count, map.clear count
- ✅ Live Style 数量和 cache size 分布
- ✅ Retained Cell 上限估算
- ✅ Before/after p50/p95
- ✅ Heap delta 测量

### Long Text PR

- ✅ Profiler 证明 textCellWidth 是 hotspot
- ✅ Benchmark: unique vs repeated long text
- ✅ 证明不污染 global cache
- ✅ Heap 不膨胀

### Virtual Scroll PR

- ✅ Profiler 指出具体瓶颈
- ✅ 滚动工作负载描述
- ✅ Dirty rows, candidate fallback 指标
- ✅ FPS 或 frame duration 数据

---

## 🎓 经验教训

### 从四轮 Review 学到的

1. ✅ **Pin Unicode 版本** - 2026 年应使用 Unicode 17.0.0 (包含 Extension J)
2. ✅ **测试标注准确** - U+2B820 是 Ext E，U+2CEB0 是 Ext F，U+2EBF0 是 Ext I
3. ✅ **EAW 不是 Oracle** - 需要 terminal tailoring 优先级
4. ✅ **Cache 调参需谨慎** - 不是 quick-win，需完整指标
5. ✅ **Chunking 需明确目的** - 不应引入额外分配

---

## ✅ 下一步行动

1. **立即**: 合并本 RFC，作为优化方向参考
2. **Week 1**: 实施 PR #1 (Unicode Correctness, Unicode 17.0.0)
3. **Week 2**: 实施 PR #2 (Real Baseline with harness)
4. **Week 3**: 根据 baseline + profiler 数据决定候选优化
5. **Week 4+**: 仅实施 profiler 证明的瓶颈优化

---

**文档状态**: ✅ RFC / 草案  
**实施状态**: ⏳ 待实施  
**验证方式**: 真实 baseline + profiler 数据驱动  
**Unicode 版本**: 17.0.0

**最后更新**: 2026-07-09 (v4, 基于四轮 review 修正)
