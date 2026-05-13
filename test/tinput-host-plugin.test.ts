import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput, createTInputHostPlugin } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

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
});
