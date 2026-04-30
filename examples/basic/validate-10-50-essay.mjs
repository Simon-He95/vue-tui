#!/usr/bin/env node

/**
 * 精确10字和50字小作文
 * 每篇严格控制在指定字符数
 */

// 精确10字的小作文集合
const essays10 = [
  "春风拂面柳丝长",
  "夏日炎炎荷花香",
  "秋高气爽丹桂飘",
  "冬雪纷飞梅花傲",
  "晨曦微露鸟声脆",
  "夕阳西下染红霞",
  "青山绿水风景画",
  "书山有路勤为径",
  "友情如酒越陈香",
  "爱情甜蜜如蜜糖",
];

// 精确50字的小作文集合
const essays50 = [
  "春风拂面柳丝长，桃花满园映朝阳，燕子归来筑新巢，一派生机盎然，万物复苏迎春光，希望之花悄然绽放",
  "夏日炎炎蝉鸣声，荷花盛开清香溢，绿树成荫遮阳暑，冰镇西瓜解渴爽，清风徐来送凉爽，夏日时光悠闲自在",
  "秋高气爽丹桂香，枫叶满山红似火，稻谷金黄硕果累，丰收喜悦满心间，秋高气爽精神爽，收获季节满载而归",
  "冬雪纷飞银装裹，梅花傲雪独自放，围炉夜话温暖春，冬日温情暖心扉，瑞雪兆丰年景好，冬去春来万物生",
  "晨曦微露鸟声脆，露珠晶莹草叶尖，日出东方红胜火，一日之计在于晨，朝气蓬勃展宏图，美好一天从此始",
  "夕阳西下染红霞，归鸟投林影渐斜，炊烟袅袅农家乐，田园风光美如画，落霞与孤鹜齐飞，秋水共长天一色",
  "青山绿水风景画，白云悠悠蓝天阔，鸟儿欢唱鱼儿游，人与自然和谐处，生态平衡靠守护，美好家园共建设",
  "书山有路勤为径，学海无涯苦作舟，知识海洋无穷尽，学习路上永不止，勤奋努力创佳绩，智慧之光永闪耀",
  "友情如酒越陈香，真诚相待岁月长，患难与共情义价，朋友人生宝贵财，珍惜友情常联系，友谊之树常青翠",
  "爱情甜蜜如蜜糖，两情相悦意相通，相濡以沫白头老，爱情路上携手行，白头偕老共度日，天长地久爱永恒",
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
function validateEssays(essays, expectedCount) {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`║              精确${expectedCount}字小作文验证                             ║`);
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`${colors.reset}`);

  let allValid = true;
  let totalChars = 0;

  essays.forEach((essay, index) => {
    const charCount = essay.length;
    const isValid = charCount === expectedCount;
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
      `║  验证结果: ${colors.green}全部通过 ✓${colors.reset}${colors.green}${colors.bright} | 总计: ${essays.length}篇 | 每篇: ${expectedCount}字 ║`,
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

// 验证10字小作文
console.log(`${colors.magenta}${colors.bright}\n🔍 验证10字小作文...\n${colors.reset}`);
const isValid10 = validateEssays(essays10, 10);

if (isValid10) {
  console.log(
    `${colors.green}${colors.bright}✓ 所有10字小作文都是精确的10个字符！${colors.reset}\n`,
  );
} else {
  console.log(
    `${colors.red}${colors.bright}✗ 部分10字小作文字符数不正确，请检查！${colors.reset}\n`,
  );
}

// 验证50字小作文
console.log(`${colors.magenta}${colors.bright}\n🔍 验证50字小作文...\n${colors.reset}`);
const isValid50 = validateEssays(essays50, 50);

if (isValid50) {
  console.log(
    `${colors.green}${colors.bright}✓ 所有50字小作文都是精确的50个字符！${colors.reset}\n`,
  );
} else {
  console.log(
    `${colors.red}${colors.bright}✗ 部分50字小作文字符数不正确，请检查！${colors.reset}\n`,
  );
}

// 总结
if (isValid10 && isValid50) {
  console.log(`${colors.green}${colors.bright}` + "═".repeat(60));
  console.log("║  所有验证通过！可以用于渲染了！                                ║");
  console.log("═".repeat(60) + `${colors.reset}\n`);
}
