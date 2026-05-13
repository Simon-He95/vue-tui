import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("root entrypoint mounts under strict CSP", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `
        import { createApp, h } from "vue";
        import { TerminalProvider, TBox, TText } from "./src/index.ts";

        const App = {
          render() {
            return h(TerminalProvider, { cols: 24, rows: 5 }, {
              default: () => h(TBox, { x: 0, y: 0, w: 24, h: 5 }, {
                default: () => h(TText, { x: 1, y: 1, w: 20, value: "CSP root ok" }),
              }),
            });
          },
        };

        createApp(App).mount("#app");
      `,
      resolveDir: process.cwd(),
      sourcefile: "vue-tui-root-csp-smoke.ts",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
  });
  const script = result.outputFiles[0]?.text ?? "";
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await page.route("**/csp-root-smoke.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: script,
    }),
  );
  await page.route("**/csp-root-smoke", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: {
        "Content-Security-Policy": "script-src 'self'",
      },
      body: `
        <html>
          <head><title>CSP root smoke</title></head>
          <body>
            <div id="app"></div>
            <script type="module" src="/csp-root-smoke.js"></script>
          </body>
        </html>
      `,
    }),
  );

  await page.goto("/csp-root-smoke");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("CSP root ok");
  expect(pageErrors).toEqual([]);
});
