import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput, createTInputHostPlugin } from "../src/index.js";
import { createDefaultTInputHostAdapter, createTerminalApp } from "../src/cli.js";

describe("TInput host plugins", () => {
  it("lets hosts inject terminal clipboard behavior via inputPlugins", async () => {
    const value = ref("");

    const App = defineComponent({
      name: "TInputHostPluginApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 20,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({
      cols: 40,
      rows: 4,
      component: App as any,
      inputPlugins: [
        createTInputHostPlugin({
          isTerminalLike: true,
          readClipboardText: async () => "plugin-clipboard",
        }),
      ],
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "v",
      code: "KeyV",
      ctrlKey: true,
    } as any);

    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    app.scheduler.flush();

    expect(value.value).toBe("plugin-clipboard");
    app.dispose();
  });

  it("lets createTerminalApp inject clipboard behavior", async () => {
    const value = ref("");
    const readText = vi.fn(async () => "app-clipboard");

    const App = defineComponent({
      name: "TInputClipboardOptionApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 20,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({
      cols: 40,
      rows: 4,
      component: App as any,
      clipboard: {
        supported: true,
        readText,
        writeText: async () => {},
      },
    });

    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "v",
      code: "KeyV",
      ctrlKey: true,
    } as any);

    await Promise.resolve();
    await Promise.resolve();
    await nextTick();
    app.scheduler.flush();

    expect(readText).toHaveBeenCalled();
    expect(value.value).toBe("app-clipboard");
    app.dispose();
  });

  it("times out hanging default clipboard commands", async () => {
    vi.useFakeTimers();
    const originalProcess = (globalThis as any).process;
    const originalSpawn = (globalThis as any).__VT_NODE_SPAWN__;
    let killCount = 0;
    (globalThis as any).__VT_NODE_SPAWN__ = vi.fn(() => ({
      stdout: {
        setEncoding: vi.fn(),
        on: vi.fn(),
      },
      on: vi.fn(),
      kill() {
        killCount++;
      },
    }));
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      writable: true,
      value: {
        env: {},
        platform: "linux",
        stdout: { isTTY: true },
        versions: { node: "20.0.0" },
      },
    });

    try {
      const host = createDefaultTInputHostAdapter();
      const read = host.readClipboardText?.() ?? Promise.resolve("missing");

      await vi.advanceTimersByTimeAsync(1000);

      await expect(read).resolves.toBe("");
      expect((globalThis as any).__VT_NODE_SPAWN__).toHaveBeenCalledTimes(3);
      expect(killCount).toBe(3);
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        writable: true,
        value: originalProcess,
      });
      if (originalSpawn === undefined) delete (globalThis as any).__VT_NODE_SPAWN__;
      else (globalThis as any).__VT_NODE_SPAWN__ = originalSpawn;
      vi.useRealTimers();
    }
  });

  it("respects total clipboard timeout budget", async () => {
    vi.useFakeTimers();
    const originalProcess = (globalThis as any).process;
    const originalSpawn = (globalThis as any).__VT_NODE_SPAWN__;
    let killCount = 0;
    (globalThis as any).__VT_NODE_SPAWN__ = vi.fn(() => ({
      stdout: {
        setEncoding: vi.fn(),
        on: vi.fn(),
      },
      on: vi.fn(),
      kill() {
        killCount++;
      },
    }));
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      writable: true,
      value: {
        env: {},
        platform: "linux",
        stdout: { isTTY: true },
        versions: { node: "20.0.0" },
      },
    });

    try {
      const host = createDefaultTInputHostAdapter({
        clipboardCommandTimeoutMs: 800,
        clipboardTotalTimeoutMs: 900,
      });
      const read = host.readClipboardText?.() ?? Promise.resolve("missing");

      await vi.advanceTimersByTimeAsync(1000);

      await expect(read).resolves.toBe("");
      expect((globalThis as any).__VT_NODE_SPAWN__).toHaveBeenCalledTimes(2);
      expect(killCount).toBe(2);
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        writable: true,
        value: originalProcess,
      });
      if (originalSpawn === undefined) delete (globalThis as any).__VT_NODE_SPAWN__;
      else (globalThis as any).__VT_NODE_SPAWN__ = originalSpawn;
      vi.useRealTimers();
    }
  });

  it("caps clipboard command stdout", async () => {
    const originalProcess = (globalThis as any).process;
    const originalSpawn = (globalThis as any).__VT_NODE_SPAWN__;
    let killCount = 0;

    (globalThis as any).__VT_NODE_SPAWN__ = vi.fn(() => {
      const handlers = new Map<string, Function>();
      const child = {
        stdout: {
          setEncoding: vi.fn(),
          on(event: string, fn: Function) {
            handlers.set(`stdout:${event}`, fn);
          },
        },
        on(event: string, fn: Function) {
          handlers.set(event, fn);
        },
        kill() {
          killCount++;
        },
      };

      queueMicrotask(() => {
        handlers.get("stdout:data")?.("x".repeat(2048));
        handlers.get("close")?.(0);
      });

      return child;
    });
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      writable: true,
      value: {
        env: {},
        platform: "linux",
        stdout: { isTTY: true },
        versions: { node: "20.0.0" },
      },
    });

    try {
      const host = createDefaultTInputHostAdapter({
        clipboardReadMaxBytes: 1024,
      });

      await expect(host.readClipboardText?.()).resolves.toBe("");
      expect(killCount).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        writable: true,
        value: originalProcess,
      });
      if (originalSpawn === undefined) delete (globalThis as any).__VT_NODE_SPAWN__;
      else (globalThis as any).__VT_NODE_SPAWN__ = originalSpawn;
    }
  });

  it("passes clipboardMaxBytes to OSC52 provider", async () => {
    const originalProcess = (globalThis as any).process;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      writable: true,
      value: {
        stdout: {
          isTTY: true,
          write(sequence: string) {
            writes.push(sequence);
          },
        },
        versions: { node: "20.0.0" },
      },
    });

    try {
      const host = createDefaultTInputHostAdapter({
        clipboardMaxBytes: 4,
      });
      const writeClipboardText = host.writeClipboardText;
      expect(writeClipboardText).toBeTypeOf("function");

      await expect(writeClipboardText!("12345")).resolves.toBe(false);
      await expect(writeClipboardText!("1234")).resolves.toBe(true);
      expect(writes).toEqual(["\u001B]52;c;MTIzNA==\u0007"]);
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        writable: true,
        value: originalProcess,
      });
    }
  });

  it("prefers clipboardWriteMaxBytes for OSC52 writes", async () => {
    const originalProcess = (globalThis as any).process;
    const writes: string[] = [];
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      writable: true,
      value: {
        stdout: {
          isTTY: true,
          write(sequence: string) {
            writes.push(sequence);
          },
        },
        versions: { node: "20.0.0" },
      },
    });

    try {
      const host = createDefaultTInputHostAdapter({
        clipboardWriteMaxBytes: 4,
        clipboardMaxBytes: 100,
      });
      const writeClipboardText = host.writeClipboardText;
      expect(writeClipboardText).toBeTypeOf("function");

      await expect(writeClipboardText!("12345")).resolves.toBe(false);
      await expect(writeClipboardText!("1234")).resolves.toBe(true);
      expect(writes).toEqual(["\u001B]52;c;MTIzNA==\u0007"]);
    } finally {
      Object.defineProperty(globalThis, "process", {
        configurable: true,
        writable: true,
        value: originalProcess,
      });
    }
  });
});
