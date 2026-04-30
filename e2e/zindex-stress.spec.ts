import { expect, test } from "@playwright/test";

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

const COLS = 92;

async function openHomeCommands(page: any, container: any): Promise<void> {
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
}

async function goHomeRoute(page: any, container: any, index: number): Promise<void> {
  await openHomeCommands(page, container);
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

async function findCountCell(page: any): Promise<{ x: number; y: number }> {
  const lines = await getSnapshot(page);
  const y = lines.findIndex((l) => l.includes("count="));
  expect(y).toBeGreaterThanOrEqual(0);
  const x = lines[y]!.indexOf("count=");
  expect(x).toBeGreaterThanOrEqual(0);
  return { x, y };
}

test("z-index stress: close top repeatedly keeps numbering + repaint correct", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  // Home command palette: Z-Index Stress is appended to the existing list.
  await goHomeRoute(page, container, 5);
  await expect(container).toContainText("Z-Index Stress");
  await expect(container).toContainText("Total dialogs: 20/20");
  await expect(container).toContainText("Dialog 20/20");
  await expect(container.getByText("[ close 20 ]", { exact: true })).toBeVisible();

  // Exercise reactive updates (position changes) without affecting dialog count.
  await container.getByText("[ Stagger + ]", { exact: true }).click();

  let prevBg = "";

  for (let n = 20; n >= 1; n--) {
    await expect(container).toContainText(`Total dialogs: ${n}/20`);
    await expect(container).toContainText(`Dialog ${n}/${n}`);
    await expect(container).toContainText(`count=${n}`);
    await expect(container.getByText(`[ close ${n} ]`, { exact: true })).toBeVisible();

    const { x, y } = await findCountCell(page);
    const bg = await getCellBg(page, COLS, Math.min(COLS - 1, x + 1), y);
    if (prevBg) expect(bg).not.toBe(prevBg);
    prevBg = bg;

    await container.getByText(`[ close ${n} ]`, { exact: true }).click();
  }

  await expect(container).toContainText("All dialogs closed.");
  await expect(container.getByText("[ close 1 ]", { exact: true })).toHaveCount(0);
});
