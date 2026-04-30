#!/usr/bin/env node

/**
 * 精确30字小作文
 * 每篇严格控制在30个字符
 */

// 精确30字的小作文集合 (每篇都是30个字符)
const essays = [
  "春风拂面柳丝长，桃花满园映朝阳，燕子归来筑新巢，一派生机盎然",
  "夏日炎炎蝉鸣声，荷花盛开清香溢，绿树成荫遮阳暑，冰镇西瓜解渴",
  "秋高气爽丹桂香，枫叶满山红似火，稻谷金黄硕果累，丰收喜悦满心",
  "冬雪纷飞银装裹，梅花傲雪独自放，围炉夜话温暖春，冬日温情暖心",
  "晨曦微露鸟声脆，露珠晶莹草叶尖，日出东方红胜火，一日之计在于",
  "夕阳西下染红霞，归鸟投林影渐斜，炊烟袅袅农家乐，田园风光美如",
  "青山绿水风景画，白云悠悠蓝天阔，鸟儿欢唱鱼儿游，人与自然和谐",
  "书山有路勤为径，学海无涯苦作舟，知识海洋无穷尽，学习路上永不",
  "友情如酒越陈香，真诚相待岁月长，患难与共情义价，朋友人生宝贵",
  "爱情甜蜜如蜜糖，两情相悦意相通，相濡以沫白头老，爱情路上携手",
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

// 验证字符数
function validateEssays() {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log("════════════════════════════════════════════════════════════════");
  console.log("║              精确30字小作文验证                             ║");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`${colors.reset}`);

  let allValid = true;
  let totalChars = 0;

  essays.forEach((essay, index) => {
    const charCount = essay.length;
    const isValid = charCount === 30;
    const status = isValid ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;

    console.log(
      `${colors.yellow}${colors.bright}${index + 1}. ${colors.reset}${colors.red}${colors.bright}${essay}${colors.reset}`,
    );
    console.log(`${colors.blue}   字符数: ${charCount} ${status}${colors.reset}`);

    if (!isValid) {
      allValid = false;
      console.log(`${colors.red}   警告: 字符数不正确！${colors.reset}`);
    }

    totalChars += charCount;
    console.log(
      `${colors.dim}   ───────────────────────────────────────────────────────${colors.reset}`,
    );
  });

  const avgChars = Math.round(totalChars / essays.length);

  console.log(`${colors.green}${colors.bright}`);
  console.log("════════════════════════════════════════════════════════════════");
  if (allValid) {
    console.log(
      `║  验证结果: ${colors.green}全部通过 ✓${colors.reset}${colors.green}${colors.bright} | 总计: ${essays.length}篇 | 每篇: 30字 ║`,
    );
  } else {
    console.log(
      `║  验证结果: ${colors.red}部分失败 ✗${colors.reset}${colors.green}${colors.bright} | 平均: ${avgChars}字           ║`,
    );
  }
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`${colors.reset}`);

  return allValid;
}

// 运行验证
const isValid = validateEssays();

if (isValid) {
  console.log(`${colors.green}${colors.bright}✓ 所有小作文都是精确的30个字符！${colors.reset}\n`);
} else {
  console.log(`${colors.red}${colors.bright}✗ 部分小作文字符数不正确，请检查！${colors.reset}\n`);
}

// 导出验证通过的作文集合
if (isValid) {
  module.exports = { essays };
}
