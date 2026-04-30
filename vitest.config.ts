import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/test-results/**", "e2e/**", "apps/**"],
  },
});
