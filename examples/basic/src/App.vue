<script setup lang="ts">
import { TerminalProvider } from "@simon_he/vue-tui";
import Demo from "./Demo.vue";

const cols = 70;
const rows = 22;
</script>

<template>
  <div class="panel">
    <div class="hint">
      这个示例验证：v-if/v-show/v-for + v-model + click/focus/keydown + overlay zIndex（右侧 Todo
      支持输入新增/删除）。
    </div>

    <div class="terminal-frame">
      <TerminalProvider :cols="cols" :rows="rows" :default-style="{ fg: 'whiteBright' }">
        <Demo />
      </TerminalProvider>
    </div>
  </div>
</template>
