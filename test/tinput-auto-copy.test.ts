import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp } from "../src/cli.js";
import { createTInputHostPlugin, TInput, TInputBox } from "../src/vue.js";

describe("TInput automatic selection copy", () => {
  it.each([
    { component: TInput, autoCopy: undefined, secret: false },
    { component: TInput, autoCopy: true, secret: false },
    { component: TInput, autoCopy: false, secret: false },
    { component: TInput, autoCopy: true, secret: true },
    { component: TInput, autoCopy: true, secret: false, terminalLike: false },
    { component: TInputBox, autoCopy: undefined, secret: false },
    { component: TInputBox, autoCopy: true, secret: false },
    { component: TInputBox, autoCopy: false, secret: false },
  ])(
    "$component.name copies double/triple click selections with autoCopy=$autoCopy secret=$secret",
    async ({ component, autoCopy, secret, terminalLike = true }) => {
      const original = "你好 world\nsecond line";
      const value = ref(original);
      const writeText = vi.fn(async (_text: string) => {});
      const inset = component === TInputBox ? 1 : 0;
      const App = defineComponent({
        setup: () => () =>
          h(component, {
            x: 0,
            y: 0,
            w: 30,
            h: 5,
            modelValue: value.value,
            "onUpdate:modelValue": (text: string) => (value.value = text),
            ...(autoCopy === undefined ? {} : { autoCopy }),
            secret,
            plugins: [createTInputHostPlugin({ isTerminalLike: terminalLike })],
            autoFocus: true,
            cursorBlink: false,
          }),
      });
      const app = createTerminalApp({
        cols: 40,
        rows: 8,
        component: App,
        selection: true,
        clipboard: { supported: true, readText: async () => "", writeText },
      });

      try {
        app.mount();
        await nextTick();
        app.scheduler.flushNow();

        for (let count = 1; count <= 3; count++) {
          const event = { cellX: inset + 1, cellY: inset, button: 0, time: count * 50 };
          app.events.dispatch({ ...event, type: "pointerdown" });
          app.events.dispatch({ ...event, type: "pointerup" });
          app.events.dispatch({ ...event, type: "click" });
          await nextTick();
          app.scheduler.flushNow();

          const expected =
            autoCopy === false || secret || !terminalLike
              ? []
              : ["你好", original].slice(0, count - 1);
          expect(writeText.mock.calls.map(([text]) => text)).toEqual(expected);
          expect(value.value).toBe(original);
        }

        app.events.dispatch({ type: "keydown", key: "Backspace", code: "Backspace" });
        await nextTick();
        expect(value.value).toBe("");

        // Empty selections leave the clipboard alone.
        writeText.mockClear();
        for (let count = 1; count <= 3; count++) {
          app.events.dispatch({
            type: "click",
            cellX: inset + 1,
            cellY: inset,
            button: 0,
            time: 1000 + count * 50,
          });
        }
        await nextTick();
        expect(writeText).not.toHaveBeenCalled();
      } finally {
        app.dispose();
      }
    },
  );

  it.each([true, false])("controls drag copy with autoCopy=%s", async (autoCopy) => {
    const writeText = vi.fn(async (_text: string) => {});
    const value = ref("hello world");
    const app = createTerminalApp({
      cols: 30,
      rows: 3,
      component: defineComponent({
        setup: () => () =>
          h(TInput, {
            x: 0,
            y: 0,
            w: 20,
            modelValue: value.value,
            "onUpdate:modelValue": (text: string) => (value.value = text),
            autoCopy,
            autoFocus: true,
            cursorBlink: false,
          }),
      }),
      selection: true,
      clipboard: { supported: true, readText: async () => "", writeText },
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointermove", cellX: 6, cellY: 0, button: 0 });
      app.events.dispatch({ type: "pointerup", cellX: 6, cellY: 0, button: 0 });
      app.events.dispatch({ type: "click", cellX: 6, cellY: 0, button: 0 });
      await nextTick();
      expect(writeText.mock.calls.map(([text]) => text)).toEqual(autoCopy ? ["hello"] : []);
      app.events.dispatch({ type: "keydown", key: "Backspace", code: "Backspace" });
      await nextTick();
      expect(value.value).toBe(" world");
    } finally {
      app.dispose();
    }
  });
});
