import { defineConfig } from "vitest/config";

export default defineConfig({
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
