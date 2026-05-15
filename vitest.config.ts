import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
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
      },
    },
  },
});
