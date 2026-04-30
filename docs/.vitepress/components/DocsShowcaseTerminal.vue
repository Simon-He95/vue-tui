<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TerminalProvider } from "../../../src/vue/components/TerminalProvider.ts";
import { TBox } from "../../../src/vue/components/TBox.ts";
import { TDialog } from "../../../src/vue/components/TDialog.ts";
import { TFlow } from "../../../src/vue/components/TFlow.ts";
import { TInputBox } from "../../../src/vue/components/TInputBox.ts";
import { TJsonEditor } from "../../../src/vue/components/TJsonEditor.ts";
import { TList } from "../../../src/vue/components/TList.ts";
import { TSelect } from "../../../src/vue/components/TSelect.ts";
import { TText } from "../../../src/vue/components/TText.ts";
import { TTransition } from "../../../src/vue/components/TTransition.ts";

const cols = 92;
const rows = 26;

const scenes = [
  { id: "layout", label: "Layout + copy" },
  { id: "forms", label: "Forms + editing" },
  { id: "overlay", label: "Overlay + focus" },
] as const;

type SceneId = (typeof scenes)[number]["id"];

const scene = ref<SceneId>("layout");

const capabilityRows = [
  {
    title: "Absolute layout",
    detail: "TBox / TView / TAnchor keep cell-accurate placement",
    style: { fg: "cyanBright", bold: true },
  },
  {
    title: "Event routing",
    detail: "focus, keyboard, pointer and wheel follow zIndex rules",
    style: { fg: "yellowBright", bold: true },
  },
  {
    title: "Renderer parity",
    detail: "DOM demos and stdout snapshots share the same component tree",
    style: { fg: "greenBright", bold: true },
  },
  {
    title: "Reference app reuse",
    detail: "GoatChain shell shows how to package a full TUI product",
    style: { fg: "magentaBright", bold: true },
  },
];

const commandDraft = ref("/plan add plugin registry for message renderers");
const rendererIndex = ref(0);
const rendererOptions = ["DOM docs", "stdout CLI", "embedded panel"];
const hostIndex = ref(1);
const hostOptions = ["CLI shell", "IDE panel", "Ops cockpit", "QA harness"];
const configText = ref(
  '{\n  "renderer": "dom",\n  "transport": "sse",\n  "plugins": ["input", "theme"]\n}',
);

const overlayDialogOpen = ref(true);
const overlayBannerVisible = ref(true);

watch(scene, (nextScene) => {
  if (nextScene === "overlay") {
    overlayDialogOpen.value = true;
    overlayBannerVisible.value = true;
  }
});

const selectedRenderer = computed(
  () => rendererOptions[rendererIndex.value] ?? rendererOptions[0]!,
);
const selectedHost = computed(() => hostOptions[hostIndex.value] ?? hostOptions[0]!);
</script>

<template>
  <div class="vt-showcase">
    <div class="vt-showcase__controls">
      <button
        v-for="item in scenes"
        :key="item.id"
        class="vt-showcase__chip"
        :class="{ 'is-active': scene === item.id }"
        type="button"
        @click="scene = item.id"
      >
        {{ item.label }}
      </button>

      <button
        v-if="scene === 'overlay'"
        class="vt-showcase__chip vt-showcase__chip--ghost"
        type="button"
        @click="overlayBannerVisible = !overlayBannerVisible"
      >
        {{ overlayBannerVisible ? "Hide banner" : "Show banner" }}
      </button>
    </div>

    <div class="vt-showcase__frame">
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
          title="Live Showcase"
          :padding="1"
          :style="{ fg: 'cyanBright', bg: 'black' }"
        >
          <template v-if="scene === 'layout'">
            <TBox
              :x="0"
              :y="0"
              :w="56"
              :h="20"
              title="Scene // Layout"
              :padding="1"
              :style="{ fg: 'whiteBright' }"
            >
              <TText
                :x="0"
                :y="0"
                :w="50"
                value="这一屏重点看布局、文案承载和 renderer parity，而不是业务状态。"
              />

              <TFlow :x="0" :y="2" :w="50" :h="8" :items="capabilityRows" :item-size="2">
                <template #item="{ item }">
                  <TText :x="0" :y="0" :w="50" :value="item.title" :style="item.style" />
                  <TText :x="0" :y="1" :w="50" :value="item.detail" :style="{ dim: true }" />
                </template>
              </TFlow>

              <TText
                :x="0"
                :y="14"
                :w="50"
                value="适合：landing page demo、SaaS cockpit、workflow console、agent sandbox。"
                :style="{ fg: 'yellowBright' }"
              />
              <TText
                :x="0"
                :y="16"
                :w="50"
                value="不适合直接塞太多业务特例，建议把 host-specific 行为上移到 app/provider 层。"
                :style="{ dim: true }"
              />
            </TBox>

            <TBox
              :x="57"
              :y="0"
              :w="31"
              :h="20"
              title="Layer map"
              :padding="1"
              :style="{ fg: 'magentaBright' }"
            >
              <TText
                :x="0"
                :y="0"
                :w="25"
                value="core      createTerminal()"
                :style="{ fg: 'whiteBright', bold: true }"
              />
              <TText :x="0" :y="2" :w="25" value="renderer  DOM / stdout" />
              <TText :x="0" :y="4" :w="25" value="vue       components / router / runtime" />
              <TText :x="0" :y="6" :w="25" value="app        shell / provider / store" />
              <TText
                :x="0"
                :y="9"
                :w="25"
                value="把 dimcode / GoatChain 放在最上层，就不会把框架本身锁死。"
                :style="{ dim: true }"
              />
            </TBox>
          </template>

          <template v-else-if="scene === 'forms'">
            <TBox
              :x="0"
              :y="0"
              :w="41"
              :h="20"
              title="Scene // Inputs"
              :padding="1"
              :style="{ fg: 'whiteBright' }"
            >
              <TInputBox
                v-model="commandDraft"
                :x="0"
                :y="0"
                :w="35"
                :h="3"
                title="Prompt"
                placeholder="Type a host command"
                :style="{ fg: 'greenBright' }"
              />
              <TText
                :x="0"
                :y="5"
                :w="35"
                value="TInput / TInputBox 负责文本编辑、选区、IME、插件扩展。"
                :style="{ dim: true }"
              />

              <TText
                :x="0"
                :y="8"
                :w="35"
                value="Renderer target"
                :style="{ fg: 'cyanBright', bold: true }"
              />
              <TSelect
                v-model="rendererIndex"
                :x="0"
                :y="9"
                :w="35"
                :h="4"
                :options="rendererOptions"
              />
              <TText
                :x="0"
                :y="14"
                :w="35"
                :value="`selected renderer: ${selectedRenderer}`"
                :style="{ fg: 'yellowBright' }"
              />
            </TBox>

            <TBox
              :x="42"
              :y="0"
              :w="22"
              :h="20"
              title="Pick host"
              :padding="1"
              :style="{ fg: 'yellowBright' }"
            >
              <TList v-model="hostIndex" :x="0" :y="0" :w="16" :h="8" :items="hostOptions" />
              <TText
                :x="0"
                :y="10"
                :w="16"
                :value="`host: ${selectedHost}`"
                :style="{ fg: 'whiteBright', bold: true }"
              />
              <TText
                :x="0"
                :y="12"
                :w="16"
                value="TList / TSelect 适合 picker、palette、queue review。"
                :style="{ dim: true }"
              />
            </TBox>

            <TBox
              :x="65"
              :y="0"
              :w="23"
              :h="20"
              title="Structured text"
              :padding="1"
              :style="{ fg: 'magentaBright' }"
            >
              <TJsonEditor
                v-model="configText"
                :x="0"
                :y="0"
                :w="17"
                :h="12"
                :style="{ fg: 'whiteBright' }"
              />
              <TText
                :x="0"
                :y="14"
                :w="17"
                value="TJsonEditor 是带 lint + guide 的高级输入层，可做配置、schema、tool args 编辑。"
                :style="{ dim: true }"
              />
            </TBox>
          </template>

          <template v-else>
            <TText
              :x="0"
              :y="0"
              :w="86"
              value="这一屏展示 overlay、focus 恢复、teleport 和 transition，而不是普通页面布局。"
              :style="{ fg: 'whiteBright' }"
            />

            <TTransition :show="overlayBannerVisible" :duration="320">
              <template #default="{ progress }">
                <TBox
                  :x="0"
                  :y="2"
                  :w="60"
                  :h="4"
                  title="Transition banner"
                  :padding="1"
                  :style="{
                    fg: progress > 0.5 ? 'yellowBright' : 'yellow',
                    bg: 'black',
                  }"
                >
                  <TText
                    :x="0"
                    :y="0"
                    :w="54"
                    value="TTransition 让 modal, toast, inline banner 都能按 phase/progress 驱动。"
                  />
                </TBox>
              </template>
            </TTransition>

            <TDialog
              v-model="overlayDialogOpen"
              :w="42"
              :h="10"
              title="Overlay contract"
              teleport
              :buttons="[
                {
                  label: 'Approve',
                  value: 'approve',
                  kind: 'primary',
                  default: true,
                },
                { label: 'Cancel', value: 'cancel', kind: 'muted' },
              ]"
              :style="{ fg: 'cyanBright' }"
              @close="overlayDialogOpen = false"
              @confirm="overlayDialogOpen = false"
            >
              <TText
                :x="0"
                :y="0"
                :w="36"
                value="TDialog 负责 backdrop、Esc、button focus 和 runtime portal。"
              />
              <TText
                :x="0"
                :y="2"
                :w="36"
                value="这类能力应保持通用，不要把 approval / session / tool 语义写死在框架里。"
                :style="{ dim: true }"
              />
              <TText
                :x="0"
                :y="5"
                :w="36"
                value="通过 app 层 provider 注入业务动作，组件层只保留交互壳子。"
                :style="{ fg: 'greenBright' }"
              />
            </TDialog>

            <TBox
              :x="62"
              :y="5"
              :w="26"
              :h="12"
              title="Checklist"
              :padding="1"
              :style="{ fg: 'greenBright' }"
            >
              <TText :x="0" :y="0" :w="20" value="1. teleport to root" />
              <TText :x="0" :y="2" :w="20" value="2. restore focus" />
              <TText :x="0" :y="4" :w="20" value="3. close on Esc / blur" />
              <TText :x="0" :y="6" :w="20" value="4. keep host action pluggable" />
              <TText
                :x="0"
                :y="9"
                :w="20"
                value="overlay 语义越通用，越容易复用到 IDE / dashboard / chat host。"
                :style="{ dim: true }"
              />
            </TBox>
          </template>

          <TText
            :x="1"
            :y="23"
            :w="86"
            value="这页重点是把 live demo 直接放进网站，而不是再开一个与终端实现分离的营销壳。"
            :style="{ fg: 'greenBright' }"
          />
        </TBox>
      </TerminalProvider>
    </div>
  </div>
</template>

<style scoped>
.vt-showcase {
  margin: 1.5rem 0 2rem;
}

.vt-showcase__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 0.95rem;
}

.vt-showcase__chip {
  border: 1px solid rgba(71, 85, 105, 0.46);
  border-radius: 999px;
  padding: 0.42rem 0.82rem;
  background: rgba(15, 23, 42, 0.72);
  color: rgba(226, 232, 240, 0.92);
  font:
    600 0.78rem/1.1 "IBM Plex Mono",
    "JetBrains Mono",
    monospace;
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}

.vt-showcase__chip:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.58);
}

.vt-showcase__chip.is-active {
  border-color: rgba(56, 189, 248, 0.72);
  background: linear-gradient(135deg, rgba(14, 116, 144, 0.9), rgba(22, 78, 99, 0.76));
}

.vt-showcase__chip--ghost {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.62), rgba(67, 20, 7, 0.52));
}

.vt-showcase__frame {
  overflow: hidden;
  border: 1px solid rgba(96, 165, 250, 0.22);
  border-radius: 22px;
  padding: 1rem;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 28%),
    radial-gradient(circle at bottom right, rgba(250, 204, 21, 0.12), transparent 24%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.99), rgba(8, 15, 28, 0.99));
}

@media (max-width: 960px) {
  .vt-showcase__frame {
    overflow-x: auto;
    padding: 0.85rem;
  }
}
</style>
