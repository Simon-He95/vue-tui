import process from "node:process";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT || 5173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  projects: [
    {
      name: "smoke",
      testMatch: [
        "basic.spec.ts",
        "csp.spec.ts",
        "dom-links.spec.ts",
        "selection-ime-clipboard.spec.ts",
      ],
    },
    {
      name: "browser-regressions-chromium",
      testMatch: ["selection-ime-clipboard.spec.ts"],
      use: { browserName: "chromium" },
    },
    {
      name: "browser-regressions-firefox",
      testMatch: ["selection-ime-clipboard.spec.ts"],
      use: { browserName: "firefox" },
    },
    {
      name: "browser-regressions-webkit",
      testMatch: ["selection-ime-clipboard.spec.ts"],
      use: { browserName: "webkit" },
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `pnpm build && pnpm --filter vue-terminal-example-basic dev --port ${port} --strictPort --host 127.0.0.1`,
    port,
    reuseExistingServer: false,
  },
});
