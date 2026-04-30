<script setup lang="ts">
import { ref, computed } from "vue";
import { TerminalProvider, TBox, TText, TInput, useLayout } from "@simon_he/vue-tui";

// 获取终端布局信息
const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 80);
const rows = computed(() => layout.clipRect?.h ?? 24);

// 20字小作文数据
const essay = ref("春风拂面柳丝长，桃花满园映朝阳，燕子归来筑新巢，一派生机春意盎");

// 输入框用于修改小作文
const inputEssay = ref(essay.value);

// 计算字符数
const charCount = computed(() => inputEssay.value.length);

// 确认输入
const confirmEssay = () => {
  essay.value = inputEssay.value;
};
</script>

<template>
  <TerminalProvider :cols="80" :rows="24" :default-style="{ fg: 'whiteBright' }">
    <!-- 主边框 -->
    <TBox
      :x="1"
      :y="1"
      :w="78"
      :h="22"
      border
      title="20字小作文生成器"
      :style="{ fg: 'cyanBright' }"
      :padding="1"
    >
      <!-- 小作文显示区域 -->
      <TText :x="1" :y="1" :w="76" value="当前小作文：" :style="{ fg: 'yellowBright' }" />
      <TText :x="1" :y="3" :w="76" :value="essay" :style="{ fg: 'greenBright', bold: true }" />

      <!-- 字符统计 -->
      <TText :x="1" :y="5" :w="76" :value="`字符数：${charCount}`" :style="{ fg: 'blueBright' }" />

      <!-- 分隔线 -->
      <TText
        :x="1"
        :y="7"
        :w="76"
        value="──────────────────────────────────────────────────────"
        :style="{ fg: 'gray' }"
      />

      <!-- 输入区域 -->
      <TText
        :x="1"
        :y="9"
        :w="76"
        value="输入新的小作文（按Enter确认）："
        :style="{ fg: 'yellowBright' }"
      />
      <TInput
        :x="1"
        :y="11"
        :w="76"
        v-model="inputEssay"
        placeholder="请输入20字小作文..."
        @keydown.enter="confirmEssay"
      />

      <!-- 提示信息 -->
      <TText :x="1" :y="14" :w="76" value="提示：" :style="{ fg: 'magentaBright' }" />
      <TText :x="1" :y="15" :w="76" value="• 在输入框中输入文字" :style="{ fg: 'white' }" />
      <TText :x="1" :y="16" :w="76" value="• 按Enter键确认修改" :style="{ fg: 'white' }" />
      <TText :x="1" :y="17" :w="76" value="• 当前显示的是默认小作文" :style="{ fg: 'white' }" />

      <!-- 底部状态栏 -->
      <TText :x="1" :y="19" :w="76" value="系统状态：就绪" :style="{ fg: 'green' }" />
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
