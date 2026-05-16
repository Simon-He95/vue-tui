import { describe, expect, it } from "vitest";
import {
  createCliEventManager,
  createEventManager,
  defaultTInputHostPlugin,
  createPromptMentionPlugin,
  defineComponent,
  expectBoxBorder,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  spawnOutputsByCmd,
  TBox,
  TDialog,
  TInput,
  TInputBox,
  TList,
  TPathPicker,
  TRenderPlane,
  TSelect,
  TText,
  TView,
  useLayout,
  useRenderNode,
  useTerminal,
  useTerminalNode,
  vShow,
  waitFor,
  watch,
  watchEffect,
  withDirectives,
} from "./ui-regressions-support";

import type { PropType } from "vue";

describe("ui regressions input editing", () => {
  it("TBox clamps padding so content stays inside 3-row box", async () => {
    const mounted = await mountTerminal(() =>
      h(
        TBox,
        { x: 0, y: 0, w: 10, h: 3, border: true, padding: 1 },
        {
          default: () => [h(TText, { x: 0, y: 0, value: "X" })],
        },
      ),
    );

    // Expect "X" to appear on the middle line (inside the border).
    expect(mounted.terminal.getCell(1, 1).ch).toBe("X");
    mounted.unmount();
  });

  it("TInput supports Option(Alt)+ArrowLeft word-jump with Shift selection", async () => {
    const value = ref("");

    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    const container = mounted.container()!;

    // Focus the input node via mousedown at (0,0).
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();
    expect(mounted.events()?.getFocused()).not.toBe(null);

    const type = async (k: string, code: string) => {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    };

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
      [" ", "Space"],
      ["w", "KeyW"],
      ["o", "KeyO"],
      ["r", "KeyR"],
      ["l", "KeyL"],
      ["d", "KeyD"],
    ] as const)
      await type(k, code);

    expect(value.value).toBe("hello world");

    // Alt+Shift+ArrowLeft should select the previous word ("world").
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        altKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();

    // Selection highlight uses inverse for selected range.
    for (let x = 7; x <= 11; x++) expect(mounted.terminal.getCell(x, 0).style.inverse).toBe(true);

    // Cursor is hidden while selection is active; press ArrowRight to collapse selection and reveal cursor.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        bubbles: true,
      }),
    );
    await nextTick();

    // Cursor should land at the start of the word (index 6), then move right by 1 (index 7).
    expect(mounted.terminal.getCell(8, 0).style.inverse).toBe(true);
    mounted.unmount();
  });

  it("TInput supports Cmd(Meta)+ArrowLeft/Right boundary jumps", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    // Cursor at end.
    expect(mounted.terminal.getCell(6, 0).style.inverse).toBe(true);

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        metaKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(mounted.terminal.getCell(1, 0).style.inverse).toBe(true);

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        metaKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(mounted.terminal.getCell(6, 0).style.inverse).toBe(true);

    mounted.unmount();
  });

  it("TInput supports Cmd(Meta)+Z undo and Cmd(Meta)+Shift+Z redo", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["a", "KeyA"],
      ["b", "KeyB"],
      ["c", "KeyC"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("abc");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("ab");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("abc");

    mounted.unmount();
  });

  it("TInput clearOnEscape clears content and remains undoable", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        clearOnEscape: true,
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("hello");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("hello");

    mounted.unmount();
  });

  it("TInput supports Ctrl+Delete to clear content", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("hello");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        code: "Delete",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("");

    mounted.unmount();
  });

  it("TInput supports Meta+Backspace/Delete to clear content when meta is available", async () => {
    for (const { key, code } of [
      { key: "Backspace", code: "Backspace" },
      { key: "Delete", code: "Delete" },
    ] as const) {
      const value = ref("");
      const mounted = await mountTerminal(() =>
        h(TInput, {
          x: 0,
          y: 0,
          w: 20,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          cursorBlink: false,
        }),
      );

      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      await nextTick();

      for (const [k, keyCode] of [
        ["h", "KeyH"],
        ["e", "KeyE"],
        ["l", "KeyL"],
        ["l", "KeyL"],
        ["o", "KeyO"],
      ] as const) {
        container.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: k,
            code: keyCode,
            bubbles: true,
          }),
        );
        await nextTick();
      }
      expect(value.value).toBe("hello");

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code,
          metaKey: true,
          bubbles: true,
        }),
      );
      await nextTick();
      expect(value.value).toBe("");

      mounted.unmount();
    }
  });

  it("TInput supports Ctrl+U to clear content", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("hello");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "u",
        code: "KeyU",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("");

    mounted.unmount();
  });

  it("TInput supports Ctrl+Backspace to clear content", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("hello");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("");

    mounted.unmount();
  });

  it("TInput supports Ctrl+W to clear content", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("hello");

    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        code: "KeyW",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("");

    mounted.unmount();
  });

  it("TInput supports Ctrl+C to clear content when input is not empty", async () => {
    const prevIsTTY = (process.stdout as any).isTTY;
    (process.stdout as any).isTTY = true;
    try {
      const value = ref("");
      const mounted = await mountTerminal(
        () =>
          h(TInput, {
            x: 0,
            y: 0,
            w: 20,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            cursorBlink: false,
          }),
        40,
        8,
        { inputPlugins: [defaultTInputHostPlugin] },
      );

      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );
      await nextTick();

      for (const [k, code] of [
        ["h", "KeyH"],
        ["e", "KeyE"],
        ["l", "KeyL"],
        ["l", "KeyL"],
        ["o", "KeyO"],
      ] as const) {
        container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
        await nextTick();
      }
      expect(value.value).toBe("hello");

      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "c",
          code: "KeyC",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await nextTick();
      expect(value.value).toBe("");

      mounted.unmount();
    } finally {
      (process.stdout as any).isTTY = prevIsTTY;
    }
  });

  it("TInput cursor never corrupts wide chars when scrolled into the middle of a glyph", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 4, // contentW=2 (padding=1) => forces scrollX=1 at col=2
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        style: { fg: "whiteBright", bg: "blackBright" },
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    // Insert a wide glyph (2 cells) so the cursor ends up at col=2.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "底",
        code: "Unidentified",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(value.value).toBe("底");

    // The glyph should remain at its original leading cell; the cursor must not overwrite the continuation cell.
    expect(mounted.terminal.getCell(1, 0).ch).toBe("底");
    expect(mounted.terminal.getCell(2, 0).continuation).toBe(true);
    for (let x = 0; x < 4; x++) expect(mounted.terminal.getCell(x, 0).style.bg).toBe("blackBright");

    mounted.unmount();
  });

  it("TInput autoFocus cursor visibility uses TerminalProvider widthProvider", async () => {
    const value = ref("Ωx");
    const mounted = await mountTerminal(
      () =>
        h(TInput, {
          x: 0,
          y: 0,
          w: 4,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          autoFocus: true,
          cursorToEndOnFirstFocus: true,
          cursorBlink: false,
        }),
      4,
      2,
      { widthProvider: "cjk" },
    );

    await nextTick();
    await nextTick();

    expect(mounted.terminal.getCell(1, 0).ch).toBe("x");
    expect(mounted.terminal.getCell(2, 0).ch).toBe(" ");
    expect(mounted.terminal.getCell(2, 0).style.inverse).toBe(true);

    mounted.unmount();
  });

  it("TInput bar cursor never hides underlying glyph", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 12,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorShape: "bar",
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["a", "KeyA"],
      ["b", "KeyB"],
      ["c", "KeyC"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    // Move caret onto the "c" cell; bar cursor should not replace it with '│'.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();

    // Account for TInput left padding.
    const cell = mounted.terminal.getCell(3, 0);
    expect(cell.ch).toBe("c");
    expect(cell.style.inverse).toBe(true);

    mounted.unmount();
  });

  it("TInput Shift+click extends selection and does not insert characters", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
      [" ", "Space"],
      ["w", "KeyW"],
      ["o", "KeyO"],
      ["r", "KeyR"],
      ["l", "KeyL"],
      ["d", "KeyD"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    expect(value.value).toBe("hello world");

    // Shift+click at the start should select the whole line.
    container.dispatchEvent(
      new MouseEvent("click", {
        clientX: 0,
        clientY: 0,
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();

    for (let x = 1; x <= 11; x++) expect(mounted.terminal.getCell(x, 0).style.inverse).toBe(true);

    expect(value.value).toBe("hello world");

    // Cursor is hidden while selection is active; press ArrowRight to collapse selection and reveal cursor.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(mounted.terminal.getCell(2, 0).style.inverse).toBe(true);

    mounted.unmount();
  });

  it("TInput mouse drag selects a range", async () => {
    const cols = 30;
    const rows = 5;
    const value = ref("");
    const mounted = await mountTerminal(
      () =>
        h(TInput, {
          x: 0,
          y: 0,
          w: cols,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          cursorBlink: false,
        }),
      cols,
      rows,
    );

    const container = mounted.container()!;
    const events = mounted.events()!;
    const cellWidth = 10;
    const cellHeight = 20;
    events.setMetrics({ cellWidth, cellHeight });
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        x: 0,
        y: 0,
        width: cols * cellWidth,
        height: rows * cellHeight,
        right: cols * cellWidth,
        bottom: rows * cellHeight,
        toJSON() {},
      }) as any;

    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
      [" ", "Space"],
      ["w", "KeyW"],
      ["o", "KeyO"],
      ["r", "KeyR"],
      ["l", "KeyL"],
      ["d", "KeyD"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    expect(value.value).toBe("hello world");

    // Drag-select "hello": mousedown at col=0 (before first char) -> drag to col=5 (after 'o').
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }));
    container.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: 6 * cellWidth + 1,
        clientY: 1,
        bubbles: true,
      }),
    );
    container.dispatchEvent(
      new MouseEvent("mouseup", {
        clientX: 6 * cellWidth + 1,
        clientY: 1,
        bubbles: true,
      }),
    );
    await nextTick();

    for (let x = 1; x <= 5; x++) expect(mounted.terminal.getCell(x, 0).style.inverse).toBe(true);
    expect(mounted.terminal.getCell(6, 0).style.inverse).not.toBe(true);

    mounted.unmount();
  });

  it("TInput double click selects a word", async () => {
    const cols = 30;
    const rows = 5;
    const value = ref("");
    const mounted = await mountTerminal(
      () =>
        h(TInput, {
          x: 0,
          y: 0,
          w: cols,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          cursorBlink: false,
        }),
      cols,
      rows,
    );

    const container = mounted.container()!;
    const events = mounted.events()!;
    const cellWidth = 10;
    const cellHeight = 20;
    events.setMetrics({ cellWidth, cellHeight });
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        x: 0,
        y: 0,
        width: cols * cellWidth,
        height: rows * cellHeight,
        right: cols * cellWidth,
        bottom: rows * cellHeight,
        toJSON() {},
      }) as any;

    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
      [" ", "Space"],
      ["w", "KeyW"],
      ["o", "KeyO"],
      ["r", "KeyR"],
      ["l", "KeyL"],
      ["d", "KeyD"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    expect(value.value).toBe("hello world");

    // Double-click inside "hello" should select the token.
    container.dispatchEvent(
      new MouseEvent("click", {
        clientX: 3 * cellWidth + 1,
        clientY: 1,
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new MouseEvent("click", {
        clientX: 3 * cellWidth + 1,
        clientY: 1,
        bubbles: true,
      }),
    );
    await nextTick();

    for (let x = 1; x <= 5; x++) expect(mounted.terminal.getCell(x, 0).style.inverse).toBe(true);
    expect(mounted.terminal.getCell(6, 0).style.inverse).not.toBe(true);

    mounted.unmount();
  });

  it("TInput triple click selects all", async () => {
    const cols = 30;
    const rows = 5;
    const value = ref("");
    const mounted = await mountTerminal(
      () =>
        h(TInput, {
          x: 0,
          y: 0,
          w: cols,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          cursorBlink: false,
        }),
      cols,
      rows,
    );

    const container = mounted.container()!;
    const events = mounted.events()!;
    const cellWidth = 10;
    const cellHeight = 20;
    events.setMetrics({ cellWidth, cellHeight });
    container.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        x: 0,
        y: 0,
        width: cols * cellWidth,
        height: rows * cellHeight,
        right: cols * cellWidth,
        bottom: rows * cellHeight,
        toJSON() {},
      }) as any;

    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }));
    await nextTick();

    for (const [k, code] of [
      ["h", "KeyH"],
      ["e", "KeyE"],
      ["l", "KeyL"],
      ["l", "KeyL"],
      ["o", "KeyO"],
      [" ", "Space"],
      ["w", "KeyW"],
      ["o", "KeyO"],
      ["r", "KeyR"],
      ["l", "KeyL"],
      ["d", "KeyD"],
    ] as const) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
      await nextTick();
    }

    expect(value.value).toBe("hello world");

    // Triple-click anywhere selects the whole value.
    const x = 3 * cellWidth + 1;
    container.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: 1, bubbles: true }));
    await nextTick();
    container.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: 1, bubbles: true }));
    await nextTick();
    container.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: 1, bubbles: true }));
    await nextTick();

    for (let cx = 1; cx <= 11; cx++)
      expect(mounted.terminal.getCell(cx, 0).style.inverse).toBe(true);

    mounted.unmount();
  });

  it("TInput prompt overlay renders above higher-z content (no z-index bleed)", async () => {
    const cols = 30;
    const rows = 10;
    const value = ref("");

    const mounted = await mountTerminal(
      () =>
        h("div", [
          h(TView, { x: 0, y: 0, w: cols, h: rows, zIndex: 50 }, () =>
            h(TText, {
              x: 0,
              y: 0,
              w: cols,
              h: rows,
              value: Array.from({ length: rows }, () => "X".repeat(cols)).join("\n"),
              style: { fg: "redBright" },
            }),
          ),
          h(TInput, {
            x: 0,
            y: 8,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [createPromptMentionPlugin()],
            promptSuggestions: [{ value: "/one" }, { value: "/two" }],
          }),
        ]),
      cols,
      rows,
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 8, bubbles: true }));
    await nextTick();

    // Trigger prompt list.
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", code: "Slash", bubbles: true }),
    );
    await nextTick();
    await nextTick();

    // Overlay should appear above the "X" fill.
    expect(mounted.terminal.getCell(0, 4).ch).toBe("┌");

    mounted.unmount();
  });

  it("TInput inserts newline on Shift+Enter (textarea semantics)", async () => {
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true }),
    );
    await nextTick();

    expect(value.value).toBe("a\nb");
    expect(changes).toEqual([]);
    expect(mounted.terminal.getCell(1, 0).ch).toBe("a");
    expect(mounted.terminal.getCell(1, 1).ch).toBe("b");

    mounted.unmount();
  });

  it("TInput inserts newline on Ctrl+J (Kitty protocol compatibility)", async () => {
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        h: 3,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    // Ctrl+J: with enhanced keyboard protocols (Kitty), Ctrl+J arrives as
    // a keydown event for 'j' with ctrlKey instead of the legacy LF byte.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true }),
    );
    await nextTick();

    expect(value.value).toBe("a\nb");
    expect(changes).toEqual([]);

    mounted.unmount();
  });

  it("TInput wraps long lines within width when multiline", async () => {
    const value = ref("1234567890");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 5,
        h: 3,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    // Expect wrapping inside content width (accounts for TInput padding).
    expect(mounted.terminal.getCell(1, 0).ch).toBe("1");
    expect(mounted.terminal.getCell(3, 0).ch).toBe("3");
    expect(mounted.terminal.getCell(1, 1).ch).toBe("4");
    expect(mounted.terminal.getCell(3, 1).ch).toBe("6");
    expect(mounted.terminal.getCell(1, 2).ch).toBe("7");
    expect(mounted.terminal.getCell(3, 2).ch).toBe("9");
    expect(mounted.terminal.getCell(4, 0).ch).toBe(" ");
    expect(mounted.terminal.getCell(5, 0).ch).toBe(" ");

    mounted.unmount();
  });

  it("TInput wrapped rows keep symmetric padding inside bordered container", async () => {
    const value = ref("12345678901234567890");
    const mounted = await mountTerminal(() =>
      h(TBox, { x: 0, y: 0, w: 12, h: 5, border: true, padding: 0 }, () =>
        h(TInput, {
          x: 1,
          y: 1,
          w: 10,
          h: 3,
          modelValue: value.value,
          "onUpdate:modelValue": (v) => (value.value = v),
        }),
      ),
    );

    // Border should remain intact around the input.
    for (const y of [1, 2, 3]) {
      expect(mounted.terminal.getCell(0, y).ch).toBe("│");
      expect(mounted.terminal.getCell(11, y).ch).toBe("│");
    }

    // TInput has 1-cell left/right padding inside its own rect, so wrapped rows should keep a blank
    // column before the border on both sides.
    for (const y of [1, 2, 3]) {
      expect(mounted.terminal.getCell(1, y).ch).toBe(" ");
      expect(mounted.terminal.getCell(10, y).ch).toBe(" ");
    }

    mounted.unmount();
  });

  it("TInput keeps cursor visible when terminal resizes (scrollX updates)", async () => {
    const value = ref("0123456789ABCDEFGHIJ");

    const App = defineComponent({
      name: "ResizeInputApp",
      setup() {
        const layout = useLayout();
        const w = () => Math.max(1, Math.floor(layout.clipRect?.w ?? 1));
        return () =>
          h(TInput, {
            x: 0,
            y: 0,
            w: w(),
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const mounted = await mountTerminal(() => h(App), 20, 6);
    const container = mounted.container()!;

    // Move cursor to end.
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        code: "End",
        metaKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(mounted.terminal.getCell(18, 0).style.inverse).toBe(true);

    mounted.terminal.resize(8, 6);
    await nextTick();
    await nextTick();

    // Cursor should still be visible at the right edge after resize.
    expect(mounted.terminal.getCell(6, 0).style.inverse).toBe(true);
    mounted.unmount();
  });

  it("TInput commits on Enter and does not insert newline", async () => {
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(value.value).toBe("a");
    expect(changes).toEqual(["a"]);

    mounted.unmount();
  });

  it("TInputBox draws a border and forwards input editing", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInputBox, {
        x: 0,
        y: 0,
        w: 10,
        h: 5,
        title: "Input",
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        autoFocus: true,
      }),
    );

    expect(mounted.terminal.getCell(0, 0).ch).toBe("┌");
    expect(mounted.terminal.getCell(9, 0).ch).toBe("┐");
    expect(mounted.terminal.getCell(0, 4).ch).toBe("└");
    expect(mounted.terminal.getCell(9, 4).ch).toBe("┘");

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 1, clientY: 1, bubbles: true }));
    await nextTick();

    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true }),
    );
    await nextTick();

    expect(value.value).toBe("a\nb");
    expect(mounted.terminal.getCell(2, 1).ch).toBe("a");
    expect(mounted.terminal.getCell(2, 2).ch).toBe("b");

    mounted.unmount();
  });

  it("TInput Enter commits when prompt is visible but has no matching suggestions", async () => {
    // This tests the case where user types "/notacommand" - prompt popup is active
    // because text starts with "/" but there are no matching suggestions.
    // Enter should still trigger onChange, not be swallowed.
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 30,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
        plugins: [createPromptMentionPlugin()],
        promptSuggestions: [{ value: "/help" }, { value: "/quit" }],
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    // Type "/notacommand" which doesn't match any suggestion
    for (const ch of "/notacommand") {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      await nextTick();
    }
    expect(value.value).toBe("/notacommand");

    // Press Enter - should trigger onChange, not be swallowed
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();

    // onChange should have been called with the input value
    expect(changes).toEqual(["/notacommand"]);

    mounted.unmount();
  });

  it("TInput Enter commits multiline text when prompt visible but no matches", async () => {
    // Test multiline input with "/" on a line - Enter should still commit
    const value = ref("");
    const changes: string[] = [];
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 30,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        onChange: (v: string) => changes.push(v),
        plugins: [createPromptMentionPlugin()],
        promptSuggestions: [{ value: "/help" }, { value: "/quit" }],
        autoFocus: true,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    // Type "hello" then Shift+Enter for newline, then "/x"
    for (const ch of "hello") {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      await nextTick();
    }
    // Shift+Enter inserts newline
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    // Type "/x" on new line (no matching suggestion)
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    await nextTick();
    container.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    await nextTick();

    expect(value.value).toBe("hello\n/x");

    // Press Enter - should trigger onChange with the full multiline content
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
      }),
    );
    await nextTick();

    expect(changes).toEqual(["hello\n/x"]);

    mounted.unmount();
  });

  it("TInput handles rapid consecutive keystrokes without dropping characters", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 20,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        autoFocus: true,
        cursorBlink: false,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    // Simulate rapid keystrokes (like fast typing or IME commit)
    const chars = ["你", "好", "呀"];
    for (const ch of chars) {
      container.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      // Note: No nextTick between keystrokes to simulate rapid input
    }
    await nextTick();

    expect(value.value).toBe("你好呀");

    mounted.unmount();
  });
});
