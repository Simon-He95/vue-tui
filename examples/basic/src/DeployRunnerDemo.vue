<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import {
  TBox,
  TCommandPalette,
  TText,
  TView,
  type TCommandPaletteSelectPayload,
} from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 86);
const rows = computed(() => layout.clipRect?.h ?? 26);

const paletteOpen = ref(false);
const running = ref(false);
const progress = ref(0);
const environment = ref("staging");
const status = ref("ready");
const logs = ref<string[]>(["ready · choose a command or click Start Deploy"]);
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;

const steps = [
  "install dependencies",
  "typecheck workspace",
  "build package",
  "build examples",
  "upload assets",
  "promote release",
];

const commands = [
  { label: "Start staging deploy", detail: "deploy --env staging", value: "staging" },
  { label: "Start production deploy", detail: "deploy --env production", value: "production" },
  { label: "Run typecheck only", detail: "pnpm run typecheck", value: "typecheck" },
  { label: "Clear output", detail: "reset deploy runner", value: "clear" },
];

const progressBar = computed(() => {
  const filled = Math.floor(progress.value / 5);
  return `${"#".repeat(filled)}${"-".repeat(20 - filled)} ${progress.value}%`;
});

const visibleLogs = computed(() => logs.value.slice(Math.max(0, logs.value.length - 11)));

function append(line: string) {
  logs.value = [...logs.value, line].slice(-80);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function clearOutput() {
  stopTimer();
  running.value = false;
  progress.value = 0;
  status.value = "ready";
  logs.value = ["ready · choose a command or click Start Deploy"];
}

function startDeploy(env: string) {
  stopTimer();
  environment.value = env;
  running.value = true;
  progress.value = 0;
  status.value = "running";
  step = 0;
  logs.value = [`deploy:${env} · queued`];
  timer = setInterval(() => {
    const label = steps[step] ?? "finalize";
    progress.value = Math.min(100, Math.round(((step + 1) / steps.length) * 100));
    append(`✓ ${label}`);
    step++;
    if (step >= steps.length) {
      append(`live · ${env} deploy complete`);
      status.value = "live";
      running.value = false;
      stopTimer();
    } else {
      append(`→ ${steps[step]}`);
    }
  }, 650);
}

function runCommand(payload: TCommandPaletteSelectPayload) {
  const value = String(payload.item.value ?? "");
  if (value === "clear") clearOutput();
  else if (value === "typecheck") {
    clearOutput();
    append("pnpm run typecheck");
    append("✓ runtime tsconfig");
    append("✓ package tsconfig");
    status.value = "checked";
    progress.value = 100;
  } else startDeploy(value || "staging");
}

onBeforeUnmount(stopTimer);
</script>

<template>
  <TView :x="0" :y="0" :w="cols" :h="rows" focusable autoFocus>
    <TBox
      :x="0"
      :y="0"
      :w="cols"
      :h="rows"
      border
      title="Deploy Runner"
      :padding="1"
      :style="{ fg: 'yellowBright' }"
    >
      <TText
        :x="0"
        :y="0"
        :w="cols - 4"
        :value="`Environment: ${environment}     Branch: main     Status: ${status}`"
      />
      <TText :x="0" :y="2" :w="cols - 4" :value="`Progress: [${progressBar}]`" />

      <TBox :x="0" :y="4" :w="cols - 4" :h="rows - 9" border title="Output" :padding="1">
        <TText
          v-for="(line, index) in visibleLogs"
          :key="`${index}:${line}`"
          :x="0"
          :y="index"
          :w="cols - 8"
          :value="line"
          :style="{
            fg: line.includes('✓')
              ? 'greenBright'
              : line.includes('→')
                ? 'cyanBright'
                : 'whiteBright',
          }"
        />
      </TBox>

      <TView :x="0" :y="rows - 5" :w="18" :h="1" @click="startDeploy(environment)" />
      <TText
        :x="0"
        :y="rows - 5"
        value="[ Start Deploy ]"
        :style="{ fg: running ? 'gray' : 'greenBright', bold: true }"
      />
      <TView :x="20" :y="rows - 5" :w="20" :h="1" @click="paletteOpen = true" />
      <TText
        :x="20"
        :y="rows - 5"
        value="[ Command Palette ]"
        :style="{ fg: 'cyanBright', bold: true }"
      />
    </TBox>

    <TCommandPalette
      v-model="paletteOpen"
      title="Deploy command"
      placeholder="deploy, typecheck, clear..."
      :items="commands"
      close-on-select
      show-row-details
      :w="Math.min(72, cols - 6)"
      :h="15"
      hint="Enter run · Esc close"
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
