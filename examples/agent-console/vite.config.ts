import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: "@simon_he/vue-tui/core",
        replacement: fileURLToPath(new URL("../../src/core.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui/runtime",
        replacement: fileURLToPath(new URL("../../src/runtime.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui/observability",
        replacement: fileURLToPath(new URL("../../src/observability.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui/vue",
        replacement: fileURLToPath(new URL("../../src/vue.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui/experimental",
        replacement: fileURLToPath(new URL("../../src/experimental.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui/markdown",
        replacement: fileURLToPath(new URL("../../src/markdown.ts", import.meta.url)),
      },
      {
        find: "@simon_he/vue-tui",
        replacement: fileURLToPath(new URL("./src/vue-tui-browser.ts", import.meta.url)),
      },
      {
        find: /.*\/events\/index\.js$/,
        replacement: fileURLToPath(new URL("./src/vue-tui-browser-events.ts", import.meta.url)),
      },
      {
        find: /.*\/renderer\/index\.js$/,
        replacement: fileURLToPath(new URL("./src/vue-tui-browser-renderer.ts", import.meta.url)),
      },
      {
        find: /.*\/observability\/tui-profiler\.js$/,
        replacement: fileURLToPath(new URL("./src/vue-tui-browser-profiler.ts", import.meta.url)),
      },
      {
        find: /.*\/observability\/cli-latency\.js$/,
        replacement: fileURLToPath(
          new URL("./src/vue-tui-browser-cli-latency.ts", import.meta.url),
        ),
      },
      {
        find: /.*\/core\/debug-logger\.js$/,
        replacement: fileURLToPath(
          new URL("./src/vue-tui-browser-debug-logger.ts", import.meta.url),
        ),
      },
    ],
  },
});
