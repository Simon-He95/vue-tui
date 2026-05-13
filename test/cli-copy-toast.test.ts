import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput, createTInputHostPlugin } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("cli copy toast host plugin", () => {
  it("uses an injected host plugin when TInput auto-copies on mouse selection release", async () => {
    const messages: string[] = [];

    const proc: any = (globalThis as any).process;
    const prevIsTTY = proc?.stdout?.isTTY;
    const prevWrite = proc?.stdout?.write;
    if (proc?.stdout) {
      proc.stdout.isTTY = true;
      proc.stdout.write = () => true;
    }

    const value = ref("hello");
    const App = defineComponent({
      name: "CliCopyToastApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 20,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorToEndOnFirstFocus: true,
            cursorBlink: false,
          });
      },
    });

    try {
      const app = createTerminalApp({
        cols: 40,
        rows: 4,
        component: App as any,
        inputPlugins: [
          createTInputHostPlugin({
            isTerminalLike: true,
            async writeClipboardText() {
              return true;
            },
            showToast(message: string) {
              messages.push(String(message));
            },
          }),
        ],
      });
      app.mount();
      await nextTick();
      await nextTick();
      app.scheduler.flush();

      // Create a selection via mouse drag, then release to auto-copy.
      app.events.dispatch({
        type: "pointerdown",
        cellX: 1,
        cellY: 0,
        button: 0,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      } as any);
      app.events.dispatch({
        type: "pointermove",
        cellX: 4,
        cellY: 0,
        button: 0,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      } as any);
      app.events.dispatch({
        type: "pointerup",
        cellX: 4,
        cellY: 0,
        button: 0,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
      } as any);
      app.scheduler.flush();
      await Promise.resolve();
      await Promise.resolve();
      expect(messages).toContain("Copied");

      app.dispose();
    } finally {
      if (proc?.stdout) {
        proc.stdout.isTTY = prevIsTTY;
        proc.stdout.write = prevWrite;
      }
    }
  });
});
