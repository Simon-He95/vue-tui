/**
 * Bug #3: 超长文本性能退化
 * 
 * 问题: 10k+ 字符文本导致 textCellWidth() 性能退化 (>1000ms)
 * 修复位置: src/vue/utils/text.ts:430-445 (分段缓存策略)
 */

import { describe, test, expect } from 'vitest';
import { textCellWidth, withTextRenderPass } from '../../src/vue/utils/text.js';

describe('Bug #3: 超长文本性能', () => {
  describe('B3.1-B3.4: 性能目标验证', () => {
    test('B3.1: 10k 字符 ASCII < 100ms', () => {
      const text = 'a'.repeat(10000);
      
      const start = performance.now();
      const width = textCellWidth(text);
      const elapsed = performance.now() - start;
      
      expect(width).toBe(10000);
      expect(elapsed).toBeLessThan(100);
      
      console.log(`10k ASCII: ${elapsed.toFixed(2)}ms`);
    });

    test('B3.2: 10k 字符 CJK < 100ms', () => {
      const text = '中'.repeat(10000);
      
      const start = performance.now();
      const width = textCellWidth(text);
      const elapsed = performance.now() - start;
      
      expect(width).toBe(20000); // 每个中文字符宽度 2
      expect(elapsed).toBeLessThan(100);
      
      console.log(`10k CJK: ${elapsed.toFixed(2)}ms`);
    });

    test('B3.3: 100k 字符压力测试 < 500ms', () => {
      const text = 'x'.repeat(100000);
      
      const start = performance.now();
      const width = textCellWidth(text);
      const elapsed = performance.now() - start;
      
      expect(width).toBe(100000);
      expect(elapsed).toBeLessThan(500);
      
      console.log(`100k ASCII: ${elapsed.toFixed(2)}ms`);
    });

    test('B3.4: 混合文本 (ASCII+CJK+Emoji) < 150ms', () => {
      const ascii = 'Hello '.repeat(1000); // ~6k chars
      const cjk = '你好'.repeat(1000);     // ~2k chars
      const emoji = '😀'.repeat(500);      // ~1k chars
      const text = ascii + cjk + emoji;    // ~9k chars
      
      const start = performance.now();
      const width = textCellWidth(text);
      const elapsed = performance.now() - start;
      
      expect(width).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(150);
      
      console.log(`混合文本: ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('B3.5: 缓存命中率测试', () => {
    test('重复计算相同 10k 文本，第 2 次 < 5ms', () => {
      const text = 'cached'.repeat(2000); // ~12k chars
      
      // 第一次调用 (冷缓存)
      const start1 = performance.now();
      const width1 = textCellWidth(text);
      const elapsed1 = performance.now() - start1;
      
      // 第二次调用 (热缓存)
      const start2 = performance.now();
      const width2 = textCellWidth(text);
      const elapsed2 = performance.now() - start2;
      
      expect(width1).toBe(width2);
      expect(elapsed2).toBeLessThan(5);
      
      console.log(`缓存效果: 第1次 ${elapsed1.toFixed(2)}ms, 第2次 ${elapsed2.toFixed(2)}ms`);
    });

    test('renderPass 内缓存有效', () => {
      const text = 'render-pass-cache'.repeat(1000);
      
      withTextRenderPass(() => {
        const start1 = performance.now();
        textCellWidth(text);
        const elapsed1 = performance.now() - start1;
        
        const start2 = performance.now();
        textCellWidth(text);
        const elapsed2 = performance.now() - start2;
        
        expect(elapsed2).toBeLessThan(elapsed1);
        expect(elapsed2).toBeLessThan(1);
      });
    });
  });

  describe('B3.6: 分段缓存正确性', () => {
    test('10k 字符分段宽度 = 全文宽度', () => {
      const fullText = 'segment'.repeat(1500); // ~10.5k chars
      const fullWidth = textCellWidth(fullText);
      
      // 分段计算
      const segmentSize = 1000;
      let segmentedWidth = 0;
      for (let i = 0; i < fullText.length; i += segmentSize) {
        const segment = fullText.slice(i, i + segmentSize);
        segmentedWidth += textCellWidth(segment);
      }
      
      expect(segmentedWidth).toBe(fullWidth);
    });

    test('分段边界不影响多字节字符', () => {
      const text = '中文ABC中文'.repeat(1000);
      const width = textCellWidth(text);
      
      // 验证宽度正确 (不因分段而错误切割多字节字符)
      const expectedWidth = ('中文ABC中文'.length * 2 + 'ABC'.length * 1) * 1000 / '中文ABC中文'.length;
      expect(width).toBeCloseTo(expectedWidth, 0);
    });
  });

  describe('B3.7: 内存占用测试', () => {
    test('处理 10 个 10k 文本，缓存增长 < 5MB', () => {
      const getMemory = () => {
        if (global.gc) global.gc();
        return process.memoryUsage().heapUsed;
      };

      const initialMemory = getMemory();
      
      const texts = Array.from({ length: 10 }, (_, i) =>
        `text-${i}-`.repeat(2000) // ~10k each
      );

      for (const text of texts) {
        textCellWidth(text);
      }

      const finalMemory = getMemory();
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      expect(memoryIncrease).toBeLessThan(5);
      console.log(`内存增长: ${memoryIncrease.toFixed(2)}MB`);
    });
  });

  describe('B3.8: 不同文本类型性能对比', () => {
    test('ASCII vs CJK vs 混合性能差异 < 2x', () => {
      const size = 10000;
      const ascii = 'a'.repeat(size);
      const cjk = '中'.repeat(size);
      const mixed = ('abc你好'.repeat(size / 5));
      
      const timeAscii = measureTime(() => textCellWidth(ascii));
      const timeCjk = measureTime(() => textCellWidth(cjk));
      const timeMixed = measureTime(() => textCellWidth(mixed));
      
      const maxTime = Math.max(timeAscii, timeCjk, timeMixed);
      const minTime = Math.min(timeAscii, timeCjk, timeMixed);
      
      const ratio = maxTime / minTime;
      expect(ratio).toBeLessThan(2);
      
      console.log(`性能对比 - ASCII: ${timeAscii.toFixed(2)}ms, CJK: ${timeCjk.toFixed(2)}ms, 混合: ${timeMixed.toFixed(2)}ms`);
    });
  });

  describe('B3.9: 边界极限测试', () => {
    test('1M 字符不崩溃', () => {
      const text = 'x'.repeat(1000000);
      
      expect(() => {
        const width = textCellWidth(text);
        expect(width).toBe(1000000);
      }).not.toThrow();
    });

    test('1M 字符有限降级 (< 5s)', () => {
      const text = 'y'.repeat(1000000);
      
      const start = performance.now();
      textCellWidth(text);
      const elapsed = performance.now() - start;
      
      // 允许降级，但应在 5 秒内完成
      expect(elapsed).toBeLessThan(5000);
      console.log(`1M 字符: ${elapsed.toFixed(2)}ms`);
    });
  });
});

describe('Bug #3: 回归和集成测试', () => {
  test('短文本性能无回退', () => {
    const shortText = 'short';
    
    const times = [];
    for (let i = 0; i < 1000; i++) {
      times.push(measureTime(() => textCellWidth(shortText)));
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    
    // 短文本应该非常快 (< 0.01ms)
    expect(avgTime).toBeLessThan(0.01);
  });

  test('实际场景: 虚拟滚动大量长行', () => {
    const lines = Array.from({ length: 100 }, (_, i) =>
      `Line ${i}: ${'content '.repeat(500)}`
    );

    const start = performance.now();
    const widths = lines.map(line => textCellWidth(line));
    const elapsed = performance.now() - start;
    
    expect(widths).toHaveLength(100);
    expect(elapsed).toBeLessThan(500); // 100 行，每行 ~3k 字符
    
    console.log(`虚拟滚动 100 行: ${elapsed.toFixed(2)}ms`);
  });

  test('实际场景: 日志查看器连续滚动', () => {
    // 模拟每秒追加 10 行日志
    const logLines = Array.from({ length: 100 }, (_, i) =>
      `[${new Date().toISOString()}] ${'log message '.repeat(100)}`
    );

    const start = performance.now();
    
    for (const line of logLines) {
      textCellWidth(line);
    }
    
    const elapsed = performance.now() - start;
    const fps = 1000 / (elapsed / logLines.length);
    
    // 应能支持 > 30 FPS
    expect(fps).toBeGreaterThan(30);
    console.log(`日志滚动 FPS: ${fps.toFixed(0)}`);
  });
});

// 辅助函数
function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

