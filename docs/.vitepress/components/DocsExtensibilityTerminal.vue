<script setup lang="ts">
import { computed, ref } from "vue";
import { TerminalProvider } from "../../../src/vue/components/TerminalProvider.ts";
import { TBox } from "../../../src/vue/components/TBox.ts";
import { TInput } from "../../../src/vue/components/TInput.ts";
import { TSelect } from "../../../src/vue/components/TSelect.ts";
import { TText } from "../../../src/vue/components/TText.ts";
import type { TInputPlugin } from "../../../src/vue/components/input/plugins/types.ts";

const cols = 92;
const rows = 20;

const routeDraft = ref("docs/live showcase");

const routePlugin = {
  name: "route-normalizer",
  install(ctx) {
    ctx.registerTextFilter(({ text }) =>
      text
        .normalize("NFKD")
        .replace(/[^\x00-\x7F]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9/_-]+/g, "")
        .toLowerCase(),
    );

    ctx.registerKeydownInterceptor((event) => {
      if (event.key !== "F2") return false;
      event.preventDefault();
      ctx.insertText("/:id");
      return true;
    });
  },
} satisfies TInputPlugin;

const hostOptions = ["CLI shell", "Web workspace", "IDE panel", "Automation hub"];
const hostIndex = ref(0);

const hostLines = computed(() => {
  switch (hostOptions[hostIndex.value]) {
    case "Web workspace":
      return [
        "renderer: DOM",
        "state: Pinia or route store",
        "plugins: input / theme / analytics",
        "transport: fetch / sse / websocket",
      ];
    case "IDE panel":
      return [
        "renderer: DOM inside extension webview",
        "state: session bridge + host commands",
        "plugins: mentions / command palette / shortcuts",
        "transport: RPC bridge",
      ];
    case "Automation hub":
      return [
        "renderer: DOM or headless snapshots",
        "state: job queue / run history",
        "plugins: schedule panels / audit overlays",
        "transport: async task API",
      ];
    default:
      return [
        "renderer: stdout",
        "state: in-memory or persisted sessions",
        "plugins: input / approvals / theme packs",
        "transport: stdio / local process",
      ];
  }
});
</script>

<template>
  <div class="vt-ext">
    <div class="vt-ext__frame">
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
          title="Extensibility Playground"
          :padding="1"
          :style="{ fg: 'cyanBright', bg: 'black' }"
        >
          <TBox
            :x="0"
            :y="0"
            :w="42"
            :h="15"
            title="Custom input plugin"
            :padding="1"
            :style="{ fg: 'whiteBright' }"
          >
            <TText
              :x="0"
              :y="0"
              :w="36"
              value="这个输入框通过插件自动做 route slug 归一化。按 F2 会插入 /:id。"
              :style="{ fg: 'yellowBright' }"
            />

            <TInput
              v-model="routeDraft"
              :x="0"
              :y="3"
              :w="34"
              placeholder="Type a route or command"
              :plugins="[routePlugin]"
              :style="{ fg: 'greenBright' }"
            />

            <TText
              :x="0"
              :y="6"
              :w="36"
              value="Normalized output"
              :style="{ fg: 'cyanBright', bold: true }"
            />
            <TText
              :x="0"
              :y="7"
              :w="36"
              :value="routeDraft || '(empty)'"
              :style="{ fg: 'whiteBright' }"
            />
            <TText
              :x="0"
              :y="10"
              :w="36"
              value="现有 `TInput.plugins` 已经能承接格式化、校验、补全、chips、键盘拦截等输入侧扩展。"
              :style="{ dim: true }"
            />
          </TBox>

          <TBox
            :x="43"
            :y="0"
            :w="45"
            :h="15"
            title="Host adaptation seams"
            :padding="1"
            :style="{ fg: 'magentaBright' }"
          >
            <TText
              :x="0"
              :y="0"
              :w="39"
              value="选一个宿主形态，看看需要替换的能力边界。"
              :style="{ dim: true }"
            />

            <TSelect v-model="hostIndex" :x="0" :y="2" :w="39" :h="4" :options="hostOptions" />

            <template v-for="(line, index) in hostLines" :key="line">
              <TText
                :x="0"
                :y="7 + index * 2"
                :w="39"
                :value="line"
                :style="index === 0 ? { fg: 'whiteBright', bold: true } : undefined"
              />
            </template>
          </TBox>

          <TText
            :x="1"
            :y="17"
            :w="86"
            value="更推荐的演进方式是：保持组件层通用，把 suggestion provider、tool actions、message renderer、theme pack 放到注入层。"
            :style="{ fg: 'greenBright' }"
          />
        </TBox>
      </TerminalProvider>
    </div>
  </div>
</template>

<style scoped>
.vt-ext {
  margin: 1.5rem 0 2rem;
}

.vt-ext__frame {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  padding: 1rem;
  background:
    radial-gradient(circle at top left, rgba(34, 197, 94, 0.14), transparent 24%),
    radial-gradient(circle at bottom right, rgba(192, 132, 252, 0.12), transparent 22%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.98), rgba(10, 15, 30, 0.98));
}

@media (max-width: 960px) {
  .vt-ext__frame {
    overflow-x: auto;
    padding: 0.85rem;
  }
}
</style>
