import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { TInput } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("TInput quoted path autoconvert", () => {
  it("converts quoted absolute paths typed as plain characters into mentions", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const cachedImage = "/tmp/state/blob-cache/sess-2/attachments/paste-2.jpg";
    const raw =
      "'/Users/Simon/Downloads/heihei.jpg''/Users/Simon/Downloads/hostinger-recovery-codes.txt'";

    const App = defineComponent({
      name: "TInputQuotedPathApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 120,
            h: 1,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            collectMentions: true,
            mentions: mentions.value,
            "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
            autoFocus: true,
            cursorBlink: false,
            filePasteHandler: (absPath: string) =>
              absPath.endsWith(".jpg") ? cachedImage : absPath,
          });
      },
    });

    const app = createTerminalApp({
      cols: 120,
      rows: 3,
      component: App as any,
    });
    app.mount();
    await nextTick();
    app.scheduler.flush();

    for (const ch of raw) {
      app.events.dispatch({ type: "keydown", key: ch, code: "" } as any);
    }

    await nextTick();
    await nextTick();
    app.scheduler.flush();

    expect(mentions.value).toEqual([
      cachedImage,
      "/Users/Simon/Downloads/hostinger-recovery-codes.txt",
    ]);

    const row = Array.from({ length: 120 }, (_, x) => app.terminal.getCell(x, 0).ch).join("");
    expect(row.includes("[Image #1]")).toBe(true);
    expect(row.includes("[hostinger-recovery-codes.txt]")).toBe(true);

    app.dispose();
  });
});
