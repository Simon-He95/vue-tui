<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  createVueTuiLogoFrame,
  VUE_TUI_LOGO_COLS,
  VUE_TUI_LOGO_ROWS,
  vueTuiLogoPalette,
} from "../../../examples/shared/vue-tui-logo-layout.ts";
import { TerminalProvider } from "../../../src/vue/components/TerminalProvider.ts";
import { TText } from "../../../src/vue/components/TText.ts";
import { spaces } from "../../../src/vue/utils/text.ts";

const logoFrame = ref(0);
const logoPaint = computed(() => createVueTuiLogoFrame(logoFrame.value));
let logoTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  logoTimer = setInterval(() => {
    logoFrame.value += 1;
  }, 320);
});

onBeforeUnmount(() => {
  if (logoTimer) clearInterval(logoTimer);
});
</script>

<template>
  <div class="vt-hero">
    <div class="vt-hero__frame">
      <TerminalProvider
        :cols="VUE_TUI_LOGO_COLS"
        :rows="VUE_TUI_LOGO_ROWS"
        :default-style="{ fg: vueTuiLogoPalette.white, bg: vueTuiLogoPalette.bg }"
      >
        <TText
          v-for="(op, index) in logoPaint"
          :key="`${index}:${op.kind}:${op.x}:${op.y}:${op.w}:${op.text ?? ''}`"
          :x="op.x"
          :y="op.y"
          :w="op.w"
          :value="op.kind === 'fill' ? spaces(op.w) : op.text"
          :style="op.style"
        />
      </TerminalProvider>
    </div>
  </div>
</template>

<style scoped>
.vt-hero {
  width: min(100vw - 2rem, 840px);
  margin: 1.5rem 0 2rem;
}

.vt-hero__frame {
  overflow: hidden;
  border: 1px solid rgba(66, 184, 131, 0.28);
  border-radius: 8px;
  padding: 1rem;
  background: #0b1117;
  box-shadow:
    0 24px 70px rgba(2, 6, 23, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

@media (max-width: 960px) {
  .vt-hero__frame {
    overflow-x: auto;
    padding: 0.85rem;
  }
}
</style>
