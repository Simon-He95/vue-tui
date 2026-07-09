/**
 * Bug #2: 多实例缓存串扰
 * 
 * 问题: 全局 renderPassTextWidthCache 和 textWidthProviderStack 
 *       导致多 Terminal 实例间缓存污染
 * 修复位置: src/vue/utils/text.ts:12-13
 */

import { describe, test, expect } from 'vitest';
import { 
  textCellWidth, 
  withTextWidthProvider,
  withTextRenderPass,
  currentTextWidthProvider,
} from '../../src/vue/utils/text.js';
import type { WidthProvider } from '../../src/core/buffer/width.js';

function createMockTerminalInstance(id: string, provider: WidthProvider) {
  return {
    id,
    provider,
    render: (text: string) => {
      return withTextWidthProvider(provider, () => textCellWidth(text));
    },
    renderPass: <T>(fn: () => T) => {
      return withTextRenderPass(fn, provider);
    },
  };
}

describe('Bug #2: 多实例缓存隔离', () => {
  describe('B2.1: 多实例并发渲染', () => {
    test('2 个实例同时渲染不同文本', () => {
      const instance1 = createMockTerminalInstance('term1', 'default');
      const instance2 = createMockTerminalInstance('term2', 'default');

      const width1 = instance1.render('Hello');
      const width2 = instance2.render('World');

      expect(width1).toBe(5);
      expect(width2).toBe(5);
    });

    test('2 个实例交替渲染', () => {
      const instance1 = createMockTerminalInstance('term1', 'default');
      const instance2 = createMockTerminalInstance('term2', 'default');

      const w1a = instance1.render('Test1');
      const w2a = instance2.render('Test2');
      const w1b = instance1.render('Test1');
      const w2b = instance2.render('Test2');

      expect(w1a).toBe(5);
      expect(w2a).toBe(5);
      expect(w1b).toBe(5);
      expect(w2b).toBe(5);
    });
  });

  describe('B2.2: 不同 widthProvider', () => {
    test('实例 A 用 default, 实例 B 用 narrow-ambiguous', () => {
      const instanceA = createMockTerminalInstance('termA', 'default');
      const instanceB = createMockTerminalInstance('termB', 'narrow-ambiguous');

      const ambiguousChar = '±';
      const widthA = instanceA.render(ambiguousChar);
      const widthB = instanceB.render(ambiguousChar);

      expect(widthA).toBeGreaterThan(0);
      expect(widthB).toBeGreaterThan(0);
    });

    test('实例间 provider 互不影响', () => {
      const width1 = withTextWidthProvider('default', () => {
        expect(currentTextWidthProvider()).toBe('default');
        return textCellWidth('Test');
      });

      const width2 = withTextWidthProvider('narrow-ambiguous', () => {
        expect(currentTextWidthProvider()).toBe('narrow-ambiguous');
        return textCellWidth('Test');
      });

      expect(width1).toBe(4);
      expect(width2).toBe(4);
    });
  });

  describe('B2.3: 缓存隔离验证', () => {
    test('renderPass 缓存在通道结束后清理', () => {
      const text = 'test-text';
      const width1 = withTextRenderPass(() => textCellWidth(text));
      const width2 = withTextRenderPass(() => textCellWidth(text));

      expect(width1).toBe(width2);
      expect(width1).toBe(9);
    });
  });

  describe('B2.5: 实例间性能独立', () => {
    test('实例 A 的大量缓存不影响实例 B 的性能', () => {
      const instance1 = createMockTerminalInstance('heavy', 'default');
      const instance2 = createMockTerminalInstance('light', 'default');

      const heavyTexts = Array.from({ length: 1000 }, (_, i) => `heavy-${i}`);
      for (const text of heavyTexts) {
        instance1.render(text);
      }

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        instance2.render('light-text');
      }
      const elapsed = performance.now() - start;
      
      expect(elapsed / 100).toBeLessThan(0.1);
    });
  });

  describe('B2.6: 嵌套渲染通道', () => {
    test('嵌套 renderPass 正确清理缓存', () => {
      const text = 'nested-test';
      
      const outerWidth = withTextRenderPass(() => {
        const innerWidth = withTextRenderPass(() => textCellWidth(text));
        return textCellWidth(text);
      });

      expect(outerWidth).toBe(11);
    });
  });

  describe('B2.7: 并发压力测试', () => {
    test('10 个实例并发渲染', async () => {
      const instances = Array.from({ length: 10 }, (_, i) =>
        createMockTerminalInstance(`term-${i}`, 'default')
      );

      const results = await Promise.all(
        instances.flatMap(inst =>
          Array.from({ length: 10 }, () =>
            inst.renderPass(() => [
              textCellWidth('Frame'),
              textCellWidth('中文'),
              textCellWidth('😀'),
            ])
          )
        )
      );

      expect(results).toHaveLength(100);
      for (const widths of results) {
        expect(widths).toHaveLength(3);
      }
    });
  });
});

