# vue-tui 性能监控和测试

## 监控指标

### 1. 缓存监控

#### 开发模式缓存统计（src/core/buffer/buffer.ts）
```typescript
if (process.env.NODE_ENV === 'development') {
  let cellCacheHitCount = 0;
  let cellCacheMissCount = 0;
  
  // 在 createCell 中添加统计
  export function createCell(ch: string, style?: Style, widthProvider?: WidthProvider): Cell {
    const normalizedStyle = normalizeStyle(style);
    const width = charCellWidth(ch, widthProvider);
    
    const map = width === 2
      ? getOrCreateCellCache(cellCacheWidth2, normalizedStyle)
      : getOrCreateCellCache(cellCacheWidth1, normalizedStyle);
    
    const cached = map.get(ch);
    if (cached) {
      cellCacheHitCount++;
      return cached;
    }
    
    cellCacheMissCount++;
    // ... 创建逻辑
  }
  
  // 导出统计函数
  export function getCellCacheStats() {
    return {
      hits: cellCacheHitCount,
      misses: cellCacheMissCount,
      hitRate: cellCacheHitCount / (cellCacheHitCount + cellCacheMissCount) || 0,
    };
  }
  
  // 定期输出
  setInterval(() => {
    const stats = getCellCacheStats();
    if (stats.hits + stats.misses > 0) {
      console.log('[vue-tui] Cell cache stats:', stats);
    }
  }, 10000);
}
```

#### 文本缓存监控（src/vue/utils/text.ts）
```typescript
export function getTextCacheStats() {
  return {
    textWidth: {
      size: textWidthCache.size,
      maxSize: MAX_TEXT_WIDTH_CACHE,
      utilization: textWidthCache.size / MAX_TEXT_WIDTH_CACHE,
    },
    wrap: {
      buckets: wrapCacheByWidth.size,
      maxBuckets: MAX_WRAP_CACHE_BUCKETS,
      utilization: wrapCacheByWidth.size / MAX_WRAP_CACHE_BUCKETS,
    },
    inlineLine: {
      buckets: inlineLineCacheByWidth.size,
      maxBuckets: MAX_INLINE_LINE_CACHE_BUCKETS,
    },
  };
}
```

### 2. 渲染性能监控

#### Frame Perf 扩展（已有框架）
基于现有的 `src/observability/frame-perf.ts`，添加新指标：

```typescript
export type FramePerfSample = Readonly<{
  // 现有字段...
  frameId: number;
  reason: FramePerfReason;
  durationMs: number;
  
  // 新增字段
  sortTimeMs?: number;        // 节点排序耗时
  bucketLookupTimeMs?: number; // Row bucket 查找耗时
  asciiTextRatio?: number;     // ASCII 文本占比
  cacheMissRate?: number;      // 缓存未命中率
}>;
```

#### 渲染循环埋点（render-manager.ts）
```typescript
function render(options) {
  const startTime = profiler?.now();
  
  // 1. 节点排序
  const sortStart = profiler?.now();
  ensureSorted();
  const sortTime = profiler ? profiler.now() - sortStart : 0;
  
  // 2. Row bucket 查找
  const bucketStart = profiler?.now();
  const candidates = findCandidatesByRowBucket(dirtyRows);
  const bucketTime = profiler ? profiler.now() - bucketStart : 0;
  
  // 3. 节点绘制
  // ... 原有逻辑
  
  // 4. 记录性能样本
  if (profiler) {
    recordFramePerfSample({
      sortTimeMs: sortTime,
      bucketLookupTimeMs: bucketTime,
      // ...
    });
  }
}
```

### 3. 内存监控

#### GC 压力监控（Node.js 环境）
```typescript
// src/observability/memory-profiler.ts
export function startMemoryProfiler(intervalMs = 5000) {
  if (typeof process === 'undefined' || !process.memoryUsage) {
    return { stop: () => {} };
  }
  
  const samples: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  }> = [];
  
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    samples.push({
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    });
    
    // 保留最近 100 个样本
    if (samples.length > 100) {
      samples.shift();
    }
  }, intervalMs);
  
  return {
    stop() {
      clearInterval(timer);
    },
    getSummary() {
      if (samples.length === 0) return null;
      
      const heapUsedValues = samples.map(s => s.heapUsed);
      const heapTotalValues = samples.map(s => s.heapTotal);
      
      return {
        samples: samples.length,
        heapUsed: {
          current: heapUsedValues[heapUsedValues.length - 1],
          min: Math.min(...heapUsedValues),
          max: Math.max(...heapUsedValues),
          avg: heapUsedValues.reduce((a, b) => a + b) / heapUsedValues.length,
        },
        heapTotal: {
          current: heapTotalValues[heapTotalValues.length - 1],
          min: Math.min(...heapTotalValues),
          max: Math.max(...heapTotalValues),
        },
      };
    },
  };
}
```

---

## 性能测试套件

### 1. 基准测试

#### Cell 缓存性能测试（test/perf/cell-cache.bench.ts）
```typescript
import { describe, bench } from 'vitest';
import { createCell } from '../src/core/buffer/buffer.js';

describe('Cell cache performance', () => {
  bench('ASCII characters (high hit rate)', () => {
    for (let i = 0; i < 1000; i++) {
      createCell('a');
      createCell('b');
      createCell('c');
    }
  });
  
  bench('CJK characters (diverse)', () => {
    for (let i = 0; i < 1000; i++) {
      createCell(String.fromCharCode(0x4e00 + (i % 500)));
    }
  });
  
  bench('Emoji (diverse)', () => {
    const emojis = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆'];
    for (let i = 0; i < 1000; i++) {
      createCell(emojis[i % emojis.length]);
    }
  });
});
```

#### 文本处理性能测试（test/perf/text-width.bench.ts）
```typescript
import { describe, bench } from 'vitest';
import { textCellWidth, wrapByCells } from '../src/vue/utils/text.js';

const asciiText = 'Hello, World! This is a test string.';
const cjkText = '你好世界！这是一个测试字符串。';
const mixedText = 'Hello 世界! Mixed text 混合文本.';
const longAsciiText = asciiText.repeat(10);
const longCjkText = cjkText.repeat(10);

describe('Text width calculation', () => {
  bench('ASCII text (fast path)', () => {
    textCellWidth(asciiText);
  });
  
  bench('CJK text (slow path)', () => {
    textCellWidth(cjkText);
  });
  
  bench('Mixed text', () => {
    textCellWidth(mixedText);
  });
  
  bench('Long ASCII text', () => {
    textCellWidth(longAsciiText);
  });
  
  bench('Long CJK text', () => {
    textCellWidth(longCjkText);
  });
});

describe('Text wrapping', () => {
  bench('Wrap ASCII text (80 cols)', () => {
    wrapByCells(longAsciiText, 80);
  });
  
  bench('Wrap CJK text (80 cols)', () => {
    wrapByCells(longCjkText, 80);
  });
  
  bench('Wrap mixed text (80 cols)', () => {
    wrapByCells(mixedText.repeat(10), 80);
  });
});
```

#### 渲染循环性能测试（test/perf/render-manager.bench.ts）
```typescript
import { describe, bench, beforeEach } from 'vitest';
import { createTerminal } from '../src/index.js';
import { createRenderManager } from '../src/vue/render/render-manager.js';

describe('Render manager performance', () => {
  let terminal: ReturnType<typeof createTerminal>;
  let renderManager: ReturnType<typeof createRenderManager>;
  
  beforeEach(() => {
    terminal = createTerminal({ cols: 80, rows: 24 });
    renderManager = createRenderManager(terminal);
  });
  
  bench('Register 100 nodes', () => {
    for (let i = 0; i < 100; i++) {
      renderManager.registerNode({
        id: `node-${i}`,
        plane: 'default',
        rect: { x: 0, y: i % 24, w: 80, h: 1 },
        paint: () => {},
      });
    }
  });
  
  bench('Render with 10% dirty rows', () => {
    // 预先注册 100 个节点
    for (let i = 0; i < 100; i++) {
      renderManager.registerNode({
        id: `node-${i}`,
        plane: 'default',
        rect: { x: 0, y: i % 24, w: 80, h: 1 },
        paint: () => {},
      });
    }
    
    // 标记 10% 脏行
    renderManager.markDirtyRows('test', [0, 1, 2]);
    renderManager.render({ planes: ['default'] });
  });
  
  bench('Render with 90% dirty rows', () => {
    // 预先注册 100 个节点
    for (let i = 0; i < 100; i++) {
      renderManager.registerNode({
        id: `node-${i}`,
        plane: 'default',
        rect: { x: 0, y: i % 24, w: 80, h: 1 },
        paint: () => {},
      });
    }
    
    // 标记 90% 脏行
    const dirtyRows = Array.from({ length: 22 }, (_, i) => i);
    renderManager.markDirtyRows('test', dirtyRows);
    renderManager.render({ planes: ['default'] });
  });
});
```

### 2. 回归测试

#### 缓存命中率测试（test/regression/cache-hit-rate.test.ts）
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createCell, getCellCacheStats } from '../src/core/buffer/buffer.js';

describe('Cell cache hit rate regression', () => {
  beforeEach(() => {
    // 重置统计
  });
  
  it('should maintain > 80% hit rate for ASCII text', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    // 预热缓存
    for (const ch of chars) {
      createCell(ch);
    }
    
    // 测试命中率
    for (let i = 0; i < 1000; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      createCell(ch);
    }
    
    const stats = getCellCacheStats();
    expect(stats.hitRate).toBeGreaterThan(0.8);
  });
  
  it('should handle 500 diverse CJK characters without thrashing', () => {
    // 写入 500 个不同的汉字
    for (let i = 0; i < 500; i++) {
      createCell(String.fromCharCode(0x4e00 + i));
    }
    
    // 再次访问前 100 个字符，应该仍在缓存中
    let hitsBefore = getCellCacheStats().hits;
    
    for (let i = 0; i < 100; i++) {
      createCell(String.fromCharCode(0x4e00 + i));
    }
    
    let hitsAfter = getCellCacheStats().hits;
    const recentHits = hitsAfter - hitsBefore;
    
    // 至少 70% 应该命中（考虑 LRU 淘汰）
    expect(recentHits / 100).toBeGreaterThan(0.7);
  });
});
```

---

## 持续集成

### CI 性能测试配置（.github/workflows/perf.yml）
```yaml
name: Performance Tests

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *' # 每日运行

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
      
      - name: Run benchmarks
        run: bun run bench --reporter=json > bench-results.json
      
      - name: Compare with baseline
        run: |
          if [ -f .baseline/bench-results.json ]; then
            node scripts/compare-bench.js .baseline/bench-results.json bench-results.json
          fi
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: bench-results
          path: bench-results.json
```

### 性能回归检测脚本（scripts/compare-bench.js）
```javascript
const fs = require('fs');

const baseline = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const current = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const REGRESSION_THRESHOLD = 1.2; // 20% 性能下降视为回归

let hasRegression = false;

for (const bench of current.benchmarks) {
  const baselineBench = baseline.benchmarks.find(b => b.name === bench.name);
  if (!baselineBench) continue;
  
  const ratio = bench.mean / baselineBench.mean;
  
  if (ratio > REGRESSION_THRESHOLD) {
    console.error(`❌ Performance regression in ${bench.name}:`);
    console.error(`   Baseline: ${baselineBench.mean.toFixed(2)}ms`);
    console.error(`   Current:  ${bench.mean.toFixed(2)}ms`);
    console.error(`   Ratio:    ${ratio.toFixed(2)}x slower`);
    hasRegression = true;
  } else if (ratio < 0.8) {
    console.log(`✅ Performance improvement in ${bench.name}:`);
    console.log(`   Baseline: ${baselineBench.mean.toFixed(2)}ms`);
    console.log(`   Current:  ${bench.mean.toFixed(2)}ms`);
    console.log(`   Ratio:    ${(1/ratio).toFixed(2)}x faster`);
  }
}

if (hasRegression) {
  process.exit(1);
}
```

---

## 实战优化检查清单

### 优化前检查
- [ ] 运行现有基准测试，记录 baseline
- [ ] 启用性能监控，收集 1 小时实际使用数据
- [ ] 确认缓存命中率和 GC 频率
- [ ] 记录关键指标：render fps、内存占用

### 优化实施
- [ ] 创建特性分支
- [ ] 分模块实施优化（每个 commit 对应一个优化点）
- [ ] 每个优化后运行基准测试验证
- [ ] 更新单元测试覆盖新代码路径

### 优化后验证
- [ ] 运行完整测试套件，确保无回归
- [ ] 对比优化前后的基准测试结果
- [ ] 检查缓存命中率提升情况
- [ ] 验证内存占用是否符合预期
- [ ] 在实际应用场景中测试（examples/）

### 文档和发布
- [ ] 更新 CHANGELOG.md
- [ ] 在 PR 中附上性能对比数据
- [ ] 更新性能相关文档
- [ ] Code review 通过后合并

---

## 性能目标

### 短期目标（1-2 周内）
- Cell 缓存命中率 > 85%
- 文本宽度计算缓存命中率 > 75%
- ASCII 文本处理速度提升 3x
- 减少 GC 压力 25%

### 中期目标（1-2 月内）
- 全屏渲染保持 60 FPS（24 行终端）
- 大列表滚动（1000+ 项）保持流畅
- 内存占用稳定在 < 50MB（标准使用场景）
- Row bucket 命中率 > 90%

### 长期目标（3-6 月内）
- 支持 120 FPS 高刷新率终端
- 超大列表（10000+ 项）虚拟化性能优化
- 多终端实例内存共享
- 渲染管道并发化（Web Worker）
