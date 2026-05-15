import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createPromptMentionPlugin } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";

describe("TInput prompt navigation wrap", () => {
  it("wraps selection at list boundaries", async () => {
    const plugin = createPromptMentionPlugin();
    const value = ref("");

    const App = defineComponent({
      name: "PromptWrapApp",
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
            promptMaxItems: 10,
            promptSuggestions: [{ value: "/one" }, { value: "/two" }, { value: "/three" }],
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 6, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "/", code: "Slash" } as any);
    app.scheduler.flush();

    // From first item, ArrowUp wraps to last.
    app.events.dispatch({
      type: "keydown",
      key: "ArrowUp",
      code: "ArrowUp",
    } as any);
    app.scheduler.flush();

    // From last item, ArrowDown wraps back to first.
    app.events.dispatch({
      type: "keydown",
      key: "ArrowDown",
      code: "ArrowDown",
    } as any);
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "Tab", code: "Tab" } as any);
    app.scheduler.flush();

    expect(value.value).toBe("/one ");
    app.dispose();
  });
});
