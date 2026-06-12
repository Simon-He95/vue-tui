import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { TerminalProvider, TBox, TText } from "../src/index.js";
import { useRenderNode } from "../src/vue/composables/use-render-node.js";
import { useTerminal } from "../src/vue.js";

// Make rAF deterministic (TerminalProvider scheduler uses it).
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

describe("dirty-row rendering", () => {
  it("does not erase stable rows during unrelated updates", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const tick = ref(0);
    let snapshot: (() => readonly string[]) | null = null;

    const Expose = defineComponent({
      name: "ExposeSnapshot",
      setup() {
        const { terminal } = useTerminal();
        snapshot = () => terminal.snapshot().lines;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "DirtyRowsApp",
      setup() {
        const cols = 40;
        const rows = 12;
        return () =>
          h(
            TerminalProvider,
            { cols, rows },
            {
              default: () => [
                h(Expose),
                h(
                  TBox,
                  {
                    x: 0,
                    y: 0,
                    w: cols,
                    h: rows,
                    border: true,
                    title: "Root",
                    style: { fg: "blueBright" },
                  },
                  () => [
                    h(TText, {
                      x: 0,
                      y: 0,
                      w: cols - 2,
                      value: "HEADER",
                      style: { fg: "whiteBright" },
                    }),
                    h(
                      TBox,
                      {
                        x: 0,
                        y: 2,
                        w: 18,
                        h: rows - 5,
                        border: true,
                        title: "Left",
                        padding: 1,
                        style: { fg: "greenBright" },
                      },
                      () => [
                        h(TText, {
                          x: 0,
                          y: 0,
                          w: 14,
                          value: "Left stable",
                          style: { fg: "whiteBright" },
                        }),
                        h(TText, {
                          x: 0,
                          y: 2,
                          w: 14,
                          value: "Should stay",
                          style: { fg: "whiteBright" },
                        }),
                      ],
                    ),
                    h(
                      TBox,
                      {
                        x: 20,
                        y: 2,
                        w: cols - 22,
                        h: rows - 5,
                        border: true,
                        title: "Right",
                        padding: 1,
                        style: { fg: "yellowBright" },
                      },
                      () => [
                        h(TText, {
                          x: 0,
                          y: 0,
                          w: cols - 26,
                          value: `tick=${tick.value}`,
                          style: { fg: "yellowBright" },
                        }),
                      ],
                    ),
                  ],
                ),
              ],
            },
          );
      },
    });

    const app = createApp(App);
    app.mount(root);
    await nextTick();

    expect(snapshot).not.toBe(null);
    const s1 = snapshot!().join("\n");
    expect(s1).toContain("HEADER");
    expect(s1).toContain("Should stay");

    tick.value += 1;
    await nextTick();
    const s2 = snapshot!().join("\n");

    expect(s2).toContain("HEADER");
    expect(s2).toContain("Should stay");

    app.unmount();
    root.remove();
  });

  it("does not repaint a render node when rect and deps are unchanged", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const tick = ref(0);
    let paints = 0;

    const Probe = defineComponent({
      name: "StableRenderNodeProbe",
      setup() {
        useRenderNode(() => ({
          rect: { x: 0, y: 0, w: 4, h: 1 },
          deps: ["stable"],
          paint: () => {
            paints++;
          },
        }));
        return () => null;
      },
    });

    const App = defineComponent({
      setup() {
        return () =>
          h(
            TerminalProvider,
            { cols: 10, rows: 4 },
            {
              default: () => [h(Probe), h("span", String(tick.value))],
            },
          );
      },
    });

    const app = createApp(App);
    app.mount(root);
    await nextTick();
    expect(paints).toBe(1);

    tick.value++;
    await nextTick();
    expect(paints).toBe(1);

    app.unmount();
    root.remove();
  });
});
