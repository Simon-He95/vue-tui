<script setup lang="ts">
import { TerminalProvider } from "@simon_he/vue-tui";
import TableDemo from "./TableDemo.vue";

const cols = 60;
const rows = 16;
</script>

<template>
  <div class="panel">
    <div class="hint">表格示例 - 展示带边框的表格、状态颜色、格式化数据</div>

    <div class="terminal-frame">
      <TerminalProvider :cols="cols" :rows="rows" :default-style="{ fg: 'whiteBright' }">
        <TableDemo />
      </TerminalProvider>
    </div>
  </div>
</template>
