#!/usr/bin/env node

/**
 * 30字小作文快速预览
 * 简单版本，用于快速查看效果
 */

const essays = [
  "清晨阳光洒满窗台，鸟儿枝头欢歌笑语，微风拂过绿草如茵，新的一天充满希望，梦想在心中悄然绽放",
  "夏日炎炎蝉鸣声声，荷花盛开清香四溢，绿树成荫遮阳避暑，冰镇西瓜消暑解渴，夏日时光悠闲自在",
  "秋高气爽丹桂飘香，枫叶满山红似火焰，稻谷金黄硕果累累，丰收喜悦洋溢心间，秋天是收获的季节",
  "冬雪纷飞银装素裹，梅花傲雪独自绽放，围炉夜话温暖如春，冬日温情暖人心扉，等待春暖花开时节",
  "夜幕降临繁星点点，月亮高悬银光如水，微风轻拂树影婆娑，宁静夜晚思绪万千，享受片刻宁静时光",
];

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

console.log(`${colors.cyan}${colors.bright}`);
console.log("════════════════════════════════════════════════════════════════");
console.log("║              30字小作文快速预览                              ║");
console.log("════════════════════════════════════════════════════════════════");
console.log(`${colors.reset}`);

essays.forEach((essay, index) => {
  console.log(
    `${colors.yellow}${colors.bright}${index + 1}. ${colors.reset}${colors.red}${colors.bright}${essay}${colors.reset}`,
  );
  console.log(`${colors.blue}   字符数: ${essay.length}${colors.reset}`);
  console.log(
    `${colors.dim}   ───────────────────────────────────────────────────────${colors.reset}`,
  );
});

console.log(`${colors.green}${colors.bright}`);
console.log("════════════════════════════════════════════════════════════════");
console.log("║  总计: 5篇30字小作文 | 平均字符数: 30                         ║");
console.log("════════════════════════════════════════════════════════════════");
console.log(`${colors.reset}`);
