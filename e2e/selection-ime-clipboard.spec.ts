import { expect, test } from "@playwright/test";
import { build } from "esbuild";

let script = "";

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `
        import { createApp, defineComponent, h, ref } from "vue";
        import { TerminalProvider, TInput, TText } from "./src/index.ts";

        globalThis.__vtClipboard = [];
        globalThis.__vtCopies = [];
        globalThis.__vtEvents = [];
        globalThis.__vtInput = "";

        const clipboard = {
          supported: true,
          async readText() {
            return globalThis.__vtClipboard.at(-1) ?? "";
          },
          async writeText(text) {
            globalThis.__vtClipboard.push(text);
          },
        };

        const App = defineComponent({
          setup() {
            const value = ref("");
            return () =>
              h(
                TerminalProvider,
                {
                  cols: 32,
                  rows: 8,
                  selection: true,
                  clipboard,
                  recordEvents: (event) => globalThis.__vtEvents.push(event),
                  onSelectionCopy: (payload) => globalThis.__vtCopies.push(payload),
                },
                () => [
                  h(TText, { x: 0, y: 0, w: 24, value: "0123456789abcdef" }),
                  h(TInput, {
                    x: 0,
                    y: 4,
                    w: 24,
                    modelValue: value.value,
                    "onUpdate:modelValue": (next) => {
                      value.value = next;
                      globalThis.__vtInput = next;
                    },
                    placeholder: "type here",
                  }),
                ],
              );
          },
        });

        createApp(App).mount("#root");
      `,
      resolveDir: process.cwd(),
      sourcefile: "vue-tui-selection-ime-clipboard.ts",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
  });
  script = result.outputFiles[0]?.text ?? "";
});

async function openFixture(page: any): Promise<void> {
  await page.route("**/selection-ime-clipboard.js", (route: any) =>
    route.fulfill({
      contentType: "application/javascript",
      body: script,
    }),
  );
  await page.route("**/selection-ime-clipboard", (route: any) =>
    route.fulfill({
      contentType: "text/html",
      body: `
        <html>
          <head>
            <style>
              body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
              #root { padding: 16px; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="module" src="/selection-ime-clipboard.js"></script>
          </body>
        </html>
      `,
    }),
  );
  await page.goto("/selection-ime-clipboard");
}

async function pointForCell(
  container: any,
  cols: number,
  rows: number,
  cellX: number,
  cellY: number,
) {
  const box = await container.boundingBox();
  if (!box) throw new Error("container boundingBox() is null");
  return {
    x: box.x + (cellX + 0.5) * (box.width / cols),
    y: box.y + (cellY + 0.5) * (box.height / rows),
    box,
  };
}

async function dragCells(
  page: any,
  container: any,
  cols: number,
  rows: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const start = await pointForCell(container, cols, rows, fromX, fromY);
  const end = await pointForCell(container, cols, rows, toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}

test("selection auto-copies through injected clipboard in a real browser", async ({ page }) => {
  await openFixture(page);

  const container = page.locator("[data-vt-container]");
  await expect(container).toContainText("0123456789abcdef");

  await dragCells(page, container, 32, 8, 2, 0, 6, 0);

  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__vtClipboard))
    .toEqual(["23456"]);
  await expect.poll(() => page.evaluate(() => (globalThis as any).__vtCopies[0]?.ok)).toBe(true);
  await expect(page.locator("[data-vt-copy-toast]")).toBeVisible();
});

test("selection finishes when mouseup happens outside the terminal", async ({ page }) => {
  await openFixture(page);

  const container = page.locator("[data-vt-container]");
  await expect(container).toContainText("0123456789abcdef");

  const start = await pointForCell(container, 32, 8, 2, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const insideEnd = await pointForCell(container, 32, 8, 8, 0);
  await page.mouse.move(insideEnd.x, insideEnd.y);
  await page.mouse.move(start.box.x + start.box.width + 20, start.box.y + start.box.height + 20);
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__vtClipboard[0] ?? ""))
    .toContain("23456789abcdef");
});

test("synthetic IME composition commits into TInput without scrolling the page", async ({
  page,
}) => {
  await openFixture(page);

  const container = page.locator("[data-vt-container]");
  await expect(container).toContainText("type here");
  const inputCell = await pointForCell(container, 32, 8, 1, 4);
  await page.mouse.click(inputCell.x, inputCell.y);
  await page.waitForTimeout(30);

  const beforeScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await page.evaluate(() => {
    (globalThis as any).__VT_DEBUG_IME__ = true;
    const el = document.querySelector("[data-vt-host] textarea") as HTMLTextAreaElement | null;
    if (!el) throw new Error("IME textarea not found");
    el.focus();
    el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    el.value = "ni";
    el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "ni" }));
    el.value = "你";
    el.dispatchEvent(new CompositionEvent("compositionend", { data: "你" }));
  });

  await expect.poll(() => page.evaluate(() => (globalThis as any).__vtInput)).toBe("你");
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__vtEvents.map((e: any) => e.type)))
    .toEqual(expect.arrayContaining(["compositionstart", "compositionupdate", "compositionend"]));
  await expect
    .poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })))
    .toEqual(beforeScroll);
});
