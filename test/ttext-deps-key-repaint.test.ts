import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { TerminalProvider, TText } from "../src/index.js";
import { useTerminal } from "../src/vue.js";

// Make rAF deterministic (TerminalProvider scheduler uses it).
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

describe("TText depsKey", () => {
  it("repaints when depsKey changes even if value is stable", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const depsKey = ref(0);
    let terminal: ReturnType<typeof useTerminal>["terminal"] | null = null;

    const Expose = defineComponent({
      name: "ExposeTerminal",
      setup() {
        terminal = useTerminal().terminal;
        return () => null;
      },
    });

    const App = defineComponent({
      name: "TTextDepsKeyApp",
      setup() {
        const cols = 12;
        const rows = 3;
        const value = "HELLO";
        return () =>
          h(
            TerminalProvider,
            { cols, rows },
            {
              default: () => [
                h(Expose),
                h(TText, {
                  x: 0,
                  y: 0,
                  w: cols,
                  value,
                  style: { fg: "whiteBright" },
                  depsKey: depsKey.value,
                }),
              ],
            },
          );
      },
    });

    const app = createApp(App);
    app.mount(root);
    await nextTick();

    expect(terminal).not.toBe(null);
    expect(terminal!.getCell(0, 0).style.fg).toBe("whiteBright");

    // Simulate an external terminal write that "corrupts" the buffer without triggering a UI render.
    terminal!.put(0, 0, "H", { fg: "redBright" });
    expect(terminal!.getCell(0, 0).style.fg).toBe("redBright");

    // depsKey should force a repaint even though the visible value/style/rect did not change.
    depsKey.value += 1;
    await nextTick();

    expect(terminal!.getCell(0, 0).style.fg).toBe("whiteBright");

    app.unmount();
    root.remove();
  });
});
