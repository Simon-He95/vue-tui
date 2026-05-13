import { expect, test } from "@playwright/test";

async function clickCell(
  container: any,
  cols: number,
  rows: number,
  cellX: number,
  cellY: number,
): Promise<void> {
  const box = await container.boundingBox();
  if (!box) throw new Error("container boundingBox() is null");
  const x = (cellX + 0.5) * (box.width / cols);
  const y = (cellY + 0.5) * (box.height / rows);
  await container.click({ position: { x, y } });
}

test("basic browser example renders and handles input", async ({ page }) => {
  await page.goto("/");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("vue-terminal demo");
  await expect(container).toContainText("Reactive count: 0");

  await clickCell(container, 70, 22, 2, 10);
  await expect(container).toContainText("Reactive count: 1");

  await page.keyboard.press("Enter");
  await expect(container).toContainText("Option A");
});
