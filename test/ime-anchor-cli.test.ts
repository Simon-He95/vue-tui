// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

function restoreGlobal(key: string, value: unknown): void {
  if (value === undefined) {
    delete (globalThis as any)[key];
    return;
  }
  setGlobal(key, value);
}

const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;
const originalNavigator = (globalThis as any).navigator;

if (!originalDocument) {
  const { Window } = await import("happy-dom");
  const window = new Window();
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("navigator", window.navigator);
  setGlobal("Node", window.Node);
  setGlobal("Element", window.Element);
  setGlobal("HTMLElement", window.HTMLElement);
  setGlobal("SVGElement", window.SVGElement);
  setGlobal("Event", window.Event);
  setGlobal("CustomEvent", window.CustomEvent);
  setGlobal("MouseEvent", window.MouseEvent);
  setGlobal("KeyboardEvent", window.KeyboardEvent);
  setGlobal("getComputedStyle", window.getComputedStyle.bind(window));
}

const { defineComponent, h, nextTick, ref } = await import("vue");
const { TInput, createTerminalApp } = await import("../src/index.js");

restoreGlobal("window", originalWindow);
restoreGlobal("document", originalDocument);
restoreGlobal("navigator", originalNavigator);

beforeEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).navigator;
});

afterEach(() => {
  restoreGlobal("window", originalWindow);
  restoreGlobal("document", originalDocument);
  restoreGlobal("navigator", originalNavigator);
});

describe("IME anchor (CLI/headless)", () => {
  it("keeps anchor from focused input when multiple inputs exist", async () => {
    const a = ref("abc");
    const b = ref("");
    const c = ref("");

    const App = defineComponent({
      name: "ImeAnchorMultiInputApp",
      setup() {
        return () =>
          h("div", null, [
            h(TInput as any, {
              x: 0,
              y: 0,
              w: 10,
              modelValue: a.value,
              "onUpdate:modelValue": (v: string) => (a.value = v),
              autoFocus: true,
              cursorToEndOnFirstFocus: true,
              cursorBlink: false,
            }),
            h(TInput as any, {
              x: 0,
              y: 2,
              w: 10,
              modelValue: b.value,
              "onUpdate:modelValue": (v: string) => (b.value = v),
              cursorBlink: false,
            }),
            h(TInput as any, {
              x: 0,
              y: 4,
              w: 10,
              modelValue: c.value,
              "onUpdate:modelValue": (v: string) => (c.value = v),
              cursorBlink: false,
            }),
          ]);
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 8, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    const anchor = app.getImeAnchor();
    expect(anchor).not.toBe(null);
    expect(anchor!.cellY).toBe(0);
    // x=0, padX=1, cursor at end of 'abc' -> col=3 => 1+3=4
    expect(anchor!.cellX).toBe(4);

    app.dispose();
  });

  it("updates anchor immediately after key input (no flush)", async () => {
    const value = ref("");

    const App = defineComponent({
      name: "ImeAnchorImmediateUpdateApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 40, rows: 6, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    const initial = app.getImeAnchor();
    expect(initial).not.toBe(null);
    expect(initial!.cellY).toBe(0);
    // x=0, padX=1, cursor at 0 -> 1+0=1
    expect(initial!.cellX).toBe(1);

    app.events.dispatch({ type: "keydown", key: "你", code: "" } as any);
    const afterNi = app.getImeAnchor();
    expect(afterNi).not.toBe(null);
    // '你' is wide (2 cells): 1+2=3
    expect(afterNi!.cellX).toBe(3);

    app.events.dispatch({ type: "keydown", key: "好", code: "" } as any);
    const afterNiHao = app.getImeAnchor();
    expect(afterNiHao).not.toBe(null);
    // '你好' is 4 cells: 1+4=5
    expect(afterNiHao!.cellX).toBe(5);

    app.dispose();
  });
});
