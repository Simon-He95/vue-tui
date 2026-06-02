<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  TBox,
  TCommandPalette,
  TInput,
  TText,
  TView,
  type TCommandPaletteSelectPayload,
} from "@simon_he/vue-tui";
import { useLayout } from "@simon_he/vue-tui/vue";
import { wrapByCells } from "../../shared/text-utils";

const layout = useLayout();
const cols = computed(() => layout.clipRect?.w ?? 86);
const rows = computed(() => layout.clipRect?.h ?? 28);

const paletteOpen = ref(false);
const prompt = ref("summarize the failing deploy");
const userMessage = ref("summarize the failing deploy");
const assistantText = ref("");
const toolStatus = ref("tool: log.search running");
const toolOutput = ref("query=ERROR service=api · scanned 96 lines · 6 matches");
let timer: ReturnType<typeof setInterval> | null = null;

const response =
  "The deploy is blocked by repeated API connection failures. The renderer and worker streams are healthy, but API retries are clustering around the status endpoint. Suggested next step: rerun after checking the runbook link and service credentials.";

const commands = [
  {
    label: "Summarize logs",
    detail: "Ask the agent to summarize current failures",
    value: "summary",
  },
  { label: "Inspect package scripts", detail: "Show package command plan", value: "scripts" },
  { label: "Retry tool call", detail: "Run log.search again", value: "retry" },
];

const contentW = computed(() => Math.max(10, cols.value - 8));
const assistantLines = computed(() =>
  wrapByCells(assistantText.value || "Thinking...", contentW.value),
);
const toolLines = computed(() => wrapByCells(toolOutput.value, contentW.value));

function stopStream() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startStream(text = response) {
  stopStream();
  assistantText.value = "";
  let index = 0;
  timer = setInterval(() => {
    assistantText.value = text.slice(0, index);
    index += 4;
    if (index > text.length + 4) stopStream();
  }, 55);
}

function submitPrompt(value: string) {
  const text = value.trim();
  if (!text) return;
  userMessage.value = text;
  prompt.value = "";
  toolStatus.value = "tool: log.search running";
  toolOutput.value = `query=${text.split(" ")[0] ?? "logs"} · read logs · produced context`;
  startStream(response);
}

function runCommand(payload: TCommandPaletteSelectPayload) {
  const value = String(payload.item.value ?? "");
  if (value === "scripts") {
    userMessage.value = "inspect package scripts";
    toolStatus.value = "tool: package.json read";
    toolOutput.value = "found showcase, build, lint, typecheck, docs and terminal example commands";
    startStream(
      "The package exposes focused scripts for demos, examples, docs, lint, typecheck and release checks. The showcase command is the browser entry for these demos.",
    );
  } else {
    submitPrompt(value === "retry" ? "retry log search" : "summarize logs");
  }
}

onMounted(() => startStream());
onBeforeUnmount(stopStream);
</script>

<template>
  <TView :x="0" :y="0" :w="cols" :h="rows" focusable autoFocus>
    <TBox
      :x="0"
      :y="0"
      :w="cols"
      :h="rows"
      border
      title="Mini Agent Shell"
      :padding="1"
      :style="{ fg: 'magentaBright' }"
    >
      <TText :x="0" :y="0" :w="cols - 4" value="Agent transcript, tool block, input and palette." />

      <TBox :x="0" :y="2" :w="cols - 4" :h="4" border title="User" :padding="1">
        <TText :x="0" :y="0" :w="contentW" :value="userMessage" :style="{ fg: 'cyanBright' }" />
      </TBox>

      <TBox :x="0" :y="7" :w="cols - 4" :h="5" border title="Tool Call" :padding="1">
        <TText
          :x="0"
          :y="0"
          :w="contentW"
          :value="toolStatus"
          :style="{ fg: 'yellowBright', bold: true }"
        />
        <TText
          v-for="(line, index) in toolLines.slice(0, 2)"
          :key="index"
          :x="0"
          :y="1 + index"
          :w="contentW"
          :value="line"
          :style="{ dim: true }"
        />
      </TBox>

      <TBox :x="0" :y="13" :w="cols - 4" :h="rows - 19" border title="Assistant" :padding="1">
        <TText
          v-for="(line, index) in assistantLines.slice(0, Math.max(1, rows - 22))"
          :key="index"
          :x="0"
          :y="index"
          :w="contentW"
          :value="line"
          :style="{ fg: 'whiteBright' }"
        />
      </TBox>

      <TText :x="0" :y="rows - 5" value="Prompt:" :style="{ bold: true }" />
      <TInput
        :x="8"
        :y="rows - 5"
        :w="Math.max(10, cols - 28)"
        v-model="prompt"
        placeholder="Ask the agent..."
        @change="submitPrompt"
      />
      <TView :x="cols - 18" :y="rows - 5" :w="14" :h="1" @click="paletteOpen = true" />
      <TText
        :x="cols - 18"
        :y="rows - 5"
        value="[ Commands ]"
        :style="{ fg: 'cyanBright', bold: true }"
      />
    </TBox>

    <TCommandPalette
      v-model="paletteOpen"
      title="Agent commands"
      placeholder="summary, inspect, retry..."
      :items="commands"
      close-on-select
      show-row-details
      :w="Math.min(72, cols - 6)"
      :h="14"
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
