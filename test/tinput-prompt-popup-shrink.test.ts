import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createPromptMentionPlugin } from "../src/vue.js";
import { createStdoutRenderer, createTerminalApp } from "../src/cli.js";

const ambientTerminalEnvKeys = ["TERM_PROGRAM", "VSCODE_PID"] as const;
const ambientTerminalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    ambientTerminalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ambientTerminalEnvKeys) {
    const value = ambientTerminalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  ambientTerminalEnv.clear();
});

function applyAnsiToScreen(output: string, cols: number, rows: number): readonly string[] {
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  let cursorX = 0;
  let cursorY = 0;
  let scrollTop = 0;
  let scrollBottom = rows;

  const scrollUp = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollTop; y < scrollBottom - 1; y++) grid[y] = grid[y + 1]!;
      grid[scrollBottom - 1] = Array.from({ length: cols }, () => " ");
    }
  };

  const scrollDown = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollBottom - 1; y > scrollTop; y--) grid[y] = grid[y - 1]!;
      grid[scrollTop] = Array.from({ length: cols }, () => " ");
    }
  };

  let i = 0;
  while (i < output.length) {
    const ch = output[i]!;
    if (ch === "\u001B") {
      const next = output[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < output.length && !/[A-Za-z]/.test(output[j]!)) j++;
        if (j >= output.length) break;
        const final = output[j]!;
        const raw = output.slice(i + 2, j);
        const params = raw.replace(/^\?/, "");
        const parts = params ? params.split(";").map((part) => Number(part || "0")) : [];
        if (final === "H" || final === "f") {
          cursorY = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
          cursorX = Math.max(0, Math.min(cols, (parts[1] || 1) - 1));
        } else if (final === "K") {
          for (let x = cursorX; x < cols; x++) grid[cursorY]![x] = " ";
        } else if (final === "r") {
          if (parts.length >= 2) {
            scrollTop = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
            scrollBottom = Math.max(scrollTop + 1, Math.min(rows, parts[1] || rows));
          } else {
            scrollTop = 0;
            scrollBottom = rows;
          }
        } else if (final === "S") {
          scrollUp(Math.max(1, parts[0] || 1));
        } else if (final === "T") {
          scrollDown(Math.max(1, parts[0] || 1));
        }
        i = j + 1;
        continue;
      }
      if (next === "]") {
        const end = output.indexOf("\u0007", i + 2);
        i = end >= 0 ? end + 1 : output.length;
        continue;
      }
    }

    if (ch === "\r") {
      cursorX = 0;
      i++;
      continue;
    }
    if (ch === "\n") {
      cursorX = 0;
      if (cursorY === scrollBottom - 1) scrollUp(1);
      else cursorY = Math.min(rows - 1, cursorY + 1);
      i++;
      continue;
    }

    if (cursorY >= 0 && cursorY < rows && cursorX >= 0 && cursorX < cols)
      grid[cursorY]![cursorX] = ch;
    cursorX = Math.min(cols, cursorX + 1);
    i++;
  }

  return grid.map((row) => row.join(""));
}

function blueBgRowsFromAnsi(output: string, cols: number, rows: number): readonly number[] {
  const bgGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "black"));
  let cursorX = 0;
  let cursorY = 0;
  let scrollTop = 0;
  let scrollBottom = rows;
  let currentBg = "black";
  let currentInverse = false;

  const isSelected = () => currentBg === "blue" || currentInverse;

  const scrollUp = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollTop; y < scrollBottom - 1; y++) bgGrid[y] = bgGrid[y + 1]!;
      bgGrid[scrollBottom - 1] = Array.from({ length: cols }, () => "black");
    }
  };

  const scrollDown = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollBottom - 1; y > scrollTop; y--) bgGrid[y] = bgGrid[y - 1]!;
      bgGrid[scrollTop] = Array.from({ length: cols }, () => "black");
    }
  };

  let i = 0;
  while (i < output.length) {
    const ch = output[i]!;
    if (ch === "\u001B") {
      const next = output[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < output.length && !/[A-Za-z]/.test(output[j]!)) j++;
        if (j >= output.length) break;
        const final = output[j]!;
        const raw = output.slice(i + 2, j);
        const parts = raw ? raw.split(";").map((part) => Number(part || "0")) : [];
        if (final === "H" || final === "f") {
          cursorY = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
          cursorX = Math.max(0, Math.min(cols, (parts[1] || 1) - 1));
        } else if (final === "K") {
          const val = isSelected() ? "blue" : currentBg;
          for (let x = cursorX; x < cols; x++) bgGrid[cursorY]![x] = val;
        } else if (final === "r") {
          if (parts.length >= 2) {
            scrollTop = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
            scrollBottom = Math.max(scrollTop + 1, Math.min(rows, parts[1] || rows));
          } else {
            scrollTop = 0;
            scrollBottom = rows;
          }
        } else if (final === "S") {
          scrollUp(Math.max(1, parts[0] || 1));
        } else if (final === "T") {
          scrollDown(Math.max(1, parts[0] || 1));
        } else if (final === "m") {
          if (parts.length === 0) {
            currentBg = "black";
            currentInverse = false;
          }
          for (const part of parts) {
            if (part === 0 || part === 49) {
              currentBg = "black";
              currentInverse = false;
            } else if (part === 7) currentInverse = true;
            else if (part === 27) currentInverse = false;
            else if (part === 44 || part === 104) currentBg = "blue";
            else if (part >= 40 && part <= 47) currentBg = "other";
            else if (part >= 100 && part <= 107) currentBg = "other";
          }
        }
        i = j + 1;
        continue;
      }
      if (next === "]") {
        const end = output.indexOf("\u0007", i + 2);
        i = end >= 0 ? end + 1 : output.length;
        continue;
      }
    }

    if (ch === "\r") {
      cursorX = 0;
      i++;
      continue;
    }
    if (ch === "\n") {
      cursorX = 0;
      if (cursorY === scrollBottom - 1) scrollUp(1);
      else cursorY = Math.min(rows - 1, cursorY + 1);
      i++;
      continue;
    }

    if (cursorY >= 0 && cursorY < rows && cursorX >= 0 && cursorX < cols)
      bgGrid[cursorY]![cursorX] = isSelected() ? "blue" : currentBg;
    cursorX = Math.min(cols, cursorX + 1);
    i++;
  }

  const rowsWithBlue: number[] = [];
  for (let y = 0; y < rows; y++) {
    const count = bgGrid[y]!.filter((c) => c === "blue").length;
    // Require multiple blue cells to distinguish popup selection (full row)
    // from a single-cell cursor inverse.
    if (count >= 2) rowsWithBlue.push(y);
  }
  return rowsWithBlue;
}

function blueBgMaskFromAnsi(output: string, cols: number, rows: number): readonly string[] {
  const bgGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "."));
  let cursorX = 0;
  let cursorY = 0;
  let scrollTop = 0;
  let scrollBottom = rows;
  let currentBg = "black";
  let currentInverse = false;

  const isSelected = () => currentBg === "blue" || currentInverse;

  const scrollUp = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollTop; y < scrollBottom - 1; y++) bgGrid[y] = bgGrid[y + 1]!;
      bgGrid[scrollBottom - 1] = Array.from({ length: cols }, () => ".");
    }
  };

  const scrollDown = (count: number) => {
    for (let i = 0; i < count; i++) {
      for (let y = scrollBottom - 1; y > scrollTop; y--) bgGrid[y] = bgGrid[y - 1]!;
      bgGrid[scrollTop] = Array.from({ length: cols }, () => ".");
    }
  };

  let i = 0;
  while (i < output.length) {
    const ch = output[i]!;
    if (ch === "\u001B") {
      const next = output[i + 1];
      if (next === "[") {
        let j = i + 2;
        while (j < output.length && !/[A-Za-z]/.test(output[j]!)) j++;
        if (j >= output.length) break;
        const final = output[j]!;
        const raw = output.slice(i + 2, j);
        const parts = raw ? raw.split(";").map((part) => Number(part || "0")) : [];
        if (final === "H" || final === "f") {
          cursorY = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
          cursorX = Math.max(0, Math.min(cols, (parts[1] || 1) - 1));
        } else if (final === "K") {
          const mark = isSelected() ? "B" : ".";
          for (let x = cursorX; x < cols; x++) bgGrid[cursorY]![x] = mark;
        } else if (final === "r") {
          if (parts.length >= 2) {
            scrollTop = Math.max(0, Math.min(rows - 1, (parts[0] || 1) - 1));
            scrollBottom = Math.max(scrollTop + 1, Math.min(rows, parts[1] || rows));
          } else {
            scrollTop = 0;
            scrollBottom = rows;
          }
        } else if (final === "S") {
          scrollUp(Math.max(1, parts[0] || 1));
        } else if (final === "T") {
          scrollDown(Math.max(1, parts[0] || 1));
        } else if (final === "m") {
          if (parts.length === 0) {
            currentBg = "black";
            currentInverse = false;
          }
          for (const part of parts) {
            if (part === 0 || part === 49) {
              currentBg = "black";
              currentInverse = false;
            } else if (part === 7) currentInverse = true;
            else if (part === 27) currentInverse = false;
            else if (part === 44 || part === 104) currentBg = "blue";
            else if ((part >= 40 && part <= 47) || (part >= 100 && part <= 107))
              currentBg = "other";
          }
        }
        i = j + 1;
        continue;
      }
      if (next === "]") {
        const end = output.indexOf("\u0007", i + 2);
        i = end >= 0 ? end + 1 : output.length;
        continue;
      }
    }

    if (ch === "\r") {
      cursorX = 0;
      i++;
      continue;
    }
    if (ch === "\n") {
      cursorX = 0;
      if (cursorY === scrollBottom - 1) scrollUp(1);
      else cursorY = Math.min(rows - 1, cursorY + 1);
      i++;
      continue;
    }

    if (cursorY >= 0 && cursorY < rows && cursorX >= 0 && cursorX < cols)
      bgGrid[cursorY]![cursorX] = isSelected() ? "B" : ".";
    cursorX = Math.min(cols, cursorX + 1);
    i++;
  }

  return bgGrid.map((row) => row.join(""));
}

function findPopupTopBorderRows(lines: readonly string[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes("┌") && line.includes("┐")) rows.push(i);
  }
  return rows;
}

function findPopupBottomBorderRows(lines: readonly string[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.includes("└") && line.includes("┘")) rows.push(i);
  }
  return rows;
}

function assertNoPopupBorderAbove(lines: readonly string[], topRow: number): void {
  const borderChars = /[┌┐└┘│─▲▼]/;
  for (let i = 0; i < topRow; i++) expect(borderChars.test(lines[i]!)).toBe(false);
}

function selectedBgRows(
  app: ReturnType<typeof createTerminalApp>,
  cols: number,
  rows: number,
): number[] {
  const lines = app.terminal.snapshot().lines;
  const topRows = findPopupTopBorderRows(lines);
  const bottomRows = findPopupBottomBorderRows(lines);
  if (topRows.length !== 1 || bottomRows.length !== 1) return [];
  const top = topRows[0]!;
  const bottom = bottomRows[0]!;
  const popupBg = app.terminal.getCell(1, top).style.bg ?? "-";
  const hitRows: number[] = [];
  for (let y = top + 1; y < bottom; y++) {
    let hasSelected = false;
    for (let x = 0; x < cols; x++) {
      const s = app.terminal.getCell(x, y).style;
      if ((s.bg != null && s.bg !== popupBg) || s.inverse) {
        hasSelected = true;
        break;
      }
    }
    if (hasSelected) hitRows.push(y);
  }
  return hitRows;
}

function blueBgMaskFromTerminal(
  app: ReturnType<typeof createTerminalApp>,
  cols: number,
  rows: number,
): readonly string[] {
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = "";
    for (let x = 0; x < cols; x++) {
      const s = app.terminal.getCell(x, y).style;
      row += s.bg === "blue" || s.inverse ? "B" : ".";
    }
    out.push(row);
  }
  return out;
}

function assertBlueBgMatchesAnsi(
  app: ReturnType<typeof createTerminalApp>,
  ansi: string,
  cols: number,
  rows: number,
): void {
  expect(blueBgMaskFromAnsi(ansi, cols, rows)).toEqual(blueBgMaskFromTerminal(app, cols, rows));
}

async function flushApp(app: ReturnType<typeof createTerminalApp>): Promise<void> {
  await nextTick();
  await nextTick();
  app.scheduler.flushNow();
}

describe("TInput prompt popup shrink", () => {
  it("clears stale slash popup borders when a clamped popup shrinks downward", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupShrinkSlashApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            promptTrigger: "/",
            promptMaxItems: 8,
            promptSuggestions: [
              { value: "/new" },
              { value: "/timeline" },
              { value: "/rename" },
              { value: "/connect" },
              { value: "/plugins" },
              { value: "/sessions" },
              { value: "/skills" },
              { value: "/help" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
      await flushApp(app);
      const initialLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(initialLines)).toEqual([0]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(initialLines);

      app.events.dispatch({ type: "keydown", key: "n", code: "KeyN" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "e", code: "KeyE" } as any);
      await flushApp(app);

      const filteredLines = app.terminal.snapshot().lines;
      const topRows = findPopupTopBorderRows(filteredLines);
      expect(topRows.length).toBe(1);
      expect(topRows[0]).toBeGreaterThan(0);
      assertNoPopupBorderAbove(filteredLines, topRows[0]!);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(filteredLines);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });

  it("clears stale mention popup borders when a clamped popup shrinks downward", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupShrinkMentionApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            mentionTrigger: "@",
            mentionMaxItems: 8,
            mentionSuggestions: [
              { value: "@packages" },
              { value: "@package.json" },
              { value: "@patches" },
              { value: "@playground" },
              { value: "@pnpm-lock.yaml" },
              { value: "@public" },
              { value: "@src" },
              { value: "@scripts" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "@", code: "Digit2" } as any);
      await flushApp(app);
      const initialLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(initialLines)).toEqual([0]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(initialLines);

      app.events.dispatch({ type: "keydown", key: "p", code: "KeyP" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "a", code: "KeyA" } as any);
      await flushApp(app);

      const filteredLines = app.terminal.snapshot().lines;
      const topRows = findPopupTopBorderRows(filteredLines);
      expect(topRows.length).toBe(1);
      expect(topRows[0]).toBeGreaterThan(0);
      assertNoPopupBorderAbove(filteredLines, topRows[0]!);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(filteredLines);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });

  it("keeps slash popup rows and selected background consistent across shrink, grow, and dismiss", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupBackspaceSlashApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            promptTrigger: "/",
            promptMaxItems: 8,
            promptSuggestions: [
              { value: "/new" },
              { value: "/timeline" },
              { value: "/rename" },
              { value: "/connect" },
              { value: "/plugins" },
              { value: "/sessions" },
              { value: "/skills" },
              { value: "/help" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "n", code: "KeyN" } as any);
      await flushApp(app);

      const nLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(nLines)).toEqual([0]);
      expect(findPopupBottomBorderRows(nLines)).toEqual([7]);
      expect(selectedBgRows(app, 40, 10)).toEqual([1]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(nLines);

      app.events.dispatch({ type: "keydown", key: "e", code: "KeyE" } as any);
      await flushApp(app);

      const neLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(neLines)).toEqual([2]);
      expect(findPopupBottomBorderRows(neLines)).toEqual([7]);
      assertNoPopupBorderAbove(neLines, 2);
      expect(selectedBgRows(app, 40, 10)).toEqual([3]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(neLines);

      app.events.dispatch({ type: "keydown", key: "Backspace", code: "Backspace" } as any);
      await flushApp(app);

      const backToNLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(backToNLines)).toEqual([0]);
      expect(findPopupBottomBorderRows(backToNLines)).toEqual([7]);
      expect(selectedBgRows(app, 40, 10)).toEqual([1]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(backToNLines);

      app.events.dispatch({ type: "keydown", key: "Escape", code: "Escape" } as any);
      await flushApp(app);

      const closedLines = app.terminal.snapshot().lines;
      expect(findPopupTopBorderRows(closedLines)).toEqual([]);
      expect(findPopupBottomBorderRows(closedLines)).toEqual([]);
      expect(selectedBgRows(app, 40, 10)).toEqual([]);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(closedLines);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });

  it("moves slash popup selection background cleanly across arrow navigation", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupArrowSlashApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            promptTrigger: "/",
            promptMaxItems: 8,
            promptSuggestions: [
              { value: "/new" },
              { value: "/timeline" },
              { value: "/mkills" },
              { value: "/sessions" },
              { value: "/compact" },
              { value: "/approvals" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
      await flushApp(app);
      const openLines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual([1]);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual([1]);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(openLines);

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      const down1Lines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual([2]);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual([2]);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(down1Lines);

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      const down2Lines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual([3]);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual([3]);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(down2Lines);

      app.events.dispatch({ type: "keydown", key: "ArrowUp", code: "ArrowUp" } as any);
      await flushApp(app);
      const up1Lines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual([2]);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual([2]);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(up1Lines);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });

  it("moves mention popup selection background cleanly when wrapping from last item to top", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupArrowMentionApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            mentionTrigger: "@",
            mentionMaxItems: 8,
            mentionSuggestions: [
              { value: "@packages" },
              { value: "@package.json" },
              { value: "@patches" },
              { value: "@playground" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "@", code: "Digit2" } as any);
      await flushApp(app);
      const openLines = app.terminal.snapshot().lines;
      const firstSelectedRow = selectedBgRows(app, 40, 10);
      expect(firstSelectedRow.length).toBe(1);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(firstSelectedRow);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(openLines);

      app.events.dispatch({ type: "keydown", key: "p", code: "KeyP" } as any);
      await flushApp(app);
      const filteredLines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual(firstSelectedRow);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(firstSelectedRow);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(filteredLines);

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      const lastLines = app.terminal.snapshot().lines;
      const lastSelectedRow = selectedBgRows(app, 40, 10);
      expect(lastSelectedRow.length).toBe(1);
      expect(lastSelectedRow[0]!).toBeGreaterThan(firstSelectedRow[0]!);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(lastSelectedRow);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(lastLines);

      app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
      await flushApp(app);
      const wrappedLines = app.terminal.snapshot().lines;
      expect(selectedBgRows(app, 40, 10)).toEqual(firstSelectedRow);
      expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(firstSelectedRow);
      assertBlueBgMatchesAnsi(app, ansi, 40, 10);
      expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(wrappedLines);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });

  it("keeps mention popup background clean while scrolling a long window and wrapping to top", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");
    const App = defineComponent({
      name: "PromptPopupLongMentionWrapApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 8,
            w: 36,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            mentionTrigger: "@",
            mentionMaxItems: 4,
            mentionSuggestions: [
              { value: "@packages" },
              { value: "@package.json" },
              { value: "@patches" },
              { value: "@playground" },
              { value: "@pnpm-lock.yaml" },
              { value: "@plugins" },
              { value: "@public" },
              { value: "@push.log" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    let ansi = "";
    const renderer = createStdoutRenderer(app.terminal, {
      output: {
        isTTY: true,
        write(chunk: string) {
          ansi += chunk;
        },
      },
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "ansi16",
    });

    try {
      app.mount();
      await flushApp(app);

      app.events.dispatch({ type: "keydown", key: "@", code: "Digit2" } as any);
      await flushApp(app);
      app.events.dispatch({ type: "keydown", key: "p", code: "KeyP" } as any);
      await flushApp(app);

      const selectedRowsSeen = new Set<number>();
      let wrapped = false;
      for (let i = 0; i < 12; i++) {
        const selected = selectedBgRows(app, 40, 10);
        expect(selected.length).toBe(1);
        selectedRowsSeen.add(selected[0]!);
        expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(selected);
        assertBlueBgMatchesAnsi(app, ansi, 40, 10);
        expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(app.terminal.snapshot().lines);

        app.events.dispatch({ type: "keydown", key: "ArrowDown", code: "ArrowDown" } as any);
        await flushApp(app);

        const nextSelected = selectedBgRows(app, 40, 10);
        expect(nextSelected.length).toBe(1);
        if (selectedRowsSeen.has(nextSelected[0]!) && selectedRowsSeen.size > 1) {
          wrapped = true;
          expect(blueBgRowsFromAnsi(ansi, 40, 10)).toEqual(nextSelected);
          assertBlueBgMatchesAnsi(app, ansi, 40, 10);
          expect(applyAnsiToScreen(ansi, 40, 10)).toEqual(app.terminal.snapshot().lines);
          break;
        }
      }

      expect(wrapped).toBe(true);
    } finally {
      renderer.dispose();
      app.dispose();
    }
  });
});
