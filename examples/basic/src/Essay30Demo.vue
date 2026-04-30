<script setup lang="ts">
import { ref, computed } from "vue";
import { TerminalProvider, TBox, TText, TInput, useLayout } from "@simon_he/vue-tui";

// 获取终端布局信息
const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 80);
const rows = computed(() => layout.clipRect?.h ?? 24);

// 30字小作文预设
const essays = [
  "清晨阳光洒满窗台，鸟儿枝头欢歌笑语，微风拂过绿草如茵，新的一天充满希望，梦想在心中悄然绽放",
  "夏日炎炎蝉鸣声声，荷花盛开清香四溢，绿树成荫遮阳避暑，冰镇西瓜消暑解渴，夏日时光悠闲自在",
  "秋高气爽丹桂飘香，枫叶满山红似火焰，稻谷金黄硕果累累，丰收喜悦洋溢心间，秋天是收获的季节",
  "冬雪纷飞银装素裹，梅花傲雪独自绽放，围炉夜话温暖如春，冬日温情暖人心扉，等待春暖花开时节",
  "夜幕降临繁星点点，月亮高悬银光如水，微风轻拂树影婆娑，宁静夜晚思绪万千，享受片刻宁静时光",
];

// 当前小作文
const currentEssay = ref(essays[0]);

// 输入框内容
const inputEssay = ref(essays[0]);

// 目标字符数
const TARGET_CHARS = 30;

// 计算字符数
const charCount = computed(() => inputEssay.value.length);

// 计算进度
const progress = computed(() => {
  const percentage = Math.min((charCount.value / TARGET_CHARS) * 100, 100);
  return Math.round(percentage);
});

// 进度条样式
const progressStyle = computed(() => {
  if (charCount.value < TARGET_CHARS * 0.8) {
    return { fg: "red" };
  } else if (charCount.value > TARGET_CHARS * 1.2) {
    return { fg: "yellow" };
  }
  return { fg: "green" };
});

// 确认输入
const confirmEssay = () => {
  const text = inputEssay.value.trim();
  if (text) {
    currentEssay.value = text;
    status.value = "小作文已更新 ✓";
    setTimeout(() => {
      status.value = "系统状态：就绪";
    }, 2000);
  } else {
    status.value = "请输入小作文内容 ✗";
    setTimeout(() => {
      status.value = "系统状态：就绪";
    }, 2000);
  }
};

// 随机生成
const generateRandom = () => {
  const randomIndex = Math.floor(Math.random() * essays.length);
  inputEssay.value = essays[randomIndex];
  currentEssay.value = essays[randomIndex];
  status.value = "已生成随机30字小作文 ✓";
  setTimeout(() => {
    status.value = "系统状态：就绪";
  }, 2000);
};

// 重置
const resetEssay = () => {
  inputEssay.value = essays[0];
  currentEssay.value = essays[0];
  status.value = "已重置为默认小作文 ✓";
  setTimeout(() => {
    status.value = "系统状态：就绪";
  }, 2000);
};

// 清空输入
const clearInput = () => {
  inputEssay.value = "";
  currentEssay.value = "等待输入...";
  status.value = "输入已清空 ✓";
  setTimeout(() => {
    status.value = "系统状态：就绪";
  }, 2000);
};

// 系统状态
const status = ref("系统状态：就绪");

// 创建进度条字符串
const createProgressBar = () => {
  const filled = Math.floor(progress.value / 5); // 每5%一个字符
  const empty = 20 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
};
</script>

<template>
  <TerminalProvider :cols="80" :rows="26" :default-style="{ fg: 'whiteBright' }">
    <!-- 主边框 -->
    <TBox
      :x="1"
      :y="1"
      :w="78"
      :h="24"
      border
      title="30字小作文生成器"
      :style="{ fg: 'magentaBright' }"
      :padding="1"
    >
      <!-- 小作文显示区域 -->
      <TText :x="1" :y="1" :w="76" value="当前小作文：" :style="{ fg: 'yellowBright' }" />
      <TText :x="1" :y="3" :w="76" :value="currentEssay" :style="{ fg: 'redBright', bold: true }" />

      <!-- 字符统计 -->
      <TText
        :x="1"
        :y="5"
        :w="76"
        :value="`字符数：${charCount} / ${TARGET_CHARS}`"
        :style="{ fg: 'blueBright' }"
      />
      <TText
        :x="1"
        :y="6"
        :w="76"
        :value="`进度：${createProgressBar()} ${progress}%`"
        :style="progressStyle"
      />

      <!-- 分隔线 -->
      <TText
        :x="1"
        :y="8"
        :w="76"
        value="──────────────────────────────────────────────────────"
        :style="{ fg: 'gray' }"
      />

      <!-- 输入区域 -->
      <TText
        :x="1"
        :y="10"
        :w="76"
        value="输入新的小作文（按Enter确认）："
        :style="{ fg: 'yellowBright' }"
      />
      <TInput
        :x="1"
        :y="12"
        :w="76"
        v-model="inputEssay"
        placeholder="请输入30字小作文..."
        @keydown.enter="confirmEssay"
      />

      <!-- 操作提示 -->
      <TText :x="1" :y="15" :w="76" value="操作说明：" :style="{ fg: 'cyanBright' }" />
      <TText :x="1" :y="16" :w="76" value="• 在输入框中输入文字" :style="{ fg: 'white' }" />
      <TText :x="1" :y="17" :w="76" value="• 按 Enter 键确认修改" :style="{ fg: 'white' }" />
      <TText :x="1" :y="18" :w="76" value="• 最佳长度为30个字符" :style="{ fg: 'white' }" />
      <TText
        :x="1"
        :y="19"
        :w="76"
        value="• 绿色=达标 黄色=偏长 红色=偏短"
        :style="{ fg: 'white' }"
      />

      <!-- 底部状态栏 -->
      <TText :x="1" :y="21" :w="76" :value="status" :style="{ fg: 'green' }" />
    </TBox>
  </TerminalProvider>
</template>

<style scoped>
.panel {
  padding: 20px;
  background: #1a1a2e;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.terminal-frame {
  border: 2px solid #333;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
</style>
