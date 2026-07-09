# vue-tui 验收测试套件 - 脚本配置建议

## 建议添加到 package.json 的脚本

```json
{
  "scripts": {
    "// === 验收测试套件 ===": "",
    "test:acceptance": "vitest run test/acceptance/",
    "test:acceptance:bugs": "vitest run test/acceptance/bug-*.test.ts",
    "test:acceptance:api": "vitest run test/acceptance/api-compatibility.test.ts",
    "test:acceptance:perf": "vitest run test/acceptance/performance-regression.test.ts",
    
    "// === 基准测试 ===": "",
    "benchmark:suite": "node --expose-gc scripts/benchmark-suite.ts run",
    "benchmark:baseline": "node --expose-gc scripts/benchmark-suite.ts run baseline baseline.json",
    "benchmark:current": "node --expose-gc scripts/benchmark-suite.ts run current current.json",
    "benchmark:compare": "node scripts/benchmark-suite.ts compare",
    
    "// === 性能基准 (Vitest) ===": "",
    "bench:ascii": "vitest bench test/acceptance/opt-1-ascii-fast-path.bench.ts",
    
    "// === 完整验收流程 ===": "",
    "acceptance:full": "npm-run-all acceptance:bugs acceptance:api acceptance:perf benchmark:suite",
    "acceptance:report": "node scripts/generate-acceptance-report.ts"
  }
}
```

## 使用示例

### 1. 运行所有验收测试

```bash
pnpm test:acceptance
```

### 2. 只运行 Bug 修复测试

```bash
pnpm test:acceptance:bugs
```

### 3. 收集基线数据

```bash
# 在修复前
git checkout main
pnpm benchmark:baseline
```

### 4. 收集修复后数据

```bash
# 在修复后
git checkout fix-branch
pnpm benchmark:current
```

### 5. 对比性能

```bash
pnpm benchmark:compare baseline.json current.json
```

### 6. 完整验收流程

```bash
# 一键运行所有验收测试
pnpm acceptance:full
```

---

## CI/CD 集成 (GitHub Actions)

创建 `.github/workflows/acceptance.yml`:

```yaml
name: Acceptance Tests

on:
  pull_request:
    paths:
      - 'src/vue/utils/text.ts'
      - 'src/core/buffer/width.ts'
      - 'test/acceptance/**'

jobs:
  acceptance:
    name: 验收测试
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 获取完整历史用于对比
      
      - uses: oven-sh/setup-bun@v1
      
      - name: 安装依赖
        run: pnpm install
      
      - name: 类型检查
        run: pnpm typecheck
      
      - name: 代码风格
        run: pnpm lint
      
      - name: 运行验收测试
        run: pnpm test:acceptance
      
      - name: 收集基线数据 (main 分支)
        run: |
          git checkout origin/main
          pnpm install
          node --expose-gc scripts/benchmark-suite.ts run baseline baseline.json
      
      - name: 收集当前数据 (PR 分支)
        run: |
          git checkout ${{ github.sha }}
          pnpm install
          node --expose-gc scripts/benchmark-suite.ts run current current.json
      
      - name: 性能对比
        run: node scripts/benchmark-suite.ts compare baseline.json current.json > perf-comparison.txt
      
      - name: 上传验收报告
        uses: actions/upload-artifact@v4
        with:
          name: acceptance-report
          path: |
            baseline.json
            current.json
            perf-comparison.txt
      
      - name: 评论 PR (性能对比结果)
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const comparison = fs.readFileSync('perf-comparison.txt', 'utf8');
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 📊 性能验收报告\n\n\`\`\`\n${comparison}\n\`\`\``
            });
```

---

## 本地开发工作流

### 开发前 (收集基线)

```bash
# 1. 确保在 main 分支
git checkout main
git pull

# 2. 收集基线数据
pnpm benchmark:baseline

# 3. 运行现有测试确保通过
pnpm test

# 4. 创建修复分支
git checkout -b fix/text-width-bugs
```

### 开发中 (快速验证)

```bash
# 运行特定的 Bug 测试
pnpm test test/acceptance/bug-1-surrogate-pairs.test.ts

# 运行 API 兼容性测试
pnpm test:acceptance:api

# 快速性能检查
pnpm bench:ascii
```

### 开发后 (完整验收)

```bash
# 1. 运行所有验收测试
pnpm test:acceptance

# 2. 收集修复后数据
pnpm benchmark:current

# 3. 对比性能
pnpm benchmark:compare baseline.json current.json

# 4. 运行完整测试套件
pnpm test

# 5. 类型检查和代码风格
pnpm typecheck
pnpm lint
```

---

## 验收通过标准

### ✅ 阻塞性标准 (必须全部通过)

```bash
# 1. 所有验收测试通过
pnpm test:acceptance  # 必须 100% 通过

# 2. 现有测试套件通过
pnpm test  # 必须 100% 通过

# 3. API 兼容性
pnpm test:acceptance:api  # 必须 100% 通过

# 4. 性能无回退
pnpm test:acceptance:perf  # 所有测试通过

# 5. 性能对比
pnpm benchmark:compare baseline.json current.json
# 检查输出，确保:
# - 关键路径性能回退 < 5%
# - 内存增长 < 2MB
# - GC 压力无明显增加
```

### ⚠️ 非阻塞性标准 (可延后)

- 性能提升未达到目标值 (如目标 +50%，实际 +40%)
- P2 优先级测试失败
- 文档更新不完整

---

## 故障排查

### 测试失败

```bash
# 1. 查看详细错误
pnpm test test/acceptance/bug-1-surrogate-pairs.test.ts --reporter=verbose

# 2. 调试单个测试
pnpm test test/acceptance/bug-1-surrogate-pairs.test.ts -t "B1.1"

# 3. 查看覆盖率
pnpm test:acceptance --coverage
```

### 性能回退

```bash
# 1. 运行性能分析
node --prof scripts/benchmark-suite.ts run profiled profiled.json

# 2. 分析性能日志
node --prof-process isolate-*.log > profile.txt

# 3. 对比具体指标
node scripts/benchmark-suite.ts compare baseline.json profiled.json
```

### 内存泄漏

```bash
# 1. 使用 GC 标志运行
node --expose-gc scripts/benchmark-suite.ts run

# 2. 使用堆快照
node --heap-prof scripts/benchmark-suite.ts run

# 3. 分析堆快照
# 在 Chrome DevTools 中打开生成的 .heapprofile 文件
```

---

## 依赖要求

确保安装了以下开发依赖 (如果还没有):

```json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "npm-run-all": "^4.1.5"
  }
}
```

安装:

```bash
pnpm add -D npm-run-all
```

---

**文档状态**: ✅ 完成  
**最后更新**: 2026-07-09  
**维护者**: @simon_he
