import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type TerminalEventRecord = any;

function writeJsonLines(path: string, events: TerminalEventRecord[]): void {
  const body = events.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(path, `${body}${body ? "\n" : ""}`, "utf8");
}

function cliReplaySnapshot(opts: {
  cols: number;
  rows: number;
  eventsPath: string;
  snapshotPath: string;
}): string {
  execFileSync(
    "node",
    [
      "cli.mjs",
      "--dev-routes",
      "--tools",
      "mock",
      "--route",
      "cli",
      "--cols",
      String(opts.cols),
      "--rows",
      String(opts.rows),
      "--replay",
      opts.eventsPath,
      "--snapshot",
      opts.snapshotPath,
      "--no-mouse",
    ],
    { stdio: "ignore" },
  );
  return readFileSync(opts.snapshotPath, "utf8");
}

function cliReplaySnapshotWithApp(opts: {
  app: string;
  tools?: "mock" | "real";
  cols: number;
  rows: number;
  eventsPath: string;
  snapshotPath: string;
}): string {
  execFileSync(
    "node",
    [
      "cli.mjs",
      "--dev-routes",
      "--app",
      opts.app,
      "--tools",
      opts.tools ?? "mock",
      "--cols",
      String(opts.cols),
      "--rows",
      String(opts.rows),
      "--replay",
      opts.eventsPath,
      "--snapshot",
      opts.snapshotPath,
      "--no-mouse",
    ],
    { stdio: "ignore" },
  );
  return readFileSync(opts.snapshotPath, "utf8");
}

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

async function getTraceLog(page: any): Promise<any[]> {
  return page.evaluate(() => (globalThis as any).__VT__?.getTraceLog?.() ?? []);
}

async function clearTraceLog(page: any): Promise<void> {
  await page.evaluate(() => (globalThis as any).__VT__?.clearTraceLog?.());
}

async function setTraceEnabled(page: any, enabled: boolean): Promise<void> {
  await page.evaluate((v) => (globalThis as any).__VT__?.setTraceEnabled?.(v), enabled);
}

async function focusTerminalTextarea(page: any): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector("[data-vt-host] textarea") as HTMLTextAreaElement | null;
    el?.focus();
  });
}

async function clickFirstTextCell(
  page: any,
  container: any,
  cols: number,
  rows: number,
  needle: string,
): Promise<void> {
  const lines = await getSnapshot(page);
  const y = lines.findIndex((l) => l.includes(needle));
  if (y < 0) throw new Error(`text not found in snapshot: ${needle}`);
  const x0 = lines[y]!.indexOf(needle);
  if (x0 < 0) throw new Error(`text not found in snapshot row: ${needle}`);
  await clickCell(container, cols, rows, x0, y);
}

async function assertGoatChainParity(
  page: any,
  events: TerminalEventRecord[],
  snapshotLines: string[],
  size: Readonly<{ cols: number; rows: number }> = { cols: 92, rows: 28 },
): Promise<void> {
  const dir = tmpdir();
  const eventsPath = join(
    dir,
    `vt-events-goatchain-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`,
  );
  const cliSnapshotPath = join(
    dir,
    `vt-snapshot-goatchain-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  );

  writeJsonLines(eventsPath, events);
  const cliSnapshot = cliReplaySnapshotWithApp({
    app: "goatchain",
    tools: "mock",
    cols: size.cols,
    rows: size.rows,
    eventsPath,
    snapshotPath: cliSnapshotPath,
  });
  const browserSnapshot = `${snapshotLines.join("\n")}\n`;
  expect(cliSnapshot).toBe(browserSnapshot);
}

test("goatchain flow: Home → Chat → send → run tool → back → re-enter", async ({ page }) => {
  await page.goto("/");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("Enter");

  await expect(container).toContainText("Ctrl+K: config");
  await focusTerminalTextarea(page);
  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");

  await expect(container).toContainText(/tool_call: search/);

  await container
    .getByText(/tool_call: search/)
    .last()
    .click();
  await expect(container).toContainText(/tool_call: call_/);

  // Wait for the approval dialog triggered by the mock assistant flow, then approve (auto-runs).
  await expect(container).toContainText("Approve Tool Permission", {
    timeout: 10_000,
  });
  await clickFirstTextCell(page, container, 92, 28, "[ Approve ]");
  // After approval, the mock tool output should appear in the transcript.
  await expect(container).toContainText("mock: search", { timeout: 10_000 });

  // Focus a stable view before navigating away.
  await clickCell(container, 92, 28, 70, 5);
  await page.keyboard.press("Escape");
  await expect(container).toContainText("Ask anything");

  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Chat");
});

test("goatchain chat: ArrowUp/Down selects tool_call; Enter runs", async ({ page }) => {
  await page.goto("/");

  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Ctrl+K: config");

  // Create two tool_calls (deny both approvals so they remain runnable and don't block).
  await focusTerminalTextarea(page);
  await page.keyboard.type("hello 1");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Approve Tool Permission", {
    timeout: 10_000,
  });
  await clickFirstTextCell(page, container, 92, 28, "[ Deny ]");
  await expect(container).toContainText("Tool permission denied", {
    timeout: 10_000,
  });

  await page.keyboard.type("hello 2");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Approve Tool Permission", {
    timeout: 10_000,
  });
  await clickFirstTextCell(page, container, 92, 28, "[ Deny ]");
  await expect(container).toContainText("Tool permission denied", {
    timeout: 10_000,
  });

  // Focus the selection target (details panel) so ArrowUp/Down controls tool selection.
  await clickCell(container, 92, 28, 70, 5);

  const detailsLine = container.getByText(/tool_call: call_/);
  await page.keyboard.press("ArrowDown");
  await expect(detailsLine).toBeVisible();
  const id1 = ((await detailsLine.textContent()) ?? "").trim();

  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => ((await detailsLine.textContent()) ?? "").trim()).not.toBe(id1);

  await page.keyboard.press("Enter");
  await expect(container).toContainText("Approve Tool Permission", {
    timeout: 10_000,
  });
  await clickFirstTextCell(page, container, 92, 28, "[ Approve ]");
  await expect(container).toContainText("mock: search", { timeout: 10_000 });
});

test("isolation: left region stays stable across right updates + overlay + resize", async ({
  page,
}) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Isolation");

  const s1 = await getSnapshot(page);
  await container.getByText("[ Tick+ ]").click();
  const s2 = await getSnapshot(page);

  expect(s1.length).toBeGreaterThan(0);
  const mid = Math.floor(s1[0]!.length / 2);
  const stableRows = (lines: string[]) =>
    lines
      .slice(3)
      .map((l) => l.slice(0, mid))
      .join("\n");
  const left1 = stableRows(s1);
  const left2 = stableRows(s2);
  expect(left2).toBe(left1);

  await container.getByText("Open Overlay").click();
  await expect(container).toContainText("Close Overlay");
  await expect(container).toContainText("Click to close.");
  const s3 = await getSnapshot(page);
  expect(stableRows(s3)).toBe(left1);

  await container.getByText("Click to close.").click();
  await expect(container).toContainText("Open Overlay");
  await page.waitForTimeout(50);
  const s4 = await getSnapshot(page);
  expect(stableRows(s4)).toBe(left1);

  await container.getByText("[ Resize ]").click();
  await page.waitForTimeout(100);
  await expect(container).toContainText("VT_LEFT");
});

test("browser recording → CLI replay: snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("vue-terminal • CLI");

  await clearEventLog(page);
  await clickCell(container, 92, 28, 2, 26);

  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(container).toContainText("Selected:");

  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);

  const dir = tmpdir();
  const eventsPath = join(dir, `vt-events-${Date.now()}.jsonl`);
  const cliSnapshotPath = join(dir, `vt-snapshot-${Date.now()}.txt`);

  writeJsonLines(eventsPath, events);
  const cliSnapshot = cliReplaySnapshot({
    cols: 92,
    rows: 28,
    eventsPath,
    snapshotPath: cliSnapshotPath,
  });
  const browserSnapshot = `${snapshotLines.join("\n")}\n`;

  expect(cliSnapshot).toBe(browserSnapshot);
});

test("browser recording → CLI replay (goatchain): snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await clearEventLog(page);
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Ctrl+K: config");

  // Focus input (rows=28 => y=25).
  await focusTerminalTextarea(page);
  await page.keyboard.type("hello");
  await page.keyboard.press("Enter");

  await expect(container).toContainText(/tool_call: search/);
  await container
    .getByText(/tool_call: search/)
    .last()
    .click();
  await expect(container).toContainText(/tool_call: call_/);

  await expect(container).toContainText("Approve Tool Permission", {
    timeout: 10_000,
  });
  await clickFirstTextCell(page, container, 92, 28, "[ Approve ]");
  await expect(container).toContainText("mock: search", { timeout: 10_000 });

  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);
  await assertGoatChainParity(page, events, snapshotLines, {
    cols: 92,
    rows: 28,
  });
});

test("browser recording → CLI replay (goatchain home): snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await clearEventLog(page);
  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);
  await assertGoatChainParity(page, events, snapshotLines, {
    cols: 92,
    rows: 28,
  });
});

test("browser recording → CLI replay (goatchain dialog): snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await clearEventLog(page);
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Dialog");
  await container.getByText("[ Open Dialog ]", { exact: true }).click();
  await expect(container).toContainText("Confirm");

  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);
  await assertGoatChainParity(page, events, snapshotLines, {
    cols: 92,
    rows: 28,
  });
});

test("browser recording → CLI replay (goatchain ime): snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await clearEventLog(page);
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("IME");
  await focusTerminalTextarea(page);
  await page.keyboard.type("hello");
  await expect(container).toContainText("hello");

  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);
  await assertGoatChainParity(page, events, snapshotLines, {
    cols: 92,
    rows: 28,
  });
});

test("browser recording → CLI replay (goatchain isolation): snapshots match", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await clearEventLog(page);
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Isolation");
  await container.getByText("Open Overlay").first().click();
  await expect(container).toContainText("Close Overlay");
  await container.getByText("Click to close.").first().click();
  await expect(container).toContainText("Open Overlay");

  const events = await getEventLog(page);
  const snapshotLines = await getSnapshot(page);
  await assertGoatChainParity(page, events, snapshotLines, {
    cols: 92,
    rows: 28,
  });
});

test("ux parity gate: multi-size home + chat snapshots match", async ({ page }) => {
  const sizes = [
    { cols: 60, rows: 20 },
    { cols: 92, rows: 28 },
    { cols: 120, rows: 36 },
  ] as const;

  const container = page.locator("[data-vt-container]");

  for (const size of sizes) {
    await page.goto(`/?cols=${size.cols}&rows=${size.rows}`);
    await expect(container).toBeVisible();
    await expect(container).toContainText("Ask anything");

    await clearEventLog(page);
    const homeEvents = await getEventLog(page);
    const homeSnapshot = await getSnapshot(page);
    await assertGoatChainParity(page, homeEvents, homeSnapshot, size);

    await clearEventLog(page);
    await page.keyboard.press("Control+p");
    await expect(container).toContainText("Commands");
    await page.keyboard.press("Enter");
    await expect(container).toContainText("Ctrl+K: config");
    const chatEvents = await getEventLog(page);
    const chatSnapshot = await getSnapshot(page);
    await assertGoatChainParity(page, chatEvents, chatSnapshot, size);

    await page.keyboard.press("Escape");
    await expect(container).toContainText("Ask anything");

    await clearEventLog(page);
    await page.keyboard.press("Control+p");
    await expect(container).toContainText("Commands");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(container).toContainText("Esc: back");
    await container.getByText("[ Open Dialog ]", { exact: true }).click();
    await expect(container).toContainText("Confirm");
    const dialogEvents = await getEventLog(page);
    const dialogSnapshot = await getSnapshot(page);
    await assertGoatChainParity(page, dialogEvents, dialogSnapshot, size);
  }
});

test("perf budget: typing does not trigger full-screen redraw", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();

  await setTraceEnabled(page, true);
  await clearTraceLog(page);

  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Ctrl+K: config");

  // Wait until the navigation render has committed at least once, so typing measures steady-state.
  await expect
    .poll(async () => (await getTraceLog(page)).some((r) => r?.type === "commit"))
    .toBe(true);
  await clearTraceLog(page);
  await clickCell(container, 92, 28, 2, 25);
  await page.keyboard.type("a");

  await expect
    .poll(async () => (await getTraceLog(page)).filter((r) => r?.type === "commit").length)
    .toBeGreaterThan(0);
  const trace = await getTraceLog(page);
  const commits = trace.filter((r) => r?.type === "commit");
  const last = commits[commits.length - 1];
  const dirtyRows = Array.isArray(last?.dirtyRows) ? last.dirtyRows : [];

  expect(dirtyRows.length).toBeGreaterThan(0);
  // Lightweight budget: a single keystroke should not force a full-screen redraw (including borders).
  expect(dirtyRows.length).toBeLessThan(28);
  expect(dirtyRows).not.toContain(0);
  expect(dirtyRows).not.toContain(27);
});

test("home: render width stays aligned (no border drift)", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");

  const widths = await page.evaluate(() => {
    const el = document.querySelector("[data-vt-container]") as HTMLElement | null;
    if (!el) return null;
    const rows = Array.from(el.querySelectorAll(":scope > div")) as HTMLElement[];
    const rowWidths = rows.map((r) => r.getBoundingClientRect().width);
    const containerWidth = el.getBoundingClientRect().width;
    const scrollWidth = el.scrollWidth;
    const clientWidth = el.clientWidth;
    return { containerWidth, rowWidths, scrollWidth, clientWidth };
  });

  expect(widths).not.toBe(null);
  const { containerWidth, rowWidths, scrollWidth, clientWidth } = widths as any;
  expect(rowWidths.length).toBeGreaterThan(0);

  const min = Math.min(...rowWidths);
  const max = Math.max(...rowWidths);
  expect(max - min).toBeLessThan(1.5);
  expect(Math.abs(containerWidth - rowWidths[0])).toBeLessThan(1.5);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});

test("dialog: blur emits and optionally closes", async ({ page }) => {
  await page.goto("/");
  const container = page.locator("[data-vt-container]");
  await expect(container).toBeVisible();
  await expect(container).toContainText("Ask anything");
  await page.keyboard.press("Control+p");
  await expect(container).toContainText("Commands");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(container).toContainText("Esc: back");

  // Open dialog with closeOnBlur=ON.
  await container.getByText("[ Open Dialog ]").click();
  await expect(container).toContainText("Dialog should emit blur/close events.");
  // Click inside the dialog to ensure it holds focus before blurring.
  // Dialog placement: cols=92 rows=28 w=44 h=9 => (x=24,y=9). TBox content origin adds 2.
  await clickCell(container, 92, 28, 27, 12);
  await clickCell(container, 92, 28, 3, 25); // [ Outside Focus ]
  await expect(container).toContainText("open=false");
  await expect(container).toContainText("blur=1");
  await expect(container).toContainText("close=1");

  // Turn closeOnBlur off: should emit blur but remain open.
  await container.getByText(/^\[ closeOnBlur: (ON|OFF) \]$/).click();
  await expect(container).toContainText("[ closeOnBlur: OFF ]");
  await container.getByText("[ Open Dialog ]").click();
  await expect(container).toContainText("closeOnBlur=false");
  await clickCell(container, 92, 28, 27, 12);
  await clickCell(container, 92, 28, 3, 25); // [ Outside Focus ]
  await expect(container).toContainText("open=true");
  await expect(container).toContainText("blur=2");
  await expect(container).toContainText("close=1");

  // Confirm to close (default button).
  await clickCell(container, 92, 28, 27, 12);
  await page.keyboard.press("Enter");
  await expect(container).toContainText("open=false");
  await expect(container).toContainText("close=2");
  await expect(container).toContainText("confirm=1");
});
