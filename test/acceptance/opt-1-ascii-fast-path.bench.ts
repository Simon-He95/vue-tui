/**
 * Opt #1: ASCII 快速路径补全
 * 
 * 目标: 确保添加代理对检测后，ASCII 快速路径仍然高效
 * 验收标准: ASCII 文本宽度计算提升 > 50%
 */

import { bench, describe } from 'vitest';
import { textCellWidth } from '../../src/vue/utils/text.js';

describe('Opt #1: ASCII 快速路径性能基准', () => {
  // 短文本 ASCII
  bench('ASCII 文本宽度 - 10 字符', () => {
    textCellWidth('HelloWorld');
  });

  bench('ASCII 文本宽度 - 100 字符', () => {
    textCellWidth('a'.repeat(100));
  });

  bench('ASCII 文本宽度 - 1000 字符', () => {
    textCellWidth('x'.repeat(1000));
  });

  // 对比: 非 ASCII 文本
  bench('CJK 文本宽度 - 10 字符', () => {
    textCellWidth('你好世界测试文本');
  });

  bench('CJK 文本宽度 - 100 字符', () => {
    textCellWidth('中'.repeat(100));
  });

  bench('Emoji 文本宽度 - 10 字符', () => {
    textCellWidth('😀'.repeat(10));
  });

  // 混合文本
  bench('混合文本 - ASCII + CJK', () => {
    textCellWidth('Hello 你好 World 世界');
  });

  bench('混合文本 - ASCII + Emoji', () => {
    textCellWidth('Hello 😀 World 🎉');
  });

  // 缓存命中测试
  const cachedText = 'cached-ascii-text';
  bench('ASCII 缓存命中', () => {
    textCellWidth(cachedText);
  });

  // 实际场景
  bench('代码行 (纯 ASCII)', () => {
    textCellWidth('function calculateWidth(text: string): number {');
  });

  bench('日志行 (纯 ASCII)', () => {
    textCellWidth('[2026-07-09 12:00:00] INFO: Server started on port 3000');
  });
});
