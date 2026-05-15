import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, watchEffect } from "vue";
import type { Terminal } from "../src/index.js";
import { TerminalProvider, TInput, TText } from "../src/index.js";
import { useTerminal } from "../src/vue.js";

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

type Mounted = {
  terminal: Terminal;
  container: () => HTMLElement | null;
  unmount: () => void;
};

async function mountTerminal(children: () => any, cols = 80, rows = 24): Promise<Mounted> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const exposed = {
    terminal: null as Terminal | null,
    container: null as HTMLElement | null,
  };

  const Expose = defineComponent({
    name: "ExposeTerminal",
    setup() {
      const ctx = useTerminal();
      exposed.terminal = ctx.terminal;
      watchEffect(() => {
        exposed.container = ctx.renderer.value?.container ?? null;
      });
      return () => null;
    },
  });

  const App = defineComponent({
    name: "PerfApp",
    setup() {
      return () =>
        h(
          TerminalProvider,
          { cols, rows },
          {
            default: () => [h(Expose), children()],
          },
        );
    },
  });

  const app = createApp(App);
  app.mount(root);
  await nextTick();

  const terminal = await waitFor(() => exposed.terminal);
  await waitFor(() => exposed.container);

  return {
    terminal,
    container: () => exposed.container,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("performance budgets", () => {
  it("single character input does not trigger full-screen dirtyRows", async () => {
    const cols = 80;
    const rows = 24;
    const yInput = 20;
    const value = ref("");

    const mounted = await mountTerminal(
      () => [
        h(TText, { x: 0, y: 0, w: cols, value: "HEADER" }),
        h(TInput, {
          x: 0,
          y: yInput,
          w: 20,
          h: 1,
          modelValue: value.value,
          "onUpdate:modelValue": (v: string) => (value.value = v),
          autoFocus: true,
          cursorBlink: false,
        }),
      ],
      cols,
      rows,
    );

    const terminal = mounted.terminal;
    const commits: Array<readonly number[] | null> = [];
    const off = terminal.on("commit", ({ dirtyRows }) => {
      commits.push(dirtyRows);
    });

    // Clear initial mount dirty state.
    terminal.commit();
    commits.length = 0;

    // Type one character (event-manager will route to focused node).
    const container = mounted.container()!;
    container.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }),
    );
    await nextTick();
    await nextTick();

    expect(value.value).toBe("a");
    const last = commits.at(-1);
    expect(last).not.toBeNull();
    const lastRows = last ?? [];
    // Budget: input is 1 line; allow a tiny overhead, but never a near full-screen repaint.
    expect(lastRows.length).toBeGreaterThan(0);
    expect(lastRows.length).toBeLessThanOrEqual(4);
    expect(lastRows.every((y) => y >= yInput - 1 && y <= yInput + 1)).toBe(true);
    expect(lastRows.length).toBeLessThan(rows / 2);

    off();
    mounted.unmount();
  });
});
