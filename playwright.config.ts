import process from "node:process";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.PW_PORT || 5173);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  projects: [{ name: "smoke", testMatch: ["basic.spec.ts", "csp.spec.ts", "dom-links.spec.ts"] }],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `pnpm build && pnpm --filter vue-terminal-example-basic dev --port ${port} --strictPort --host 127.0.0.1`,
    port,
    reuseExistingServer: false,
  },
});
