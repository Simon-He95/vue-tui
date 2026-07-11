import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const sourceAliases = [
  { find: "@simon_he/vue-tui/core", replacement: fromRoot("src/core.ts") },
  { find: "@simon_he/vue-tui/runtime", replacement: fromRoot("src/runtime.ts") },
  { find: "@simon_he/vue-tui/observability", replacement: fromRoot("src/observability.ts") },
  { find: "@simon_he/vue-tui/vue", replacement: fromRoot("src/vue.ts") },
  { find: "@simon_he/vue-tui/experimental", replacement: fromRoot("src/experimental.ts") },
  { find: "@simon_he/vue-tui/agent", replacement: fromRoot("src/agent.ts") },
  { find: "@simon_he/vue-tui/markdown", replacement: fromRoot("src/markdown.ts") },
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
    replacement: fileURLToPath(new URL("./src/vue-tui-browser-cli-latency.ts", import.meta.url)),
  },
  {
    find: /.*\/core\/debug-logger\.js$/,
    replacement: fileURLToPath(new URL("./src/vue-tui-browser-debug-logger.ts", import.meta.url)),
  },
];
const distAliases = [
  { find: "@simon_he/vue-tui/core", replacement: fromRoot("dist/core.js") },
  { find: "@simon_he/vue-tui/runtime", replacement: fromRoot("dist/runtime.js") },
  { find: "@simon_he/vue-tui/observability", replacement: fromRoot("dist/observability.js") },
  { find: "@simon_he/vue-tui/vue", replacement: fromRoot("dist/vue.js") },
  { find: "@simon_he/vue-tui/experimental", replacement: fromRoot("dist/experimental.js") },
  { find: "@simon_he/vue-tui/agent", replacement: fromRoot("dist/agent.js") },
  { find: "@simon_he/vue-tui/markdown", replacement: fromRoot("dist/markdown.js") },
  { find: "@simon_he/vue-tui", replacement: fromRoot("dist/index.js") },
];

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: process.env.VUE_TUI_PROFILE_DIST === "1" ? distAliases : sourceAliases },
  build: { sourcemap: process.env.VUE_TUI_PROFILE_DIST === "1" },
});
