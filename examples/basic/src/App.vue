<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { TerminalProvider } from "@simon_he/vue-tui";
import { showcaseDemos } from "./showcase-demos";
import {
  showcaseAnsiPalette,
  showcaseTerminalStyle,
  type ShowcaseThemeMode,
} from "./showcase-theme";

const themeMode = ref<ShowcaseThemeMode>("dark");

const terminalTheme = computed(() =>
  themeMode.value === "dark"
    ? {
        colors: {
          link: "cyanBright",
          success: "greenBright",
          warning: "yellowBright",
          danger: "redBright",
          info: "blueBright",
          muted: "white",
          accent: "magentaBright",
        },
        components: {
          TTable: {
            headerStyle: { fg: "cyanBright", bold: true },
            borderStyle: { fg: "blueBright", dim: true },
            activeStyle: { fg: "#111827", bg: "#5eead4", bold: true },
          },
        },
      }
    : {
        colors: {
          link: "blueBright",
          success: "green",
          warning: "yellow",
          danger: "redBright",
          info: "cyan",
          muted: "white",
          accent: "magenta",
        },
        components: {
          TTable: {
            headerStyle: { fg: "blueBright", bold: true },
            borderStyle: { fg: "cyan", dim: true },
            activeStyle: { fg: "#ffffff", bg: "#4f46e5", bold: true },
          },
        },
      },
);

const firstDemo = showcaseDemos[0]!;
const activeId = ref(firstDemo.id);
const activeDemo = computed(
  () => showcaseDemos.find((demo) => demo.id === activeId.value) ?? firstDemo,
);
const providerKey = computed(() => `${themeMode.value}:${activeDemo.value.id}`);
const providerDefaultStyle = computed(() => ({
  ...showcaseTerminalStyle(themeMode.value),
  ...activeDemo.value.defaultStyle,
}));
const terminalDomRendererOptions = computed(() => ({
  palette: showcaseAnsiPalette(themeMode.value),
}));

watchEffect(() => {
  document.documentElement.dataset.showcaseTheme = themeMode.value;
});
</script>

<template>
  <main class="showcase" :data-theme="themeMode">
    <header class="showcase-header">
      <div class="showcase-title">
        <div class="showcase-eyebrow">Browser DOM · CLI stdout · Headless tests</div>
        <h1>Vue TUI Demo Showcase</h1>
        <p>一个入口切换所有 showcase 和 basic demos。</p>
        <div class="ansi-strip" aria-hidden="true">
          <span class="ansi-swatch cyan" />
          <span class="ansi-swatch green" />
          <span class="ansi-swatch yellow" />
          <span class="ansi-swatch magenta" />
          <span class="ansi-swatch blue" />
        </div>
      </div>
      <div class="showcase-actions">
        <code>pnpm run showcase</code>
        <div class="theme-switch" role="group" aria-label="Theme">
          <button
            type="button"
            :class="{ active: themeMode === 'dark' }"
            :aria-pressed="themeMode === 'dark'"
            @click="themeMode = 'dark'"
          >
            Dark
          </button>
          <button
            type="button"
            :class="{ active: themeMode === 'light' }"
            :aria-pressed="themeMode === 'light'"
            @click="themeMode = 'light'"
          >
            Light
          </button>
        </div>
      </div>
    </header>

    <nav class="demo-tabs" role="tablist" aria-label="Vue TUI demos">
      <button
        v-for="demo in showcaseDemos"
        :id="`tab-${demo.id}`"
        :key="demo.id"
        class="demo-tab"
        :class="{ active: demo.id === activeDemo.id }"
        type="button"
        role="tab"
        :aria-controls="`panel-${demo.id}`"
        :aria-selected="demo.id === activeDemo.id"
        @click="activeId = demo.id"
      >
        {{ demo.label }}
      </button>
    </nav>

    <section
      :id="`panel-${activeDemo.id}`"
      class="demo-panel"
      role="tabpanel"
      :aria-labelledby="`tab-${activeDemo.id}`"
    >
      <div class="demo-meta">
        <div>
          <h2>{{ activeDemo.label }}</h2>
          <p>{{ activeDemo.summary }}</p>
        </div>
        <span>{{ activeDemo.cols }} x {{ activeDemo.rows }}</span>
      </div>

      <div class="terminal-frame demo-stage">
        <TerminalProvider
          :key="providerKey"
          :cols="activeDemo.cols"
          :rows="activeDemo.rows"
          :default-style="providerDefaultStyle"
          :theme="terminalTheme"
          :dom-renderer-options="terminalDomRendererOptions"
        >
          <component :is="activeDemo.component" />
        </TerminalProvider>
      </div>
    </section>
  </main>
</template>
