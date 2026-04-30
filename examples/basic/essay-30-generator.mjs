#!/usr/bin/env node

/**
 * 30字小作文生成器
 * 在终端中渲染30字小作文
 */

// 预设的30字小作文
const essays = [
  "清晨阳光洒满窗台，鸟儿枝头欢歌笑语，微风拂过绿草如茵，新的一天充满希望，梦想在心中悄然绽放",
  "夏日炎炎蝉鸣声声，荷花盛开清香四溢，绿树成荫遮阳避暑，冰镇西瓜消暑解渴，夏日时光悠闲自在",
  "秋高气爽丹桂飘香，枫叶满山红似火焰，稻谷金黄硕果累累，丰收喜悦洋溢心间，秋天是收获的季节",
  "冬雪纷飞银装素裹，梅花傲雪独自绽放，围炉夜话温暖如春，冬日温情暖人心扉，等待春暖花开时节",
  "夜幕降临繁星点点，月亮高悬银光如水，微风轻拂树影婆娑，宁静夜晚思绪万千，享受片刻宁静时光",
  "春风化雨滋润万物，百花齐放争奇斗艳，蝴蝶飞舞蜜蜂忙碌，大自然生机勃勃，春天的故事永远美丽",
  "青山绿水风景如画，白云悠悠天空湛蓝，鸟儿欢唱鱼儿游弋，人与自然和谐共处，美好环境需要守护",
  "书山有路勤为径路，学海无涯苦作舟，知识海洋无穷无尽，学习道路上永不止步，智慧之光照亮前程",
  "友情如酒越陈越香，真诚相待岁月长存，患难与共情义无价，朋友是人生宝贵财富，珍惜友情温暖相伴",
  "爱情甜蜜如蜜如糖，两情相悦心意相通，相濡以沫白头偕老，爱情路上携手同行，幸福生活美好未来",
];

// ANSI颜色代码
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

// 清屏
function clearScreen() {
  console.log("\x1b[2J\x1b[H");
}

// 绘制边框
function drawBox(x, y, width, height, title = "", borderColor = colors.cyan) {
  const horizontal = "─".repeat(width - 2);
  const vertical = "│";

  console.log(`\x1b[${y};${x}H${borderColor}┌${horizontal}┐${colors.reset}`);

  if (title) {
    const titleText = ` ${title} `;
    const padding = "─".repeat((width - 2 - titleText.length) / 2);
    console.log(
      `\x1b[${y + 1};${x}H${borderColor}├${padding}${titleText}${padding}┤${colors.reset}`,
    );
  }

  for (let i = 0; i < height - 2; i++) {
    const rowY = y + 1 + (title ? 1 : 0) + i;
    console.log(
      `\x1b[${rowY};${x}H${borderColor}${vertical}${" ".repeat(width - 2)}${vertical}${colors.reset}`,
    );
  }

  console.log(`\x1b[${y + height - 1};${x}H${borderColor}└${horizontal}┘${colors.reset}`);
}

// 在指定位置显示文本
function drawText(x, y, text, color = colors.white) {
  console.log(`\x1b[${y};${x}H${color}${text}${colors.reset}`);
}

// 显示进度条
function drawProgressBar(x, y, progress, width = 30) {
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;

  const progressBar =
    `${colors.green}█${colors.reset}`.repeat(filled) +
    `${colors.dim}░${colors.reset}`.repeat(empty);

  drawText(x, y, `进度: [${progressBar}] ${progress}%`, colors.white);
}

// 渲染小作文
function renderEssay(essayIndex = 0) {
  clearScreen();

  const essay = essays[essayIndex];
  const charCount = essay.length;
  const progress = Math.min((charCount / 30) * 100, 100);

  // 主边框
  drawBox(2, 2, 76, 22, "30字小作文生成器", colors.magenta);

  // 标题
  drawText(4, 4, "当前小作文：", colors.yellow);

  // 小作文内容（分两行显示）
  const midPoint = Math.ceil(essay.length / 2);
  const line1 = essay.substring(0, midPoint);
  const line2 = essay.substring(midPoint);

  drawText(4, 6, line1, colors.red + colors.bright);
  drawText(4, 7, line2, colors.red + colors.bright);

  // 字符统计
  drawText(4, 9, `字符数：${charCount} / 30`, colors.blue);

  // 进度条
  drawProgressBar(4, 10, progress);

  // 分隔线
  drawText(
    4,
    12,
    "────────────────────────────────────────────────────────────────────",
    colors.dim,
  );

  // 操作说明
  drawText(4, 14, "操作说明：", colors.cyan);
  drawText(4, 15, "• 按 Enter 键查看下一篇", colors.white);
  drawText(4, 16, "• 按 R 键随机生成", colors.white);
  drawText(4, 17, "• 按 Q 键退出程序", colors.white);
  drawText(4, 18, "• 按 S 键显示所有", colors.white);

  // 底部状态
  drawText(
    4,
    20,
    `系统状态：就绪 | 当前显示第 ${essayIndex + 1}/${essays.length} 篇`,
    colors.green,
  );

  // 移动光标到最后一行
  console.log(`\x1b[24;1H`);
}

// 显示所有小作文
function showAllEssays() {
  clearScreen();
  drawBox(2, 2, 76, 25, "所有30字小作文", colors.magenta);

  let y = 4;
  essays.forEach((essay, index) => {
    const prefix = `${index + 1}. `;
    const text = prefix + essay;

    if (y < 23) {
      // 确保不超出边框
      drawText(4, y++, text, colors.white);
    }
  });

  drawText(4, 24, "按任意键返回...", colors.cyan);
}

// 主函数
async function main() {
  let currentIndex = 0;
  let showingAll = false;

  // 首次渲染
  renderEssay(currentIndex);

  // 监听键盘输入
  const readline = require("readline");
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on("keypress", (str, key) => {
    if (showingAll) {
      showingAll = false;
      renderEssay(currentIndex);
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      currentIndex = (currentIndex + 1) % essays.length;
      renderEssay(currentIndex);
    } else if (key.name === "r") {
      currentIndex = Math.floor(Math.random() * essays.length);
      renderEssay(currentIndex);
    } else if (key.name === "q") {
      clearScreen();
      console.log(colors.green + "感谢使用30字小作文生成器！" + colors.reset);
      process.exit(0);
    } else if (key.name === "s") {
      showingAll = true;
      showAllEssays();
    }
  });

  console.log(colors.cyan + "\n30字小作文生成器已启动..." + colors.reset);
  console.log(colors.dim + "按 Q 键退出程序" + colors.reset + "\n");
}

// 运行主函数
main().catch(console.error);
