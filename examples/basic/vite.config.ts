import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const terminalExternal = [
  "fs",
  "node:fs",
  "node:fs/promises",
  "child_process",
  "node:child_process",
  "events",
  "node:events",
  "buffer",
  "node:buffer",
  "process",
  "node:process",
  "url",
  "node:url",
  "util",
];

export default defineConfig(({ mode }) => {
  const terminalMode =
    mode === "terminal" || mode === "terminal-multi-select" || mode === "terminal-table";
  const browserAliases = terminalMode
    ? []
    : [
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
      ];
  const base = {
    plugins: [vue()],
    resolve: {
      alias: [
        {
          find: "@simon_he/vue-tui",
          replacement: fileURLToPath(
            new URL(
              terminalMode ? "../../src/index.ts" : "./src/vue-tui-browser.ts",
              import.meta.url,
            ),
          ),
        },
        ...browserAliases,
      ],
    },
  };

  if (mode === "terminal") {
    return {
      ...base,
      build: {
        outDir: "dist-terminal",
        emptyOutDir: true,
        lib: {
          entry: fileURLToPath(new URL("./src/terminal.ts", import.meta.url)),
          formats: ["es"],
          fileName: () => "terminal.js",
        },
        rollupOptions: {
          external: terminalExternal,
        },
        target: "node18",
        minify: false,
      },
    };
  }

  if (mode === "terminal-multi-select") {
    return {
      ...base,
      build: {
        outDir: "dist-terminal-multi-select",
        emptyOutDir: true,
        lib: {
          entry: fileURLToPath(new URL("./src/terminal-multi-select.ts", import.meta.url)),
          formats: ["es"],
          fileName: () => "terminal.js",
        },
        rollupOptions: {
          external: terminalExternal,
        },
        target: "node18",
        minify: false,
      },
    };
  }

  if (mode === "terminal-table") {
    return {
      ...base,
      build: {
        outDir: "dist-terminal-table",
        emptyOutDir: true,
        lib: {
          entry: fileURLToPath(new URL("./src/terminal-table.ts", import.meta.url)),
          formats: ["es"],
          fileName: () => "terminal.js",
        },
        rollupOptions: {
          external: terminalExternal,
        },
        target: "node18",
        minify: false,
      },
    };
  }

  return base;
});
