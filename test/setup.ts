import { Window } from "happy-dom";

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

if (!(globalThis as any).document) {
  const window = new Window();
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("navigator", window.navigator);
  setGlobal("Node", window.Node);
  setGlobal("Element", window.Element);
  setGlobal("HTMLElement", window.HTMLElement);
  setGlobal("SVGElement", window.SVGElement);
  setGlobal("Event", window.Event);
  setGlobal("EventTarget", window.EventTarget);
  setGlobal("ErrorEvent", window.ErrorEvent);
  setGlobal("CustomEvent", window.CustomEvent);
  setGlobal("MouseEvent", window.MouseEvent);
  setGlobal("KeyboardEvent", window.KeyboardEvent);
  setGlobal("getComputedStyle", window.getComputedStyle.bind(window));
}

if (!(globalThis as any).requestAnimationFrame) {
  setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
}

if (!(globalThis as any).cancelAnimationFrame) {
  setGlobal("cancelAnimationFrame", () => {});
}
