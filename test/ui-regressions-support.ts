import { afterEach, beforeAll, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Terminal } from "../src/index.js";
import type { EventManager } from "../src/runtime.js";
import type { TerminalRuntime, TerminalScheduler } from "../src/vue.js";

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

(globalThis as any).getSelection = () => ({ toString: () => "" });

const {
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  vShow,
  watch,
  watchEffect,
  withDirectives,
} = await import("vue");

const {
  createPromptMentionPlugin,
  TerminalProvider,
  TBox,
  TDialog,
  TInput,
  TInputBox,
  TList,
  TLink,
  TPathPicker,
  TRenderPlane,
  TSelect,
  TText,
  TView,
  useLayout,
  useTerminal,
  useTerminalNode,
} = await import("../src/vue.js");

const { createEventManager } = await import("../src/runtime.js");

const { createCliEventManager, createTerminalApp, defaultTInputHostPlugin } =
  await import("../src/cli.js");
const { TVirtualList } = await import("../src/experimental.js");
const { useRenderNode } = await import("../src/vue/composables/use-render-node.js");

const spawnOutputsByCmd = new Map<string, string | null>();
const nodeSpawnStub = (cmd: string, ..._args: unknown[]) => {
  const child = new EventEmitter() as any;
  const stdout = new EventEmitter() as any;
  stdout.setEncoding = () => {};
  child.stdout = stdout;
  const output = spawnOutputsByCmd.has(cmd) ? spawnOutputsByCmd.get(cmd) : "clipboard-text";
  queueMicrotask(() => {
    if (typeof output === "string") stdout.emit("data", output);
    child.emit("close", typeof output === "string" ? 0 : 1);
  });
  return child;
};

// Make rAF deterministic in tests (TerminalProvider scheduler uses it).
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

beforeAll(() => {
  vi.clearAllMocks();
  (globalThis as any).__VT_NODE_SPAWN__ = nodeSpawnStub;
});

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
  events: () => EventManager | null;
  container: () => HTMLElement | null;
  runtime: () => TerminalRuntime | null;
  scheduler: () => TerminalScheduler | null;
  unmount: () => void;
};

function expectBoxBorder(
  lines: readonly string[],
  rect: { x: number; y: number; w: number; h: number },
): void {
  const { x, y, w, h } = rect;
  expect(lines[y]?.[x]).toBe("┌");
  expect(lines[y]?.[x + w - 1]).toBe("┐");
  expect(lines[y + h - 1]?.[x]).toBe("└");
  expect(lines[y + h - 1]?.[x + w - 1]).toBe("┘");

  for (let yy = y + 1; yy < y + h - 1; yy++) {
    expect(lines[yy]?.[x]).toBe("│");
    expect(lines[yy]?.[x + w - 1]).toBe("│");
  }

  for (let xx = x + 1; xx < x + w - 1; xx++) expect(lines[y + h - 1]?.[xx]).toBe("─");
}

async function mountTerminal(
  children: () => any,
  cols = 40,
  rows = 8,
  providerProps: Record<string, unknown> = {},
): Promise<Mounted> {
  const root = document.createElement("div");
  document.body.appendChild(root);

  const exposed = {
    terminal: null as Terminal | null,
    events: null as EventManager | null,
    container: null as HTMLElement | null,
    runtime: null as TerminalRuntime | null,
    scheduler: null as TerminalScheduler | null,
  };

  const Expose = defineComponent({
    name: "ExposeTerminal",
    setup() {
      const ctx = useTerminal();
      exposed.terminal = ctx.terminal;
      exposed.runtime = ctx.runtime;
      exposed.scheduler = ctx.scheduler;
      watchEffect(() => {
        exposed.events = ctx.events.value;
        exposed.container = ctx.renderer.value?.container ?? null;
      });
      return () => null;
    },
  });

  const App = defineComponent({
    name: "TestApp",
    setup() {
      return () =>
        h(
          TerminalProvider,
          { cols, rows, ...providerProps },
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
    events: () => exposed.events,
    container: () => exposed.container,
    runtime: () => exposed.runtime,
    scheduler: () => exposed.scheduler,
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
  spawnOutputsByCmd.clear();
  (globalThis as any).__VT_NODE_SPAWN__ = nodeSpawnStub;
});

export {
  createApp,
  createCliEventManager,
  createTerminalApp,
  createEventManager,
  defaultTInputHostPlugin,
  createPromptMentionPlugin,
  defineComponent,
  expectBoxBorder,
  h,
  mountTerminal,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  spawnOutputsByCmd,
  TBox,
  TDialog,
  TerminalProvider,
  TInput,
  TInputBox,
  TList,
  TLink,
  TPathPicker,
  TRenderPlane,
  TSelect,
  TText,
  TVirtualList,
  TView,
  useLayout,
  useRenderNode,
  useTerminal,
  useTerminalNode,
  vShow,
  waitFor,
  watch,
  watchEffect,
  withDirectives,
};
