import { expect, test } from "@playwright/test";

async function clickCell(
  container: any,
  cols: number,
  rows: number,
  cellX: number,
  cellY: number,
  modifiers?: ("Shift" | "Alt" | "Meta" | "Control")[],
): Promise<void> {
  const box = await container.boundingBox();
  if (!box) throw new Error("container boundingBox() is null");
  const x = (cellX + 0.5) * (box.width / cols);
  const y = (cellY + 0.5) * (box.height / rows);
  await container.click({ position: { x, y }, modifiers });
}

async function moveMouseToCell(
  container: any,
  cols: number,
  rows: number,
  cellX: number,
  cellY: number,
): Promise<void> {
  const box = await container.boundingBox();
  if (!box) throw new Error("container boundingBox() is null");
  const x = box.x + (cellX + 0.5) * (box.width / cols);
  const y = box.y + (cellY + 0.5) * (box.height / rows);
  await container.page().mouse.move(x, y);
}

async function getSnapshot(page: any): Promise<string[]> {
  return page.evaluate(() => (globalThis as any).__VT__?.snapshotLines?.() ?? []);
}

async function getCellBg(page: any, cols: number, cellX: number, cellY: number): Promise<string> {
  return page.evaluate(
    ({ cols, cellX, cellY }) => {
      const container = document.querySelector("[data-vt-container]") as HTMLElement | null;
      if (!container) throw new Error("container not found");
      const row = container.children.item(cellY) as HTMLElement | null;
      if (!row) throw new Error(`row ${cellY} not found`);

      const rect = container.getBoundingClientRect();
      const cellWidth = rect.width / cols;
      const spans = Array.from(row.querySelectorAll(":scope > span")) as HTMLElement[];
      let col = 0;
      for (const span of spans) {
        const wPx = span.getBoundingClientRect().width;
        const spanCols = Math.max(1, Math.round(wPx / cellWidth));
        if (cellX >= col && cellX < col + spanCols) {
          return getComputedStyle(span).backgroundColor || "";
        }
        col += spanCols;
      }
      return "";
    },
    { cols, cellX, cellY },
  );
}

async function pressCombo(
  page: any,
  mods: ("Alt" | "Meta" | "Control" | "Shift")[],
  key: string,
): Promise<void> {
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(key);
  for (const m of [...mods].reverse()) await page.keyboard.up(m);
}

const COLS = 92;
const ROWS = 28;

async function openHomeCommands(page: any, container: any): Promise<void> {
  // Home input is auto-focused; Ctrl+P opens the command palette.
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
}

async function goHomeRoute(page: any, container: any, index: number): Promise<void> {
  await openHomeCommands(page, container);
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

test("cli parity: TInput modifier navigation affects insertion point", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  // Focus the bottom TInput (rows=28 => y=25).
  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("hello world");

  // Ctrl+ArrowLeft => jump to word start ("world"), then insert.
  // (Alt/Meta combos can be reserved by some browser/OS keybindings.)
  await pressCombo(page, ["Control"], "ArrowLeft");
  await page.keyboard.type("X");
  await expect(container).toContainText("hello Xworld");
});

test("cli parity: TInput selection paints blueBright background", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("hello");

  // Extend selection so the last char is selected but not the cursor cell (cursor inverse can override).
  await pressCombo(page, ["Shift"], "ArrowLeft");
  await pressCombo(page, ["Shift"], "ArrowLeft");

  const lines = await getSnapshot(page);
  const y = lines.findIndex((l) => l.includes("hello"));
  expect(y).toBeGreaterThanOrEqual(0);
  const x0 = lines[y]!.indexOf("hello");
  expect(x0).toBeGreaterThanOrEqual(0);
  const xO = x0 + "hello".length - 1;

  await expect.poll(async () => await getCellBg(page, COLS, xO, y)).toContain("104, 113, 255"); // blueBright (#6871ff)
});

test("cli parity: TInput selection is not obscured by cursor block", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("hello");

  // Select the last 2 chars; cursor would otherwise sit on the first selected cell.
  await pressCombo(page, ["Shift"], "ArrowLeft");
  await pressCombo(page, ["Shift"], "ArrowLeft");

  const lines = await getSnapshot(page);
  const y = lines.findIndex((l) => l.includes("hello"));
  expect(y).toBeGreaterThanOrEqual(0);
  const x0 = lines[y]!.indexOf("hello");
  expect(x0).toBeGreaterThanOrEqual(0);

  // The first selected cell is at index 3 ("l" in "hello").
  await expect.poll(async () => await getCellBg(page, COLS, x0 + 3, y)).toContain("104, 113, 255"); // blueBright (#6871ff)
});

test("cli parity: TInput Ctrl+C copies selection to clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("hello world");

  for (let i = 0; i < 5; i++) await pressCombo(page, ["Shift"], "ArrowLeft");

  await pressCombo(page, ["Control"], "c");

  await expect
    .poll(async () => {
      return page.evaluate(async () => navigator.clipboard.readText());
    })
    .toBe("world");
});

test("cli parity: Shift+click extends selection without inserting", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("hello world");

  // Shift+click near the start of the input line to extend selection.
  await clickCell(container, COLS, ROWS, 2, 25, ["Shift"]);

  // Commit and verify the committed value (preview) remains unchanged.
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Select");
  await expect(container).toContainText("hello world");
});

test("cli parity: TSelect keyboard navigation + Enter selects", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 1);
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("abc");
  await page.keyboard.press("Enter");

  // Select should open and capture arrows.
  await expect(container).toContainText("Select");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(container).toContainText("Selected: Search");
});

test("dialog: ArrowRight selects No; focus restores to opener", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 3);
  await expect(container).toContainText("Esc: back");

  await container.getByText("[ Open Dialog ]", { exact: true }).click();
  await expect(container).toContainText("Confirm");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");

  await expect(container).toContainText("open=false");
  await expect(container).toContainText("last=no");

  // If focus restored to opener, pressing Enter should re-open without clicking.
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Confirm");
});

test('chat input: "/" prompt overlay supports Arrow/Tab and click', async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 0);
  await expect(container).toContainText("Ctrl+K: config");

  // Focus input.
  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("/");
  await expect(container.getByText("/settings")).toBeVisible();

  // Arrow navigation should keep the overlay open.
  await page.keyboard.press("ArrowDown");
  await expect(container.getByText("/settings")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");

  // Overlay should close after accept.
  await expect(container.getByText("/settings")).toHaveCount(0);
  await expect(container.getByText("Settings", { exact: true })).toBeVisible();

  // Click-select should also work (zIndex/overlay correctness).
  await page.keyboard.press("Escape");
  await expect(container.getByText("Settings", { exact: true })).toHaveCount(0);

  await clickCell(container, COLS, ROWS, 2, 25);
  await page.keyboard.type("/");
  await expect(container.getByText("/settings")).toBeVisible();
  await container.getByText("/settings").click();
  await expect(container.getByText("/settings")).toHaveCount(0);
  await expect(container.getByText("Settings", { exact: true })).toBeVisible();
});

test("chat transcript: wheel scroll changes visible snapshot", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await goHomeRoute(page, container, 0);
  await expect(container).toContainText("Ctrl+K: config");

  await clickCell(container, COLS, ROWS, 2, 25);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.type(`m${i}`);
    await page.keyboard.press("Enter");
  }

  const s1 = (await getSnapshot(page)).join("\n");

  // Move mouse to transcript area, then wheel up.
  await moveMouseToCell(container, COLS, ROWS, 2, 6);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(50);

  const s2 = (await getSnapshot(page)).join("\n");
  expect(s2).not.toBe(s1);
});
