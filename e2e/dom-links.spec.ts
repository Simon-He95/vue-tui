import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("DOM renderer anchors are clickable in a real browser", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `
        import { createTerminal } from "./src/core/index.ts";
        import { createDomRenderer } from "./src/renderer/dom/dom-renderer.ts";

        const root = document.getElementById("root");
        const terminal = createTerminal({ cols: 10, rows: 1 });

        globalThis.__clickedHref = null;

        createDomRenderer(terminal, root, {
          links: {},
          onLinkClick(event, href) {
            event.preventDefault();
            globalThis.__clickedHref = href;
            return false;
          },
        });

        terminal.write("docs", {
          x: 0,
          y: 0,
          style: { href: "https://example.com/docs" },
        });
        terminal.commit({ sync: true });
      `,
      resolveDir: process.cwd(),
      sourcefile: "vue-tui-dom-link-hit-test.ts",
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
  await page.route("**/dom-link-hit-test.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: script,
    }),
  );
  await page.route("**/dom-link-hit-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `
        <html>
          <body>
            <div id="root"></div>
            <script type="module" src="/dom-link-hit-test.js"></script>
          </body>
        </html>
      `,
    }),
  );

  await page.goto("/dom-link-hit-test");

  const anchor = page.locator("a");
  await expect(anchor).toHaveAttribute("href", "https://example.com/docs");
  await anchor.click();

  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__clickedHref))
    .toBe("https://example.com/docs");
  expect(pageErrors).toEqual([]);
});
