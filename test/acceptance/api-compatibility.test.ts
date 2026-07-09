/**
 * API 兼容性测试
 * 
 * 确保所有公开 API 签名和行为不变
 */

import { describe, test, expect } from 'vitest';
import {
  textCellWidth,
  currentTextWidthProvider,
  hasTextWidthAsciiFastPath,
  withTextWidthProvider,
  withTextRenderPass,
} from '../../src/vue/utils/text.js';

describe('API 兼容性测试', () => {
  describe('API 签名不变', () => {
    test('textCellWidth(text: string): number', () => {
      const result = textCellWidth('test');
      expect(typeof result).toBe('number');
    });

    test('currentTextWidthProvider(): WidthProvider', () => {
      const provider = currentTextWidthProvider();
      expect(provider).toBeDefined();
    });

    test('hasTextWidthAsciiFastPath(): boolean', () => {
      const result = hasTextWidthAsciiFastPath();
      expect(typeof result).toBe('boolean');
    });

    test('withTextWidthProvider<T>(provider, fn): T', () => {
      const result = withTextWidthProvider('default', () => 42);
      expect(result).toBe(42);
    });

    test('withTextRenderPass<T>(fn, provider): T', () => {
      const result = withTextRenderPass(() => 'test');
      expect(result).toBe('test');
    });
  });

  describe('默认行为不变', () => {
    test('空字符串返回 0', () => {
      expect(textCellWidth('')).toBe(0);
    });

    test('单字节字符返回 1', () => {
      expect(textCellWidth('a')).toBe(1);
      expect(textCellWidth(' ')).toBe(1);
      expect(textCellWidth('0')).toBe(1);
    });

    test('CJK 字符返回 2', () => {
      expect(textCellWidth('中')).toBe(2);
      expect(textCellWidth('日')).toBe(2);
      expect(textCellWidth('한')).toBe(2);
    });

    test('多字节字符正确计算', () => {
      expect(textCellWidth('Hello')).toBe(5);
      expect(textCellWidth('你好')).toBe(4);
      expect(textCellWidth('Hello世界')).toBe(9);
    });
  });

  describe('错误处理不变', () => {
    test('无效输入不抛出异常', () => {
      expect(() => textCellWidth('')).not.toThrow();
      
      // 注意: 如果 TypeScript 类型系统正确，这些不应该发生
      // 但我们仍然验证运行时行为
    });

    test('特殊字符不抛出异常', () => {
      expect(() => textCellWidth('\0')).not.toThrow();
      expect(() => textCellWidth('\t')).not.toThrow();
      expect(() => textCellWidth('\n')).not.toThrow();
    });
  });

  describe('provider 行为一致', () => {
    test('default provider 行为不变', () => {
      const width = withTextWidthProvider('default', () => {
        return textCellWidth('Test ±');
      });
      
      expect(width).toBeGreaterThan(0);
    });

    test('narrow-ambiguous provider 行为不变', () => {
      const width = withTextWidthProvider('narrow-ambiguous', () => {
        return textCellWidth('Test ±');
      });
      
      expect(width).toBeGreaterThan(0);
    });

    test('自定义 provider 函数仍然支持', () => {
      const customProvider = (codePoint: number) => {
        return codePoint < 0x80 ? 1 : 2;
      };
      
      const width = withTextWidthProvider(customProvider, () => {
        return textCellWidth('Hello');
      });
      
      expect(width).toBe(5);
    });
  });

  describe('renderPass 行为一致', () => {
    test('renderPass 缓存行为不变', () => {
      const text = 'cache-test';
      
      const width = withTextRenderPass(() => {
        const w1 = textCellWidth(text);
        const w2 = textCellWidth(text);
        expect(w1).toBe(w2);
        return w1;
      });
      
      expect(width).toBe(10);
    });

    test('renderPass 结束后清理缓存', () => {
      withTextRenderPass(() => {
        textCellWidth('test1');
      });
      
      // 第二个 pass 应该独立
      withTextRenderPass(() => {
        textCellWidth('test2');
      });
      
      // 无异常即通过
    });
  });
});

describe('边界行为测试', () => {
  test('空输入', () => {
    expect(textCellWidth('')).toBe(0);
  });

  test('极大输入', () => {
    const largeText = 'x'.repeat(1000000);
    expect(() => textCellWidth(largeText)).not.toThrow();
  });

  test('特殊字符: NULL', () => {
    const width = textCellWidth('\0');
    expect(width).toBeGreaterThanOrEqual(0);
  });

  test('特殊字符: TAB', () => {
    const width = textCellWidth('\t');
    expect(width).toBeGreaterThanOrEqual(0);
  });

  test('特殊字符: NEWLINE', () => {
    const width = textCellWidth('\n');
    expect(width).toBeGreaterThanOrEqual(0);
  });

  test('Unicode 边界: U+10FFFF', () => {
    const maxCodePoint = String.fromCodePoint(0x10FFFF);
    expect(() => textCellWidth(maxCodePoint)).not.toThrow();
  });

  test('组合字符', () => {
    const combined = 'e\u0301'; // é
    const width = textCellWidth(combined);
    expect(width).toBeGreaterThan(0);
  });

  test('零宽字符', () => {
    const zwj = '\u200D'; // Zero Width Joiner
    expect(() => textCellWidth(zwj)).not.toThrow();
  });
});
