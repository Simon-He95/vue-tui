import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it } from "vitest";
import { TText } from "../src/index.js";
import { createTerminalApp } from "../src/cli.js";

describe("TText", () => {
  it("preserves explicit newlines without emitting control chars", async () => {
    const App = defineComponent({
      name: "NewlinesTextTest",
      setup() {
        return () => h(TText, { x: 0, y: 0, w: 5, h: 2, value: "A\nB" });
      },
    });

    const app = createTerminalApp({ cols: 5, rows: 2, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flush();

    expect(app.terminal.snapshot().lines).toEqual(["A    ", "B    "]);
    app.dispose();
  });

  it("wraps by cells and pads lines", async () => {
    const App = defineComponent({
      name: "WrapTextTest",
      setup() {
        return () => h(TText, { x: 0, y: 0, w: 4, h: 2, wrap: true, value: "1234567" });
      },
    });

    const app = createTerminalApp({ cols: 4, rows: 2, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flush();

    expect(app.terminal.snapshot().lines).toEqual(["1234", "567 "]);
    app.dispose();
  });

  it("wraps multi-line text and preserves hard line breaks", async () => {
    const App = defineComponent({
      name: "WrapMultilineTextTest",
      setup() {
        return () => h(TText, { x: 0, y: 0, w: 3, h: 3, wrap: true, value: "ab\ncdefg" });
      },
    });

    const app = createTerminalApp({ cols: 3, rows: 3, component: App });
    app.mount();
    await nextTick();
    app.scheduler.flush();

    expect(app.terminal.snapshot().lines).toEqual(["ab ", "cde", "fg "]);
    app.dispose();
  });
});
