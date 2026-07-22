<script setup lang="ts">
import type { Style } from "@simon_he/vue-tui";
import type { TVideoFrameSource } from "@simon_he/vue-tui/experimental";
import { computed, ref, watchEffect } from "vue";
import { TText, TView } from "@simon_he/vue-tui";
import { useLayout, useTerminal } from "@simon_he/vue-tui/vue";
import { showcaseDemos } from "./showcase-demos";
import {
  nextShowcaseThemeMode,
  showcaseChromeTheme,
  showcaseTerminalStyle,
  type ShowcaseThemeMode,
} from "./showcase-theme";

const props = defineProps<{
  onThemeChange?: (mode: ShowcaseThemeMode) => void;
  videoSrc: string;
  videoFrameSource: TVideoFrameSource;
}>();

const layout = useLayout();
const terminal = useTerminal();

const firstDemo = showcaseDemos[0]!;
const activeId = ref(firstDemo.id);
const themeMode = ref<ShowcaseThemeMode>("dark");

const cols = computed(() => Math.max(1, layout.clipRect?.w ?? 90));
const rows = computed(() => Math.max(1, layout.clipRect?.h ?? 32));
const activeIndex = computed(() =>
  Math.max(
    0,
    showcaseDemos.findIndex((demo) => demo.id === activeId.value),
  ),
);
const activeDemo = computed(() => showcaseDemos[activeIndex.value] ?? firstDemo);
const activeDemoProps = computed(() =>
  activeDemo.value.id === "video"
    ? { videoSrc: props.videoSrc, videoFrameSource: props.videoFrameSource }
    : {},
);
const providerKey = computed(() => `${themeMode.value}:${activeDemo.value.id}`);

const theme = computed(() => showcaseChromeTheme(themeMode.value));

const appDefaultStyle = computed<Style>(() => ({
  ...showcaseTerminalStyle(themeMode.value),
  ...(activeDemo.value.defaultStyle as Style),
}));
const demoSurfaceStyle = computed<Style>(() => showcaseTerminalStyle(themeMode.value));

const backgroundRows = computed(() => Array.from({ length: rows.value }, (_, y) => y));
const tabW = 18;
const visibleTabCount = computed(() =>
  Math.max(1, Math.min(showcaseDemos.length, Math.floor(cols.value / tabW))),
);
const tabStart = computed(() => {
  const count = visibleTabCount.value;
  const maxStart = Math.max(0, showcaseDemos.length - count);
  return Math.max(0, Math.min(maxStart, activeIndex.value - Math.floor(count / 2)));
});
const visibleTabs = computed(() =>
  showcaseDemos
    .slice(tabStart.value, tabStart.value + visibleTabCount.value)
    .map((demo, offset) => {
      const index = tabStart.value + offset;
      return {
        demo,
        index,
        x: offset * tabW,
        w: Math.min(tabW, cols.value - offset * tabW),
        label: `${index + 1} ${demo.label}`,
      };
    }),
);
const demoY = 5;
const demoH = computed(() => Math.max(1, rows.value - demoY));
const demoRows = computed(() => Array.from({ length: demoH.value }, (_, y) => y));
const statusText = computed(
  () =>
    `${activeIndex.value + 1}/${showcaseDemos.length} ${activeDemo.value.cols}x${activeDemo.value.rows} ${themeMode.value}`,
);

watchEffect(() => {
  terminal.defaultStyle.value = appDefaultStyle.value;
  props.onThemeChange?.(themeMode.value);
  terminal.scheduler.invalidate();
});

function setActiveIndex(index: number) {
  const total = showcaseDemos.length;
  const next = showcaseDemos[(index + total) % total];
  if (next) activeId.value = next.id;
}

function onKeydown(event: any) {
  const key = String(event?.key ?? "");
  if (event?.ctrlKey && (key === "ArrowRight" || key === "]")) {
    event.preventDefault?.();
    event.stopPropagation?.();
    setActiveIndex(activeIndex.value + 1);
  } else if (event?.ctrlKey && (key === "ArrowLeft" || key === "[")) {
    event.preventDefault?.();
    event.stopPropagation?.();
    setActiveIndex(activeIndex.value - 1);
  } else if (event?.ctrlKey && key.toLowerCase() === "t") {
    event.preventDefault?.();
    event.stopPropagation?.();
    themeMode.value = nextShowcaseThemeMode(themeMode.value);
  }
}
</script>

<template>
  <TView :x="0" :y="0" :w="cols" :h="rows" focusable autoFocus @keydownCapture="onKeydown">
    <TText
      v-for="y in backgroundRows"
      :key="`bg:${y}`"
      :x="0"
      :y="y"
      :w="cols"
      :value="' '.repeat(cols)"
      :style="theme.base"
    />

    <TText
      :x="0"
      :y="0"
      :w="Math.max(1, cols - 18)"
      value="Vue TUI Terminal Showcase"
      :style="theme.accent"
    />
    <TText :x="Math.max(0, cols - 18)" :y="0" :w="18" :value="statusText" :style="theme.muted" />
    <TText
      :x="0"
      :y="1"
      :w="cols"
      value="Ctrl+Left/Right switch demo · Ctrl+T theme · Ctrl+C exit"
      :style="theme.muted"
    />

    <TText v-if="tabStart > 0" :x="0" :y="2" :w="1" value="<" :style="theme.accent" />
    <TText
      v-if="tabStart + visibleTabCount < showcaseDemos.length"
      :x="Math.max(0, cols - 1)"
      :y="2"
      :w="1"
      value=">"
      :style="theme.accent"
    />
    <TView
      v-for="tab in visibleTabs"
      :key="tab.demo.id"
      :x="tab.x"
      :y="2"
      :w="tab.w"
      :h="1"
      focusable
      @click="activeId = tab.demo.id"
    >
      <TText
        :x="0"
        :y="0"
        :w="tab.w"
        :value="tab.label"
        :style="tab.demo.id === activeDemo.id ? theme.active : theme.inactive"
      />
    </TView>

    <TText :x="0" :y="3" :w="cols" :value="activeDemo.summary" :style="theme.muted" />
    <TText :x="0" :y="4" :w="cols" :value="'─'.repeat(cols)" :style="theme.accent" />

    <TText
      v-for="y in demoRows"
      :key="`demo-bg:${y}`"
      :x="0"
      :y="demoY + y"
      :w="cols"
      :value="' '.repeat(cols)"
      :style="demoSurfaceStyle"
    />

    <TView :key="providerKey" :x="0" :y="demoY" :w="cols" :h="demoH">
      <component :is="activeDemo.component" :key="providerKey" v-bind="activeDemoProps" />
    </TView>
  </TView>
</template>
