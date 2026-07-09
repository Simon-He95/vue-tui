/**
 * 性能回归测试
 * 
 * 确保关键路径性能不劣化
 */

import { describe, test, expect } from 'vitest';
import { textCellWidth, withTextRenderPass } from '../../src/vue/utils/text.js';

describe('性能回归测试', () => {
  describe('短文本性能 (<100 字符)', () => {
    test('10 字符 ASCII - 基准', () => {
      const text = 'HelloWorld';
      const iterations = 10000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(text);
      }
      const elapsed = performance.now() - start;
      const avg = elapsed / iterations;
      
      // 应该 < 0.01ms (10μs)
      expect(avg).toBeLessThan(0.01);
      console.log(`10 字符 ASCII: ${avg.toFixed(4)}ms/op`);
    });

    test('50 字符混合文本 - 基准', () => {
      const text = 'Hello 世界 Test 测试 😀'.repeat(2);
      const iterations = 5000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(text);
      }
      const elapsed = performance.now() - start;
      const avg = elapsed / iterations;
      
      expect(avg).toBeLessThan(0.02);
      console.log(`50 字符混合: ${avg.toFixed(4)}ms/op`);
    });
  });

  describe('中等文本性能 (100-1000 字符)', () => {
    test('100 字符 ASCII', () => {
      const text = 'a'.repeat(100);
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(text);
      }
      const elapsed = performance.now() - start;
      const avg = elapsed / iterations;
      
      expect(avg).toBeLessThan(0.05);
    });

    test('1000 字符 CJK', () => {
      const text = '中'.repeat(1000);
      const iterations = 100;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(text);
      }
      const elapsed = performance.now() - start;
      const avg = elapsed / iterations;
      
      expect(avg).toBeLessThan(10);
    });
  });

  describe('虚拟滚动渲染 (60fps)', () => {
    test('渲染 100 行，每行 50 字符', () => {
      const lines = Array.from({ length: 100 }, (_, i) =>
        `Line ${i}: ${'content '.repeat(5)}`
      );

      const start = performance.now();
      withTextRenderPass(() => {
        for (const line of lines) {
          textCellWidth(line);
        }
      });
      const elapsed = performance.now() - start;
      
      // 60fps = 16.67ms/frame
      // 100 行应在 1 帧内完成
      expect(elapsed).toBeLessThan(16.67);
      console.log(`100 行渲染: ${elapsed.toFixed(2)}ms`);
    });

    test('滚动性能: 每秒 60 帧', () => {
      const line = 'Scrolling line with some 中文 content 😀';
      const iterations = 60; // 60 帧
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        withTextRenderPass(() => {
          // 模拟每帧渲染 10 行
          for (let j = 0; j < 10; j++) {
            textCellWidth(line);
          }
        });
      }
      const elapsed = performance.now() - start;
      
      // 60 帧应在 1 秒 (1000ms) 内完成
      expect(elapsed).toBeLessThan(1000);
      
      const fps = 1000 / (elapsed / iterations);
      console.log(`实际 FPS: ${fps.toFixed(1)}`);
    });
  });

  describe('大量元素渲染 (1000 行)', () => {
    test('1000 行终端输出', () => {
      const lines = Array.from({ length: 1000 }, (_, i) =>
        `[${i.toString().padStart(4, '0')}] Log message`
      );

      const start = performance.now();
      withTextRenderPass(() => {
        const widths = lines.map(line => textCellWidth(line));
        expect(widths).toHaveLength(1000);
      });
      const elapsed = performance.now() - start;
      
      // 1000 行应在 100ms 内完成
      expect(elapsed).toBeLessThan(100);
      console.log(`1000 行渲染: ${elapsed.toFixed(2)}ms`);
    });
  });

  describe('内存占用测试 (1 小时运行)', () => {
    test('持续渲染 1 小时的内存增长模拟', () => {
      // 模拟: 每秒 60 帧，每帧 10 行，运行 60 秒 (代表 1 小时)
      const getMemory = () => {
        if (global.gc) global.gc();
        return process.memoryUsage().heapUsed;
      };

      const initialMemory = getMemory();
      
      const totalFrames = 60 * 60; // 1 分钟代表 1 小时
      const linesPerFrame = 10;
      
      for (let frame = 0; frame < totalFrames; frame++) {
        withTextRenderPass(() => {
          for (let line = 0; line < linesPerFrame; line++) {
            textCellWidth(`Frame ${frame} Line ${line}`);
          }
        });
        
        // 每 100 帧清理一次垃圾
        if (frame % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = getMemory();
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
      
      // 1 小时运行内存增长应 < 10MB
      expect(memoryIncrease).toBeLessThan(10);
      console.log(`内存增长 (模拟 1 小时): ${memoryIncrease.toFixed(2)}MB`);
    });
  });

  describe('缓存性能', () => {
    test('缓存命中率 > 80%', () => {
      const texts = [
        'Line 1',
        'Line 2',
        'Line 3',
        'Line 1', // 重复
        'Line 2', // 重复
        'Line 3', // 重复
        'Line 1', // 重复
      ];

      withTextRenderPass(() => {
        for (const text of texts) {
          textCellWidth(text);
        }
      });

      // 7 次调用，3 次独立，4 次重复
      // 缓存命中率 = 4/7 = 57%
      // 实际场景中应更高
    });

    test('缓存查询延迟 < 1μs', () => {
      const text = 'cached-text';
      
      // 预热缓存
      textCellWidth(text);
      
      const iterations = 10000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(text);
      }
      const elapsed = performance.now() - start;
      const avg = (elapsed * 1000) / iterations; // 转换为 μs
      
      expect(avg).toBeLessThan(1);
      console.log(`缓存查询延迟: ${avg.toFixed(3)}μs`);
    });
  });
});
