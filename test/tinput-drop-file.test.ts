import { describe, expect, it } from "vitest";
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
const nextDomTick = nextTick;
const { TerminalProvider, TInput } = await import("../src/index.js");
const { useTerminal } = await import("../src/vue.js");

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

async function waitFor<T>(fn: () => T | null | undefined, tries = 50): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await nextDomTick();
  }
  throw new Error("waitFor timeout");
}

function dispatchDrop(container: HTMLElement, file: { path?: string; name?: string }): void {
  const ev = new Event("drop", { bubbles: true, cancelable: true }) as any;
  const files = file.path || file.name ? [{ path: file.path, name: file.name }] : [];
  const dataTransfer = {
    files,
    types: files.length ? [] : ["text/plain"],
    getData: () => "",
  };
  Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
  container.dispatchEvent(ev);
}

describe("TInput drop file handling", () => {
  it("handles image and file drops differently", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const cachedImage = "/tmp/state/blob-cache/sess-9/attachments/paste-9.png";
    const filePath = "/tmp/docs/readme.txt";

    const exposed = { terminal: null as any };

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
      name: "DropFileApp",
      setup() {
        return () =>
          h(
            TerminalProvider,
            { cols: 80, rows: 3 },
            {
              default: () => [
                h(Expose),
                h(TInput as any, {
                  x: 0,
                  y: 0,
                  w: 80,
                  h: 1,
                  modelValue: value.value,
                  "onUpdate:modelValue": (v: string) => (value.value = v),
                  collectMentions: true,
                  mentions: mentions.value,
                  "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
                  autoFocus: true,
                  cursorBlink: false,
                  filePasteHandler: (absPath: string) =>
                    absPath.endsWith(".png") ? cachedImage : absPath,
                }),
              ],
            },
          );
      },
    });

    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = createApp(App);
    app.mount(root);
    await waitFor(() => exposed.terminal);

    const container = document.querySelector("[data-vt-container]") as HTMLElement | null;
    expect(container).not.toBeNull();

    dispatchDrop(container!, { path: "/tmp/drop/pic.png", name: "pic.png" });
    await nextTick();
    await nextTick();

    expect(mentions.value).toEqual([cachedImage]);

    dispatchDrop(container!, { path: filePath, name: "readme.txt" });
    await nextTick();
    await nextTick();

    expect(mentions.value).toEqual([cachedImage, filePath]);

    const row = Array.from({ length: 80 }, (_, x) => exposed.terminal.getCell(x, 0).ch).join("");
    expect(row.includes("[Image #1]")).toBe(true);
    expect(row.includes("[readme.txt]")).toBe(true);

    app.unmount();
    root.remove();
  });

  it("keeps dropped paths with spaces and backslashes intact", async () => {
    const value = ref("");
    const mentions = ref<readonly string[]>([]);

    const spacedPath = "/tmp/drop/my file.txt";
    const rawBackslashPath = "/tmp/drop/icon\\ sad\\\\12.png";
    const backslashPath = "/tmp/drop/icon sad\\12.png";
    const allowed = new Set([spacedPath, backslashPath]);

    const exposed = { terminal: null as any };

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
      name: "DropFileSpacesApp",
      setup() {
        return () =>
          h(
            TerminalProvider,
            { cols: 80, rows: 3 },
            {
              default: () => [
                h(Expose),
                h(TInput as any, {
                  x: 0,
                  y: 0,
                  w: 80,
                  h: 1,
                  modelValue: value.value,
                  "onUpdate:modelValue": (v: string) => (value.value = v),
                  collectMentions: true,
                  mentionWorkspace: "/tmp",
                  mentions: mentions.value,
                  "onUpdate:mentions": (v: readonly string[]) => (mentions.value = v),
                  autoFocus: true,
                  cursorBlink: false,
                  filePasteHandler: (absPath: string) => (allowed.has(absPath) ? absPath : null),
                }),
              ],
            },
          );
      },
    });

    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = createApp(App);
    app.mount(root);
    await waitFor(() => exposed.terminal);

    const container = document.querySelector("[data-vt-container]") as HTMLElement | null;
    expect(container).not.toBeNull();

    dispatchDrop(container!, { path: spacedPath, name: "my file.txt" });
    await nextTick();
    await nextTick();

    dispatchDrop(container!, { path: rawBackslashPath, name: "12.png" });
    await nextTick();
    await nextTick();

    expect(mentions.value).toEqual([spacedPath, backslashPath]);

    app.unmount();
    root.remove();
  });
});
