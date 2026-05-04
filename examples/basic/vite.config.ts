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
  const base = {
    plugins: [vue()],
    resolve: {
      alias: {
        "@simon_he/vue-tui": fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
      },
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
