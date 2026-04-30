import { describe, expect, it } from "vitest";
import {
  createCliEventManager,
  createEventManager,
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

describe("ui regressions input clipboard and ime", () => {
  it("TInput accepts @ mentions by inserting at cursor (not stripping to prefix-only)", async () => {
    const cols = 40;
    const rows = 8;
    const value = ref("");
    const mentions = ref<string[]>([]);

    const mounted = await mountTerminal(
      () =>
        h(TInput, {
          x: 0,
          y: 0,
          w: cols,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          plugins: [createPromptMentionPlugin()],
          mentionSuggestions: [{ value: "@foo", insert: "@foo " }],
          collectMentions: true,
          mentions: mentions.value,
          "onUpdate:mentions": (v: readonly string[]) => (mentions.value = [...v]),
          autoFocus: true,
          cursorBlink: false,
        }),
      cols,
      rows,
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    // Type: "a @f b"
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "@",
        code: "Digit2",
        shiftKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", code: "KeyF", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true }),
    );
    await nextTick();

    // Move cursor back to the end of "@f" (before the trailing space + "b").
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        bubbles: true,
      }),
    );
    await nextTick();

    // Accept the mention suggestion.
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true }),
    );
    await nextTick();
    await nextTick();

    expect(value.value).toBe(`a \uFFF9 b`);
    expect(mentions.value).toEqual(["foo"]);

    // Backspace should delete the whole mention token (and its trailing space).
    container.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        bubbles: true,
      }),
    );
    await nextTick();
    expect(value.value).toBe("a b");
    expect(mentions.value).toEqual([]);

    mounted.unmount();
  });

  it("TInput inserts text on compositionend (IME)", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    const ev = new Event("compositionend", { bubbles: true }) as any;
    ev.data = "你";
    container.dispatchEvent(ev);
    await nextTick();

    expect(value.value).toBe("你");
    mounted.unmount();
  });

  it("TInput cancels composition when modelValue changes externally", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    const start = new Event("compositionstart", { bubbles: true }) as any;
    start.data = "n";
    container.dispatchEvent(start);
    await nextTick();

    const update = new Event("compositionupdate", { bubbles: true }) as any;
    update.data = "你";
    container.dispatchEvent(update);
    await nextTick();

    value.value = "X";
    await nextTick();

    const end = new Event("compositionend", { bubbles: true }) as any;
    end.data = "你";
    container.dispatchEvent(end);
    await nextTick();

    expect(value.value).toBe("X");
    expect(mounted.terminal.getCell(1, 0).ch).toBe("X");
    mounted.unmount();
  });

  it("TInput inserts text on paste", async () => {
    const value = ref("");
    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    const ev = new Event("paste", { bubbles: true }) as any;
    ev.clipboardData = { getData: (_: string) => "paste-text" };
    container.dispatchEvent(ev);
    await nextTick();

    expect(value.value).toBe("paste-text");
    mounted.unmount();
  });

  it("TInput pastes clipboard text on Ctrl+V in node-like env", async () => {
    const value = ref("");
    const prevIsTTY = (process.stdout as any).isTTY;
    const prevPlatform = (process as any).platform;
    (process.stdout as any).isTTY = true;
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });

    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    try {
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();
    } finally {
      (process.stdout as any).isTTY = prevIsTTY;
      if (prevPlatform == null) {
        delete (process as any).platform;
      } else {
        Object.defineProperty(process, "platform", {
          value: prevPlatform,
          configurable: true,
        });
      }
    }

    expect(value.value).toBe("clipboard-text");
    mounted.unmount();
  });

  it("TInput pastes Windows clipboard file paths on Ctrl+V", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);
    const prevIsTTY = (process.stdout as any).isTTY;
    const prevPlatform = (process as any).platform;
    (process.stdout as any).isTTY = true;
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });

    const firstPath = "C:\\Users\\Simon\\Desktop\\a.txt";
    const secondPath = "C:\\Users\\Simon\\Desktop\\b.png";
    spawnOutputsByCmd.set("powershell.exe", `${firstPath}\n${secondPath}\n`);

    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        collectMentions: true,
        mentions: mentions.value,
        "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
        filePasteHandler: (inputPath: string) => inputPath,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    try {
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();
    } finally {
      (process.stdout as any).isTTY = prevIsTTY;
      if (prevPlatform == null) {
        delete (process as any).platform;
      } else {
        Object.defineProperty(process, "platform", {
          value: prevPlatform,
          configurable: true,
        });
      }
    }

    expect(mentions.value).toEqual([firstPath, secondPath]);
    mounted.unmount();
  });

  it("TInput prefers macOS clipboard file paths over pbpaste text on Ctrl+V", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);
    const prevIsTTY = (process.stdout as any).isTTY;
    const prevPlatform = (process as any).platform;
    (process.stdout as any).isTTY = true;
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    const absPath = "/Users/Simon/Desktop/demo.txt";
    spawnOutputsByCmd.set("osascript", `${absPath}\n`);
    spawnOutputsByCmd.set("pbpaste", "demo.txt");

    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        collectMentions: true,
        mentions: mentions.value,
        "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
        filePasteHandler: (inputPath: string) => inputPath,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    try {
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();
    } finally {
      (process.stdout as any).isTTY = prevIsTTY;
      if (prevPlatform == null) {
        delete (process as any).platform;
      } else {
        Object.defineProperty(process, "platform", {
          value: prevPlatform,
          configurable: true,
        });
      }
    }

    expect(mentions.value).toEqual([absPath]);
    mounted.unmount();
  });

  it("TInput pastes multiple macOS clipboard file paths on Ctrl+V", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);
    const prevIsTTY = (process.stdout as any).isTTY;
    const prevPlatform = (process as any).platform;
    (process.stdout as any).isTTY = true;
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    const firstPath = "/Users/Simon/Desktop/a.txt";
    const secondPath = "/Users/Simon/Desktop/b.txt";
    spawnOutputsByCmd.set("osascript", `${firstPath}\n${secondPath}\n`);
    spawnOutputsByCmd.set("pbpaste", "a.txt b.txt");

    const mounted = await mountTerminal(() =>
      h(TInput, {
        x: 0,
        y: 0,
        w: 10,
        modelValue: value.value,
        "onUpdate:modelValue": (v: string) => (value.value = v),
        collectMentions: true,
        mentions: mentions.value,
        "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
        filePasteHandler: (inputPath: string) => inputPath,
      }),
    );

    const container = mounted.container()!;
    container.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    await nextTick();

    try {
      container.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      await nextTick();
    } finally {
      (process.stdout as any).isTTY = prevIsTTY;
      if (prevPlatform == null) {
        delete (process as any).platform;
      } else {
        Object.defineProperty(process, "platform", {
          value: prevPlatform,
          configurable: true,
        });
      }
    }

    expect(mentions.value).toEqual([firstPath, secondPath]);
    mounted.unmount();
  });
});
