import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";
import { MENTION_TOKEN } from "../src/vue/components/input/utils/inlineTextTokens.js";

describe("TInput mention click", () => {
  it("passes pointer event modifiers to mentionClick", async () => {
    const value = ref(`${MENTION_TOKEN} `);
    const mentions = ref<readonly string[]>(["/tmp/foo.ts"]);
    const onMentionClick = vi.fn();

    const App = defineComponent({
      name: "MentionClickApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 30,
            h: 1,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            autoFocus: true,
            cursorBlink: false,
            onMentionClick,
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "click",
      cellX: 1,
      cellY: 0,
      metaKey: true,
    } as any);
    app.scheduler.flush();

    expect(onMentionClick).toHaveBeenCalledTimes(1);
    const [absPath, e] = onMentionClick.mock.calls[0] ?? [];
    expect(absPath).toBe("/tmp/foo.ts");
    expect(e?.metaKey).toBe(true);

    app.dispose();
  });
});
