import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createPromptMentionPlugin } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";

describe("TInput prompt suggestions scrolling", () => {
  it("shows a window and scrolls as selection moves", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");

    const App = defineComponent({
      name: "PromptScrollApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 30,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            plugins: [plugin],
            promptTrigger: "/",
            promptMaxItems: 4,
            promptSuggestions: [
              { value: "/a" },
              { value: "/b" },
              { value: "/c" },
              { value: "/d" },
              { value: "/e" },
              { value: "/f" },
              { value: "/g" },
              { value: "/h" },
            ],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 10, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
    await nextTick();
    app.scheduler.flush();

    const snap0 = app.terminal.snapshot().lines.join("\n");
    expect(snap0).toContain("/a");
    expect(snap0).toContain("/d");
    expect(snap0).not.toContain("/e");

    // Move selection beyond the visible window so it scrolls.
    for (let i = 0; i < 4; i++) {
      app.events.dispatch({
        type: "keydown",
        key: "ArrowDown",
        code: "ArrowDown",
      } as any);
      await nextTick();
      app.scheduler.flush();
    }

    const snap1 = app.terminal.snapshot().lines.join("\n");
    expect(snap1).toContain("/e");
    expect(snap1).not.toContain("/a");

    app.events.dispatch({ type: "keydown", key: "Tab", code: "Tab" } as any);
    await nextTick();
    app.scheduler.flush();

    expect(value.value).toBe("/e ");
    app.dispose();
  });
});
