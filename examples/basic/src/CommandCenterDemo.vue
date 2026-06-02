<script setup lang="ts">
import { computed, ref } from "vue";
import {
  TBox,
  TCommandPalette,
  TText,
  TView,
  type TCommandPaletteSelectPayload,
} from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 82);
const rows = computed(() => layout.clipRect?.h ?? 24);

const paletteOpen = ref(false);
const status = ref("Ready. Click Open Palette or press Ctrl+K.");
const recent = ref<string[]>([
  "pnpm run typecheck",
  "pnpm run lint",
  "pnpm -C examples/basic build",
]);

const commands = [
  { kind: "group" as const, label: "Project" },
  { label: "Build package", detail: "pnpm run build", keywords: ["compile", "dist"] },
  { label: "Run tests", detail: "pnpm run test", keywords: ["vitest", "unit"] },
  { label: "Typecheck", detail: "pnpm run typecheck", keywords: ["tsc"] },
  {
    label: "Open Agent Console",
    detail: "pnpm run example:agent-console",
    keywords: ["agent", "demo"],
  },
  { kind: "separator" as const, label: "" },
  { kind: "group" as const, label: "Showcase" },
  { label: "Play Snake", detail: "Switch to the terminal-snake tab", keywords: ["game"] },
  { label: "Start Deploy Runner", detail: "Switch to Deploy Runner", keywords: ["ci", "logs"] },
  { label: "Search logs", detail: "Switch to Log Explorer", keywords: ["grep", "tlog"] },
];

function openPalette() {
  paletteOpen.value = true;
}

function onSurfaceKeydown(event: any) {
  const key = String(event?.key ?? "").toLowerCase();
  if (key === "k" && (event?.ctrlKey || event?.metaKey)) {
    event.preventDefault?.();
    openPalette();
  }
}

function runCommand(payload: TCommandPaletteSelectPayload) {
  const command = payload.item.detail || payload.item.label;
  status.value = `Queued: ${command}`;
  recent.value = [String(command), ...recent.value.filter((item) => item !== command)].slice(0, 5);
}
</script>

<template>
  <TView :x="0" :y="0" :w="cols" :h="rows" focusable autoFocus @keydown="onSurfaceKeydown">
    <TBox
      :x="0"
      :y="0"
      :w="cols"
      :h="rows"
      border
      title="Vue TUI Command Center"
      :padding="1"
      :style="{ fg: 'cyanBright' }"
    >
      <TText :x="0" :y="0" :w="cols - 4" value="Command-K workflow for terminal apps." />
      <TText :x="0" :y="2" :w="cols - 4" :value="status" :style="{ fg: 'greenBright' }" />

      <TBox
        :x="0"
        :y="4"
        :w="Math.min(32, cols - 4)"
        :h="5"
        border
        title="Action"
        :padding="0"
        :style="{ fg: 'yellowBright' }"
      >
        <TView :x="1" :y="1" :w="24" :h="1" @click="openPalette" />
        <TText :x="1" :y="1" value="[ Open Palette ]" :style="{ bold: true }" />
        <TText :x="1" :y="2" value="Ctrl+K opens commands" :style="{ dim: true }" />
      </TBox>

      <TBox
        :x="0"
        :y="11"
        :w="Math.min(54, cols - 4)"
        :h="Math.max(7, rows - 14)"
        border
        title="Recent actions"
        :padding="1"
        :style="{ fg: 'whiteBright' }"
      >
        <TText
          v-for="(item, index) in recent"
          :key="item"
          :x="0"
          :y="index"
          :w="Math.min(50, cols - 8)"
          :value="`✓ ${item}`"
          :style="{ fg: index === 0 ? 'greenBright' : 'whiteBright' }"
        />
      </TBox>
    </TBox>

    <TCommandPalette
      v-model="paletteOpen"
      title="Run command"
      placeholder="Type build, test, snake..."
      :items="commands"
      filter-strategy="fuzzy"
      close-on-select
      reset-query-on-close
      show-row-details
      :w="Math.min(72, cols - 6)"
      :h="18"
      hint="Enter run · Esc close · Arrow keys navigate"
      :chrome-style="{ fg: 'cyanBright', bg: 'black' }"
      :body-style="{ fg: 'whiteBright', bg: 'black' }"
      :input-style="{ fg: 'whiteBright', bg: 'black' }"
      :list-style="{ fg: 'whiteBright', bg: 'black' }"
      :divider-style="{ fg: 'white', bg: 'black' }"
      :hint-style="{ fg: 'whiteBright', bg: 'black' }"
      :empty-style="{ fg: 'whiteBright', bg: 'black' }"
      :highlight-style="{ fg: '#111827', bg: '#5eead4', bold: true }"
      @select="runCommand"
    />
  </TView>
</template>
