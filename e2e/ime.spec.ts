import { expect, test } from "@playwright/test";

type TerminalEventRecord = any;

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

async function getSnapshot(page: any): Promise<string[]> {
  return page.evaluate(() => (globalThis as any).__VT__?.snapshotLines?.() ?? []);
}

async function getEventLog(page: any): Promise<TerminalEventRecord[]> {
  return page.evaluate(() => (globalThis as any).__VT__?.getEventLog?.() ?? []);
}

async function clearEventLog(page: any): Promise<void> {
  await page.evaluate(() => (globalThis as any).__VT__?.clearEventLog?.());
}

test("ime: composition events can commit CJK into TInput (browser e2e)", async ({ page }) => {
  await page.goto("/");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("vue-terminal • CLI");

  // Focus the bottom TInput (rows=28 => y=25).
  await clickCell(container, 92, 28, 2, 25);
  await page.waitForTimeout(30);

  await clearEventLog(page);

  // Focus the hidden IME textarea and synthesize a composition commit.
  await page.evaluate(() => {
    (globalThis as any).__VT_DEBUG_IME__ = true;
    const el = document.querySelector("[data-vt-host] textarea") as HTMLTextAreaElement | null;
    if (!el) throw new Error("IME textarea not found");
    el.focus();
    el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    el.value = "n";
    el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "n" }));
    el.value = "ni";
    el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "ni" }));
    el.value = "你";
    el.dispatchEvent(new CompositionEvent("compositionend", { data: "你" }));
  });

  const events = await getEventLog(page);
  const types = events.map((e) => e?.type).filter(Boolean);
  expect(types).toContain("compositionstart");
  expect(types).toContain("compositionupdate");
  expect(types).toContain("compositionend");

  const snapshot = await getSnapshot(page);
  expect(snapshot.join("\n")).toContain("你");
});

test("ime: input isComposing fallback can commit CJK", async ({ page }) => {
  await page.goto("/");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("vue-terminal • CLI");

  await clickCell(container, 92, 28, 2, 25);
  await page.waitForTimeout(30);
  await clearEventLog(page);

  await page.evaluate(() => {
    (globalThis as any).__VT_DEBUG_IME__ = true;
    const el = document.querySelector("[data-vt-host] textarea") as HTMLTextAreaElement | null;
    if (!el) throw new Error("IME textarea not found");
    el.focus();
    el.value = "你";
    el.dispatchEvent(
      new InputEvent("input", {
        data: "你",
        inputType: "insertCompositionText",
        isComposing: true,
      } as any),
    );
    el.dispatchEvent(
      new InputEvent("input", {
        data: "你",
        inputType: "insertText",
        isComposing: false,
      } as any),
    );
  });

  const snapshot = await getSnapshot(page);
  expect(snapshot.join("\n")).toContain("你");
});
