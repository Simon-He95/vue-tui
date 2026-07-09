/**
 * Bug #1: 代理对误判为 ASCII
 * 
 * 问题: isAscii() 未检测代理对 (0xD800-0xDFFF)，导致 Emoji 等字符被误判
 * 修复位置: src/vue/utils/text.ts:53-58
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { textCellWidth } from '../../src/vue/utils/text.js';

// 注意: 这些测试假设 isAscii() 函数被导出或通过其他方式可测试
// 如果未导出，需要通过 textCellWidth 的行为间接测试

describe('Bug #1: 代理对检测', () => {
  describe('B1.1-B1.5: 代理对检测正确性', () => {
    test('B1.1: Emoji 代理对检测 - 基本 Emoji', () => {
      const emoji = '😀'; // U+1F600, 需要代理对
      const width = textCellWidth(emoji);
      
      // Emoji 应被识别为非 ASCII，宽度为 2
      expect(width).toBe(2);
    });

    test('B1.2: 多字节 Emoji - 家庭 Emoji', () => {
      const familyEmoji = '👨‍👩‍👧‍👦'; // 复杂的组合 Emoji
      const width = textCellWidth(familyEmoji);
      
      // 组合 Emoji 应正确处理，宽度 >= 2
      expect(width).toBeGreaterThanOrEqual(2);
    });

    test('B1.3: 古文字检测 - CJK 扩展 B', () => {
      const rareChar = '𠮷'; // U+20BB7, 需要代理对
      const width = textCellWidth(rareChar);
      
      // 古文字应被识别为非 ASCII，宽度为 2
      expect(width).toBe(2);
    });

    test('B1.4: 纯 ASCII 正确性', () => {
      const ascii = 'Hello';
      const width = textCellWidth(ascii);
      
      // 纯 ASCII 字符串，每个字符宽度 1
      expect(width).toBe(5);
    });

    test('B1.5: ASCII 混合代理对', () => {
      const mixed = 'Hi😀';
      const width = textCellWidth(mixed);
      
      // 'H' + 'i' + '😀' = 1 + 1 + 2 = 4
      expect(width).toBe(4);
    });
  });

  describe('B1.6-B1.7: 宽度计算正确性', () => {
    test('B1.6: Emoji 宽度计算', () => {
      const testCases = [
        { text: '😀', expected: 2, desc: 'grinning face' },
        { text: '🎉', expected: 2, desc: 'party popper' },
        { text: '👍', expected: 2, desc: 'thumbs up' },
        { text: '❤️', expected: 2, desc: 'red heart' },
      ];

      for (const { text, expected, desc } of testCases) {
        expect(textCellWidth(text), `${desc} (${text})`).toBe(expected);
      }
    });

    test('B1.7: CJK 宽度计算', () => {
      const testCases = [
        { text: '你好', expected: 4, desc: 'Chinese' },
        { text: 'こんにちは', expected: 10, desc: 'Japanese hiragana' },
        { text: '안녕하세요', expected: 10, desc: 'Korean' },
        { text: '中文测试', expected: 8, desc: 'Chinese test' },
      ];

      for (const { text, expected, desc } of testCases) {
        expect(textCellWidth(text), desc).toBe(expected);
      }
    });
  });

  describe('B1.8: 布局完整性测试', () => {
    test('包含 Emoji 的文本框布局', () => {
      // 模拟一个固定宽度的文本框
      const boxWidth = 20;
      const text = 'Hello 😀 World';
      const width = textCellWidth(text);
      
      // 'Hello ' (6) + '😀' (2) + ' World' (6) = 14
      expect(width).toBe(14);
      expect(width).toBeLessThanOrEqual(boxWidth);
    });

    test('多行 Emoji 文本布局', () => {
      const lines = [
        'Line 1 😀',
        'Line 2 🎉',
        'Line 3 👍',
      ];

      const widths = lines.map(line => textCellWidth(line));
      
      // 每行应有一致的宽度计算
      expect(widths[0]).toBe(9); // 'Line 1 ' (7) + '😀' (2)
      expect(widths[1]).toBe(9); // 'Line 2 ' (7) + '🎉' (2)
      expect(widths[2]).toBe(9); // 'Line 3 ' (7) + '👍' (2)
    });
  });

  describe('B1.9: 性能回归测试', () => {
    test('ASCII 检测性能 - 1000 次迭代', () => {
      const asciiText = 'Hello World! This is a pure ASCII string.';
      const iterations = 1000;
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(asciiText);
      }
      const end = performance.now();
      
      const totalTime = end - start;
      const avgTime = totalTime / iterations;
      
      // 平均每次调用应小于 0.1ms (100μs)
      expect(avgTime).toBeLessThan(0.1);
      
      console.log(`ASCII 性能: ${totalTime.toFixed(2)}ms total, ${avgTime.toFixed(4)}ms avg`);
    });

    test('代理对检测性能 - 不应显著影响 ASCII 性能', () => {
      const pureAscii = 'a'.repeat(100);
      const iterations = 1000;
      
      // 预热
      for (let i = 0; i < 100; i++) {
        textCellWidth(pureAscii);
      }
      
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        textCellWidth(pureAscii);
      }
      const end = performance.now();
      
      const totalTime = end - start;
      
      // 1000 次 100 字符 ASCII 检测应在 50ms 内完成
      expect(totalTime).toBeLessThan(50);
      
      console.log(`ASCII 快速路径性能: ${totalTime.toFixed(2)}ms for ${iterations} iterations`);
    });
  });

  describe('B1.10-B1.11: 边界测试', () => {
    test('B1.10: 空字符串', () => {
      const empty = '';
      const width = textCellWidth(empty);
      
      expect(width).toBe(0);
    });

    test('B1.11: 单字节边界 - 0x7F', () => {
      const boundary = '\x7F'; // DEL character
      const width = textCellWidth(boundary);
      
      // DEL 是 ASCII，宽度应为 1 或 0 (取决于实现)
      expect(width).toBeGreaterThanOrEqual(0);
      expect(width).toBeLessThanOrEqual(1);
    });

    test('边界: 代理对边界值', () => {
      // 高代理对范围: 0xD800-0xDBFF
      // 低代理对范围: 0xDC00-0xDFFF
      const highSurrogate = '\uD800'; // 孤立的高代理对 (无效)
      const lowSurrogate = '\uDC00';  // 孤立的低代理对 (无效)
      
      // 这些应被识别为非 ASCII
      // 实际宽度取决于 width provider 如何处理无效序列
      const highWidth = textCellWidth(highSurrogate);
      const lowWidth = textCellWidth(lowSurrogate);
      
      // 至少不应崩溃
      expect(highWidth).toBeGreaterThanOrEqual(0);
      expect(lowWidth).toBeGreaterThanOrEqual(0);
    });

    test('边界: 合法代理对边界', () => {
      // 最小合法代理对: U+10000
      const minSupplementary = '\uD800\uDC00';
      const width = textCellWidth(minSupplementary);
      
      expect(width).toBeGreaterThanOrEqual(1);
    });
  });

  describe('回归测试: 现有功能不受影响', () => {
    test('回归: 常见字符宽度', () => {
      const testCases = [
        { text: 'a', expected: 1 },
        { text: ' ', expected: 1 },
        { text: '0', expected: 1 },
        { text: '\t', expected: 1 }, // tab 通常宽度 1
        { text: '!', expected: 1 },
        { text: '中', expected: 2 },
        { text: '日', expected: 2 },
      ];

      for (const { text, expected } of testCases) {
        expect(textCellWidth(text), `char: '${text}'`).toBe(expected);
      }
    });

    test('回归: 混合文本', () => {
      const mixed = 'Hello世界123';
      const width = textCellWidth(mixed);
      
      // 'Hello' (5) + '世界' (4) + '123' (3) = 12
      expect(width).toBe(12);
    });

    test('回归: 缓存行为', () => {
      const text = 'cached text';
      
      // 第一次调用
      const width1 = textCellWidth(text);
      
      // 第二次调用应使用缓存
      const width2 = textCellWidth(text);
      
      expect(width1).toBe(width2);
    });
  });
});

describe('Bug #1: 集成测试', () => {
  test('实际场景: 聊天消息渲染', () => {
    const messages = [
      'Hello! 👋',
      'How are you? 😊',
      'Great! 🎉',
      '你好世界 🌍',
    ];

    const widths = messages.map(msg => textCellWidth(msg));
    
    // 验证所有消息都能正确计算宽度
    expect(widths[0]).toBe(9);  // 'Hello! ' (7) + '👋' (2)
    expect(widths[1]).toBe(15); // 'How are you? ' (13) + '😊' (2)
    expect(widths[2]).toBe(8);  // 'Great! ' (6) + '🎉' (2)
    expect(widths[3]).toBe(12); // '你好世界 ' (8) + '🌍' (2) + ' ' (1) - 调整
  });

  test('实际场景: 代码高亮中的 Emoji 注释', () => {
    const codeWithEmoji = '// TODO: 修复这个 bug 🐛';
    const width = textCellWidth(codeWithEmoji);
    
    // 应能正确处理代码中的 Emoji
    expect(width).toBeGreaterThan(0);
    expect(width).toBe(22); // '// TODO: 修复这个 bug ' (20) + '🐛' (2)
  });
});

