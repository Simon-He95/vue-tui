import { createTerminalApp } from "../src/cli.js";
import { TRenderPlane, TText, TView } from "../src/vue.js";
import { defineComponent, getCurrentInstance, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";

describe("headless fragment moves", () => {
  it.each([["b"], ["c"]])("removes or replaces moved nested planes with %s", async (nextKey) => {
    const keys = ref(["a", "b"]);
    const errors: unknown[] = [];
    let hostChildren: () => readonly unknown[] = () => [];
    const App = defineComponent({
      setup() {
        const instance = getCurrentInstance()!;
        hostChildren = () => instance.subTree.el!.children;
        return () =>
          h(TView, { x: 0, y: 0, w: 40, h: 10 }, () =>
            keys.value.map((key) =>
              h(TRenderPlane, { key, plane: "chrome" }, () =>
                keys.value.map((inner, y) =>
                  h(TRenderPlane, { key: inner, plane: "chrome" }, () => [
                    h(TText, { x: 0, y, value: `preview-${key}${inner}` }),
                  ]),
                ),
              ),
            ),
          );
      },
    });
    const app = createTerminalApp({ cols: 40, rows: 10, component: App });
    app.app.config.errorHandler = (error) => errors.push(error);
    try {
      app.mount();
      await nextTick();
      keys.value = ["b", "a"];
      await nextTick();
      const moved = [...hostChildren()];
      keys.value = [nextKey];
      await nextTick();
      keys.value = [nextKey];
      await nextTick();
      expect(errors).toEqual([]);
      expect(new Set(moved).size).toBe(moved.length);
      app.scheduler.flushNow();
      expect(app.terminal.snapshot().lines.join("\n")).toContain(`preview-${nextKey}${nextKey}`);
      keys.value = [];
      await nextTick();
      expect(hostChildren()).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      app.dispose();
    }
  });
});
