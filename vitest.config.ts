import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run before any build, so package self-references must resolve to
// source instead of dist/. Each entry is an exact match: a prefix alias would
// also swallow specifiers such as "@simon_he/vue-tui/package.json".
const src = (file: string) => fileURLToPath(new URL(`src/${file}`, import.meta.url));

const sourceAliases = [
  { find: /^@simon_he\/vue-tui$/, replacement: src("index.ts") },
  { find: /^@simon_he\/vue-tui\/core$/, replacement: src("core.ts") },
  { find: /^@simon_he\/vue-tui\/runtime$/, replacement: src("runtime.ts") },
  { find: /^@simon_he\/vue-tui\/renderer\/dom$/, replacement: src("renderer-dom.ts") },
  { find: /^@simon_he\/vue-tui\/observability$/, replacement: src("observability.ts") },
  { find: /^@simon_he\/vue-tui\/vue$/, replacement: src("vue.ts") },
  { find: /^@simon_he\/vue-tui\/cli$/, replacement: src("cli.ts") },
  { find: /^@simon_he\/vue-tui\/markdown$/, replacement: src("markdown.ts") },
  { find: /^@simon_he\/vue-tui\/experimental$/, replacement: src("experimental.ts") },
  {
    find: /^@simon_he\/vue-tui\/experimental\/browser$/,
    replacement: src("experimental/browser.ts"),
  },
  {
    find: /^@simon_he\/vue-tui\/experimental\/video\/node$/,
    replacement: src("experimental/video/node.ts"),
  },
  {
    find: /^@simon_he\/vue-tui\/experimental\/3d\/bun$/,
    replacement: src("experimental/3d/bun.ts"),
  },
  { find: /^@simon_he\/vue-tui\/agent$/, replacement: src("agent.ts") },
  { find: /^@simon_he\/vue-tui\/agent\/mermaid$/, replacement: src("agent/mermaid.ts") },
  { find: /^@simon_he\/vue-tui\/mermaid$/, replacement: src("mermaid.ts") },
];

export default defineConfig({
  resolve: {
    alias: sourceAliases,
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/test-results/**", "e2e/**", "apps/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/core/buffer/**",
        "src/core/terminal/**",
        "src/renderer/dom/**",
        "src/vue/render/render-manager.ts",
        "src/core/hyperlink.ts",
        "src/selection/**",
      ],
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 70,
        lines: 70,
        "src/core/buffer/**": {
          statements: 46,
          branches: 55,
          functions: 64,
          lines: 48,
        },
        "src/core/terminal/**": {
          statements: 46,
          branches: 45,
          functions: 49,
          lines: 51,
        },
        "src/renderer/dom/**": {
          statements: 65,
          branches: 60,
          functions: 70,
          lines: 70,
        },
        "src/vue/render/render-manager.ts": {
          statements: 65,
          branches: 60,
          functions: 70,
          lines: 70,
        },
        "src/core/hyperlink.ts": {
          statements: 65,
          branches: 60,
          functions: 70,
          lines: 70,
        },
        "src/selection/**": {
          statements: 65,
          branches: 60,
          functions: 70,
          lines: 70,
        },
      },
    },
  },
});
