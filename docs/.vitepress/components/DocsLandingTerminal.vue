<script setup lang="ts">
import { computed, ref } from "vue";
import { TerminalProvider } from "../../../src/vue/components/TerminalProvider.ts";
import { TBox } from "../../../src/vue/components/TBox.ts";
import { TFlow } from "../../../src/vue/components/TFlow.ts";
import { TInputBox } from "../../../src/vue/components/TInputBox.ts";
import { TSelect } from "../../../src/vue/components/TSelect.ts";
import { TText } from "../../../src/vue/components/TText.ts";

const cols = 92;
const rows = 24;

const apiSketch = ref("createTerminalApp({ cols: 92, rows: 24, component: App })");

const audienceOptions = ["CLI Agent Shell", "IDE Assistant Panel", "Ops Dashboard"];
const audienceIndex = ref(1);
const selectedAudience = computed(
  () => audienceOptions[audienceIndex.value] ?? audienceOptions[0]!,
);

const featureRows = [
  {
    label: "DOM renderer",
    detail: "docs site, browser sandbox, visual QA",
    style: { fg: "cyanBright", bold: true },
  },
  {
    label: "stdout renderer",
    detail: "real terminal, snapshot replay, parity tests",
    style: { fg: "greenBright", bold: true },
  },
  {
    label: "Vue components",
    detail: "same mental model as browser-side composition",
    style: { fg: "yellowBright", bold: true },
  },
];

const seams = computed(() => [
  `host: ${selectedAudience.value}`,
  "renderer: DOM / stdout",
  "state: Pinia or custom store",
  "extensions: input plugins / data adapters",
]);
</script>

<template>
  <div class="vt-hero">
    <div class="vt-hero__meta">
      <span>DOM renderer</span>
      <span>stdout renderer</span>
      <span>plugin-ready</span>
    </div>

    <div class="vt-hero__frame">
      <TerminalProvider
        :cols="cols"
        :rows="rows"
        :default-style="{ fg: 'whiteBright', bg: 'black' }"
      >
        <TBox
          :x="0"
          :y="0"
          :w="cols"
          :h="rows"
          title="Vue TUI // Browser-rendered terminal UI"
          :padding="1"
          :style="{ fg: 'cyanBright', bg: 'black' }"
        >
          <TBox
            :x="0"
            :y="0"
            :w="56"
            :h="20"
            title="Build once, host anywhere"
            :padding="1"
            :style="{ fg: 'whiteBright', bg: 'black' }"
          >
            <TText
              :x="0"
              :y="0"
              :w="50"
              value="用 Vue 组件开发终端 UI，同时保留浏览器文档站和真实终端运行时。"
            />
            <TText
              :x="0"
              :y="2"
              :w="50"
              value="这意味着我们可以把官网、交互 demo、CLI parity 测试和参考应用放在同一套组件树上。"
              :style="{ fg: 'yellowBright' }"
            />

            <TInputBox
              v-model="apiSketch"
              :x="0"
              :y="5"
              :w="52"
              :h="3"
              title="API sketch"
              placeholder="Describe the host app here"
              :style="{ fg: 'greenBright' }"
            />

            <TText
              :x="0"
              :y="9"
              :w="50"
              value="Core capabilities"
              :style="{ fg: 'greenBright', bold: true }"
            />

            <TFlow :x="0" :y="10" :w="50" :h="6" :items="featureRows" :item-size="1">
              <template #item="{ item }">
                <TText
                  :x="0"
                  :y="0"
                  :w="50"
                  :value="`${item.label}  ${item.detail}`"
                  :style="item.style"
                />
              </template>
            </TFlow>

            <TText
              :x="0"
              :y="17"
              :w="50"
              value="当前更准确的定位是 framework + reference app，而不是仅为 dimcode CLI 服务的私有界面层。"
              :style="{ dim: true }"
            />
          </TBox>

          <TBox
            :x="57"
            :y="0"
            :w="31"
            :h="20"
            title="Target profile"
            :padding="1"
            :style="{ fg: 'magentaBright', bg: 'black' }"
          >
            <TText :x="0" :y="0" :w="25" value="选择一个宿主场景" :style="{ dim: true }" />

            <TSelect
              v-model="audienceIndex"
              :x="0"
              :y="2"
              :w="25"
              :h="5"
              :options="audienceOptions"
              :style="{ fg: 'whiteBright' }"
              :highlight-style="{ fg: 'black', bg: 'yellowBright', bold: true }"
            />

            <TText
              :x="0"
              :y="9"
              :w="25"
              value="Recommended seams"
              :style="{ fg: 'cyanBright', bold: true }"
            />

            <template v-for="(row, index) in seams" :key="row">
              <TText
                :x="0"
                :y="10 + index"
                :w="25"
                :value="row"
                :style="index === 0 ? { fg: 'whiteBright', bold: true } : undefined"
              />
            </template>
          </TBox>

          <TText
            :x="1"
            :y="21"
            :w="86"
            value="这个站点现在既是文档页，也是 live renderer：你在浏览器里看到的就是 TerminalProvider + DOM renderer 的真实输出。"
            :style="{ fg: 'greenBright' }"
          />
        </TBox>
      </TerminalProvider>
    </div>
  </div>
</template>

<style scoped>
.vt-hero {
  margin: 1.5rem 0 2rem;
}

.vt-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.vt-hero__meta span {
  border: 1px solid rgba(87, 117, 144, 0.45);
  border-radius: 999px;
  padding: 0.28rem 0.72rem;
  background: linear-gradient(135deg, rgba(8, 18, 31, 0.9), rgba(17, 39, 59, 0.76));
  color: rgba(226, 232, 240, 0.95);
  font:
    600 0.72rem/1.1 "IBM Plex Mono",
    "JetBrains Mono",
    monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.vt-hero__frame {
  overflow: hidden;
  border: 1px solid rgba(96, 165, 250, 0.24);
  border-radius: 22px;
  padding: 1rem;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 30%),
    radial-gradient(circle at top right, rgba(251, 191, 36, 0.12), transparent 26%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.98), rgba(10, 15, 30, 0.98));
  box-shadow:
    0 24px 70px rgba(15, 23, 42, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

@media (max-width: 960px) {
  .vt-hero__frame {
    overflow-x: auto;
    padding: 0.85rem;
  }
}
</style>
