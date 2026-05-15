import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import path from "node:path";

if (!(globalThis as any).document) {
  const { Window } = await import("happy-dom");
  const window = new Window();
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).navigator = window.navigator;
  (globalThis as any).Node = window.Node;
  (globalThis as any).Element = window.Element;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).SVGElement = window.SVGElement;
  (globalThis as any).Event = window.Event;
  (globalThis as any).CustomEvent = window.CustomEvent;
  (globalThis as any).MouseEvent = window.MouseEvent;
  (globalThis as any).KeyboardEvent = window.KeyboardEvent;
  (globalThis as any).getComputedStyle = window.getComputedStyle.bind(window);
}

const { createApp, defineComponent, h, nextTick, ref, watchEffect } = await import("vue");
const { TerminalProvider, TInput } = await import("../src/index.js");
const { useTerminal } = await import("../src/vue.js");

// Make rAF deterministic in tests (TerminalProvider scheduler uses it).
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

async function waitFor<T>(fn: () => T | null | undefined, tries = 50): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await nextTick();
  }
  throw new Error("waitFor timeout");
}

describe("TInput mention links", () => {
  it("emits href on mention chips for OSC 8 links", async () => {
    const absPath = path.resolve("paste.png");
    const expectedHref = pathToFileURL(absPath).toString();

    const root = document.createElement("div");
    document.body.appendChild(root);

    const exposed = {
      terminal: null as any,
    };

    const Expose = defineComponent({
      name: "ExposeTerminal",
      setup() {
        const ctx = useTerminal();
        watchEffect(() => {
          exposed.terminal = ctx.terminal;
        });
        return () => null;
      },
    });

    const App = defineComponent({
      name: "TestApp",
      setup() {
        const value = ref("\uFFF9 ");
        const mentions = ref([absPath]);
        return () =>
          h(
            TerminalProvider,
            { cols: 30, rows: 5 },
            {
              default: () => [
                h(Expose),
                h(TInput, {
                  x: 0,
                  y: 0,
                  w: 30,
                  modelValue: value.value,
                  "onUpdate:modelValue": (v: string) => (value.value = v),
                  mentions: mentions.value,
                  collectMentions: true,
                }),
              ],
            },
          );
      },
    });

    const app = createApp(App);
    app.mount(root);
    await waitFor(() => exposed.terminal);

    let foundX = -1;
    for (let x = 0; x < 30; x++) {
      if (exposed.terminal.getCell(x, 0).ch === "[") {
        foundX = x;
        break;
      }
    }

    expect(foundX).toBeGreaterThanOrEqual(0);
    const cell = exposed.terminal.getCell(foundX, 0);
    expect(cell.style.href).toBe(expectedHref);

    app.unmount();
    root.remove();
  });
});
