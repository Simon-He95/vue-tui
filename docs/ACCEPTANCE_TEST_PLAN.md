# vue-tui 优化方案验收测试计划

**版本**: 1.0  
**日期**: 2026-07-09  
**目标**: 验证 3 个阻塞性 Bug 修复和性能优化方案的正确性、性能提升和兼容性

---

## 📋 目录

1. [Bug 修复验收测试](#1-bug-修复验收测试)
2. [性能优化验收测试](#2-性能优化验收测试)
3. [破坏性变更检测](#3-破坏性变更检测)
4. [基准数据收集](#4-基准数据收集)
5. [验收标准](#5-验收标准)
6. [测试执行流程](#6-测试执行流程)

---

## 1. Bug 修复验收测试

### Bug #1: 代理对误判为 ASCII

**问题描述**: `isAscii()` 函数未检测代理对 (0xD800-0xDFFF)，导致 Emoji 等字符被误判为 ASCII。

**修复位置**: `src/vue/utils/text.ts:53-58`

#### 测试用例

| ID | 测试名称 | 输入 | 预期输出 | 优先级 |
|----|---------|------|---------|--------|
| B1.1 | Emoji 代理对检测 | "😀" (U+1F600) | `isAscii() = false` | P0 |
| B1.2 | 多字节 Emoji | "👨‍👩‍👧‍👦" (家庭 Emoji) | `isAscii() = false` | P0 |
| B1.3 | 古文字检测 | "𠮷" (U+20BB7) | `isAscii() = false` | P1 |
| B1.4 | 纯 ASCII 正确性 | "Hello" | `isAscii() = true` | P0 |
| B1.5 | ASCII 混合代理对 | "Hi😀" | `isAscii() = false` | P0 |
| B1.6 | 宽度计算正确性 (Emoji) | "😀" | `textCellWidth() = 2` | P0 |
| B1.7 | 宽度计算正确性 (CJK) | "你好" | `textCellWidth() = 4` | P0 |
| B1.8 | 布局完整性测试 | 包含 Emoji 的文本框 | 无溢出/截断 | P1 |
| B1.9 | 性能回归测试 | 1000 次 ASCII 检测 | 时间增加 < 5% | P1 |
| B1.10 | 边界测试：空字符串 | "" | `isAscii() = true` | P2 |
| B1.11 | 边界测试：单字节边界 | "\x7F" | `isAscii() = true` | P2 |

**自动化脚本**: `test/acceptance/bug-1-surrogate-pairs.test.ts`

---

### Bug #2: 多实例缓存串扰

**问题描述**: 全局 `renderPassTextWidthCache` 和 `textWidthProviderStack` 导致多 Terminal 实例间缓存污染。

**修复位置**: `src/vue/utils/text.ts:12-13`

#### 测试用例

| ID | 测试名称 | 测试场景 | 预期行为 | 优先级 |
|----|---------|---------|---------|--------|
| B2.1 | 多实例并发渲染 | 2 个实例同时渲染 | 缓存隔离，无串扰 | P0 |
| B2.2 | 不同 widthProvider | 实例 A 用 "default"，B 用 "narrow-ambiguous" | 各自使用正确的 provider | P0 |
| B2.3 | 缓存隔离验证 | 实例 A 缓存 "test"，实例 B 查询 "test" | B 的缓存不包含 A 的数据 | P0 |
| B2.4 | 实例销毁清理 | 创建实例，渲染，销毁 | 缓存被清理，无内存泄漏 | P1 |
| B2.5 | 实例间性能独立 | 实例 A 大量缓存不影响实例 B | B 的查询速度不受 A 影响 | P1 |
| B2.6 | 嵌套渲染通道 | renderPass 嵌套调用 | 正确维护栈深度 | P1 |
| B2.7 | 并发压力测试 | 10 个实例并发渲染 100 帧 | 无错误，数据正确 | P2 |
| B2.8 | 内存泄漏检测 | 创建/销毁 100 次 | 内存增长 < 10MB | P1 |

**自动化脚本**: `test/acceptance/bug-2-cache-isolation.test.ts`

---

### Bug #3: 超长文本性能退化

**问题描述**: 10k+ 字符文本导致 `textCellWidth()` 性能退化（>1000ms）。

**修复位置**: `src/vue/utils/text.ts:430-445`

#### 测试用例

| ID | 测试名称 | 输入大小 | 性能目标 | 优先级 |
|----|---------|---------|---------|--------|
| B3.1 | 10k 字符 ASCII | 10,000 字符 | < 100ms | P0 |
| B3.2 | 10k 字符 CJK | 10,000 中文字符 | < 100ms | P0 |
| B3.3 | 100k 字符压力测试 | 100,000 字符 | < 500ms | P1 |
| B3.4 | 混合文本 (ASCII+CJK+Emoji) | 10,000 字符混合 | < 150ms | P0 |
| B3.5 | 缓存命中率测试 | 重复计算相同 10k 文本 | 第 2 次 < 5ms | P1 |
| B3.6 | 分段缓存正确性 | 10k 字符分段 | 总宽度与全文计算一致 | P0 |
| B3.7 | 内存占用测试 | 处理 10 个 10k 文本 | 缓存增长 < 5MB | P1 |
| B3.8 | 不同文本类型对比 | ASCII vs CJK vs 混合 | 性能差异 < 2x | P2 |
| B3.9 | 边界：1M 字符 | 1,000,000 字符 | 不崩溃，有限降级 | P2 |

**自动化脚本**: `test/acceptance/bug-3-long-text-perf.test.ts`

---

## 2. 性能优化验收测试

### Opt #1: ASCII 快速路径补全

**优化内容**: 在 `isAscii()` 中添加代理对检测后，确保 ASCII 快速路径仍然高效。

#### 验收标准

| 指标 | 基线 | 目标 | 测量方法 |
|------|------|------|---------|
| ASCII 文本宽度计算 (100 字符) | baseline | +50% | Vitest bench |
| ASCII 文本宽度计算 (1000 字符) | baseline | +50% | Vitest bench |
| 非 ASCII 文本性能 | baseline | 无回退 | Vitest bench |
| 缓存命中率 | baseline | 维持或提升 | 运行时统计 |

**自动化脚本**: `test/acceptance/opt-1-ascii-fast-path.bench.ts`

---

### Opt #2: 调大缓存上限

**优化内容**: 将缓存上限从当前值增加到更合理的值。

#### 验收标准

| 指标 | 基线 | 目标 | 测量方法 |
|------|------|------|---------|
| 缓存命中率 | 45% | > 65% | 运行时统计 |
| 内存增加 | 0MB | < 2MB | process.memoryUsage() |
| 渲染性能 | baseline | 无回退 | FPS 测量 |
| 缓存清理延迟 | N/A | < 10ms | 性能计时 |

**自动化脚本**: `test/acceptance/opt-2-cache-size.test.ts`

---

### Opt #3: 临时数组复用

**优化内容**: 复用临时数组对象，减少 GC 压力。

#### 验收标准

| 指标 | 基线 | 目标 | 测量方法 |
|------|------|------|---------|
| GC 次数/分钟 | baseline | -10% | --expose-gc 测量 |
| 内存稳定性 | baseline | 堆增长 < 5% | memoryUsage 持续监控 |
| 渲染性能 | baseline | 无回退 | FPS 测量 |
| 并发安全性 | N/A | 无数据竞争 | 多实例并发测试 |

**自动化脚本**: `test/acceptance/opt-3-array-reuse.test.ts`

---

## 3. 破坏性变更检测

### 3.1 API 兼容性测试

**目标**: 确保所有公开 API 签名和行为不变。

#### 测试清单

- [ ] `textCellWidth(text: string): number` - 签名不变
- [ ] `currentTextWidthProvider(): WidthProvider` - 签名不变
- [ ] `hasTextWidthAsciiFastPath(): boolean` - 签名不变
- [ ] `withTextWidthProvider<T>(provider, fn): T` - 签名不变
- [ ] `withTextRenderPass<T>(fn, provider): T` - 签名不变
- [ ] 默认行为：空字符串返回 0
- [ ] 默认行为：单字节字符返回 1
- [ ] 默认行为：CJK 字符返回 2
- [ ] 错误处理：无效输入不抛出异常

**自动化脚本**: `test/acceptance/api-compatibility.test.ts`

---

### 3.2 现有测试套件回归

**目标**: 所有现有测试必须通过。

#### 验收步骤

1. 运行完整测试套件：`pnpm test`
2. 检查测试通过率：必须 100%
3. 检查测试覆盖率：不得降低
4. 检查失败用例：0 个新增失败

**命令**:
```bash
pnpm test --reporter=verbose
pnpm test --coverage
```

---

### 3.3 边界行为测试

#### 测试矩阵

| 边界情况 | 测试输入 | 预期行为 |
|---------|---------|---------|
| 空输入 | `""` | 返回 0，不抛出异常 |
| null/undefined | `null`, `undefined` | 类型错误或优雅降级 |
| 极大输入 | 1M 字符 | 不崩溃，有限降级 |
| 特殊字符 | `\0`, `\t`, `\n` | 正确处理控制字符 |
| Unicode 边界 | U+10FFFF | 正确处理最大码点 |
| 组合字符 | "e\u0301" (é) | 正确计算宽度 |
| 零宽字符 | ZWJ, ZWNJ | 正确处理零宽字符 |

**自动化脚本**: `test/acceptance/edge-cases.test.ts`

---

### 3.4 性能回退测试

**目标**: 关键路径性能不劣化。

#### 测试基准

| 关键路径 | 基线性能 | 回退阈值 |
|---------|---------|---------|
| 短文本宽度计算 (<100 字符) | baseline | +5% |
| 中等文本 (100-1000 字符) | baseline | +5% |
| 虚拟滚动渲染 (60fps) | baseline | 帧时间 +2ms |
| 大量元素渲染 (1000 行) | baseline | +10% |
| 内存占用 (1 小时运行) | baseline | +10MB |

**自动化脚本**: `test/acceptance/performance-regression.test.ts`

---

## 4. 基准数据收集

### 4.1 自动化基准脚本

**位置**: `scripts/benchmark-suite.ts`

#### 收集指标

1. **文本宽度计算性能**
   - ASCII 文本 (10/100/1000 字符)
   - CJK 文本 (10/100/1000 字符)
   - 混合文本
   - 含 Emoji 文本

2. **缓存性能**
   - 缓存命中率
   - 缓存查询延迟
   - 缓存大小

3. **渲染性能**
   - 虚拟滚动 FPS
   - 帧时间 (p50/p95/p99)
   - 首次渲染时间

4. **内存使用**
   - 堆内存占用
   - 缓存内存占用
   - GC 频率和时长

5. **长文本处理**
   - 10k 字符处理时间
   - 100k 字符处理时间
   - 1M 字符处理时间

---

### 4.2 基准执行命令

```bash
# 运行基准套件
pnpm run benchmark:suite

# 生成对比报告
pnpm run benchmark:compare --baseline=before.json --current=after.json

# 导出基准数据
pnpm run benchmark:export --output=baseline-2026-07-09.json
```

---

## 5. 验收标准

### 5.1 量化指标表

| 指标 | 修复前 | 预期修复后 | 实际修复后 | 通过标准 | 状态 |
|------|--------|-----------|-----------|---------|------|
| **Bug 修复** |
| 代理对检测准确率 | 0% (误判) | 100% | ? | = 100% | ⏳ |
| 多实例并发正确性 | ❌ Bug | ✅ 通过 | ? | 100% 通过 | ⏳ |
| 10k 字符处理时间 | >1000ms | <100ms | ? | <100ms | ⏳ |
| **性能优化** |
| ASCII 文本性能提升 | baseline | +50% | ? | >+40% | ⏳ |
| 缓存命中率 | 45% | 65% | ? | >60% | ⏳ |
| GC 压力降低 | baseline | -10% | ? | >-5% | ⏳ |
| **兼容性** |
| 现有测试通过率 | 100% | 100% | ? | 100% | ⏳ |
| API 兼容性 | 100% | 100% | ? | 100% | ⏳ |
| 内存占用增加 | 0MB | <2MB | ? | <2MB | ⏳ |
| 关键路径性能回退 | 0% | 0% | ? | <5% | ⏳ |

---

### 5.2 质量门禁

#### 阻塞性 (必须全部通过)

- ✅ 所有 P0 测试用例通过
- ✅ 现有测试套件 100% 通过
- ✅ API 兼容性测试通过
- ✅ 无内存泄漏
- ✅ 无性能回退 (>5%)

#### 非阻塞性 (可延后修复)

- ⚠️ P2 测试用例失败
- ⚠️ 性能提升未达目标但无回退
- ⚠️ 非核心边界情况失败

---

## 6. 测试执行流程

### 6.1 执行顺序

1. **前置检查**
   ```bash
   pnpm install
   pnpm run typecheck
   pnpm run lint
   ```

2. **基线数据收集**
   ```bash
   git checkout main  # 或修复前的分支
   pnpm run benchmark:suite --output=baseline.json
   ```

3. **应用修复**
   ```bash
   git checkout fix-branch
   ```

4. **Bug 修复验收**
   ```bash
   pnpm test test/acceptance/bug-1-surrogate-pairs.test.ts
   pnpm test test/acceptance/bug-2-cache-isolation.test.ts
   pnpm test test/acceptance/bug-3-long-text-perf.test.ts
   ```

5. **性能优化验收**
   ```bash
   pnpm run benchmark:suite --output=optimized.json
   pnpm run benchmark:compare --baseline=baseline.json --current=optimized.json
   ```

6. **破坏性变更检测**
   ```bash
   pnpm test  # 完整测试套件
   pnpm test test/acceptance/api-compatibility.test.ts
   pnpm test test/acceptance/edge-cases.test.ts
   pnpm test test/acceptance/performance-regression.test.ts
   ```

7. **生成验收报告**
   ```bash
   pnpm run acceptance:report --baseline=baseline.json --current=optimized.json
   ```

---

### 6.2 CI/CD 集成

**GitHub Actions 工作流**:

```yaml
name: Acceptance Tests

on: [pull_request]

jobs:
  acceptance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: pnpm install
      - run: pnpm run benchmark:suite --output=current.json
      - run: pnpm test test/acceptance/
      - run: pnpm run acceptance:report
      - uses: actions/upload-artifact@v3
        with:
          name: acceptance-report
          path: reports/acceptance-*.json
```

---

## 附录

### A. 测试文件清单

| 文件 | 用途 | 优先级 |
|------|------|--------|
| `test/acceptance/bug-1-surrogate-pairs.test.ts` | Bug #1 验收 | P0 |
| `test/acceptance/bug-2-cache-isolation.test.ts` | Bug #2 验收 | P0 |
| `test/acceptance/bug-3-long-text-perf.test.ts` | Bug #3 验收 | P0 |
| `test/acceptance/opt-1-ascii-fast-path.bench.ts` | Opt #1 基准 | P0 |
| `test/acceptance/opt-2-cache-size.test.ts` | Opt #2 验收 | P1 |
| `test/acceptance/opt-3-array-reuse.test.ts` | Opt #3 验收 | P1 |
| `test/acceptance/api-compatibility.test.ts` | API 兼容性 | P0 |
| `test/acceptance/edge-cases.test.ts` | 边界测试 | P1 |
| `test/acceptance/performance-regression.test.ts` | 性能回退 | P0 |
| `scripts/benchmark-suite.ts` | 基准测试套件 | P0 |
| `scripts/acceptance-report.ts` | 报告生成器 | P1 |

### B. 工具依赖

- **Vitest**: 单元测试和基准测试
- **Playwright**: E2E 测试
- **Node.js --expose-gc**: GC 监控
- **process.memoryUsage()**: 内存监控
- **performance.now()**: 高精度计时

---

**文档状态**: ✅ 完成  
**最后更新**: 2026-07-09  
**维护者**: @simon_he

