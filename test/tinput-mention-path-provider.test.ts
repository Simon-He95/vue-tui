import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createPromptMentionPlugin, createTerminalApp, TInput } from "../src/index.js";
import { MENTION_TOKEN } from "../src/vue/components/input/utils/inlineTextTokens.js";

describe("TInput mention path provider", () => {
  it("accepts injected mention path suggestions without a Node workspace adapter", async () => {
    const value = ref("");
    const mentions = ref<string[]>([]);
    const plugin = createPromptMentionPlugin({
      mentionPathProvider: {
        suggest: async ({ input }) =>
          String(input).startsWith("d")
            ? [
                {
                  kind: "file",
                  display: "docs/readme.md",
                  completion: "docs/readme.md",
                  absPath: "/workspace/docs/readme.md",
                },
              ]
            : [],
      },
    });

    const App = defineComponent({
      name: "MentionPathProviderApp",
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
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = [...v]),
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 6, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "@",
      code: "Digit2",
      shiftKey: true,
    } as any);
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "d", code: "KeyD" } as any);
    app.scheduler.flush();

    await new Promise((resolve) => setTimeout(resolve, 120));
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "Enter",
      code: "Enter",
    } as any);
    await nextTick();
    app.scheduler.flush();

    expect(value.value).toBe(`${MENTION_TOKEN} `);
    expect(mentions.value).toEqual(["/workspace/docs/readme.md"]);
    app.dispose();
  });
});
