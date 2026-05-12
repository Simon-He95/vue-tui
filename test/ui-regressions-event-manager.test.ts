import { describe, expect, it } from "vitest";
import {
  createCliEventManager,
  createEventManager,
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
  TInput,
  TInputBox,
  TList,
  TPathPicker,
  TRenderPlane,
  TSelect,
  TText,
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
} from "./ui-regressions-support";

import type { PropType } from "vue";

describe("ui regressions event manager", () => {
  it("EventManager toggles native selection based on node selectable/focusable", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.style.userSelect = "text";

    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 1,
      focusable: true,
      handlers: {},
    });

    el.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    expect(el.style.userSelect).toBe("none");
    el.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0, bubbles: true }));
    expect(el.style.userSelect).toBe("text");

    events.dispose();

    const events2 = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events2.attach();
    events2.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 1,
      focusable: true,
      selectable: true,
      handlers: {},
    });
    el.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    expect(el.style.userSelect).toBe("text");
    el.dispatchEvent(new MouseEvent("mouseup", { clientX: 0, clientY: 0, bubbles: true }));
    expect(el.style.userSelect).toBe("text");

    events2.dispose();
    el.remove();
  });

  it("EventManager updates hit-testing index on update/visibility/unregister", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();

    const calls: string[] = [];
    const node = events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 1,
      handlers: { click: () => calls.push("click") },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    expect(calls).toEqual(["click"]);

    calls.length = 0;
    events.update(node.id, { rect: { x: 0, y: 5, w: 10, h: 1 } });
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    expect(calls).toEqual([]);
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 5, bubbles: true }));
    expect(calls).toEqual(["click"]);

    calls.length = 0;
    events.update(node.id, { visible: false });
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 5, bubbles: true }));
    expect(calls).toEqual([]);

    events.unregister(node.id);
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 5, bubbles: true }));
    expect(calls).toEqual([]);

    events.dispose();
    el.remove();
  });

  it("EventManager supports capture/bubble order and stopPropagation", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();

    const calls: string[] = [];
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 2 },
      zIndex: 0,
      handlers: {
        clickCapture: () => calls.push("parent-capture"),
        click: () => calls.push("parent-bubble"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 5, h: 1 },
      zIndex: 10,
      handlers: {
        clickCapture: () => calls.push("child-capture"),
        click: () => calls.push("child-target"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    expect(calls).toEqual(["parent-capture", "child-capture", "child-target", "parent-bubble"]);

    calls.length = 0;
    events.dispose();

    const events2 = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events2.attach();
    events2.register({
      rect: { x: 0, y: 0, w: 10, h: 2 },
      zIndex: 0,
      handlers: {
        clickCapture: (e: any) => {
          calls.push("parent-capture");
          e.stopPropagation();
        },
        click: () => calls.push("parent-bubble"),
      },
    });
    events2.register({
      rect: { x: 0, y: 0, w: 5, h: 1 },
      zIndex: 10,
      handlers: {
        clickCapture: () => calls.push("child-capture"),
        click: () => calls.push("child-target"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    expect(calls).toEqual(["parent-capture"]);

    events2.dispose();
    el.remove();
  });

  it("EventManager dispatches pointerenter/pointerleave for hover paths", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();

    const calls: string[] = [];
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 2 },
      zIndex: 0,
      handlers: {
        pointerenter: () => calls.push("parent-enter"),
        pointerleave: () => calls.push("parent-leave"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 5, h: 1 },
      zIndex: 10,
      handlers: {
        pointerenter: () => calls.push("child-enter"),
        pointerleave: () => calls.push("child-leave"),
      },
    });

    el.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0, bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousemove", { clientX: 7, clientY: 0, bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 5, bubbles: true }));

    expect(calls).toEqual(["parent-enter", "child-enter", "child-leave", "parent-leave"]);

    events.dispose();
    el.remove();
  });

  it("CliEventManager dispatches pointerenter/pointerleave for hover paths", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 2 },
      zIndex: 0,
      handlers: {
        pointerenter: () => calls.push("parent-enter"),
        pointerleave: () => calls.push("parent-leave"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 5, h: 1 },
      zIndex: 10,
      handlers: {
        pointerenter: () => calls.push("child-enter"),
        pointerleave: () => calls.push("child-leave"),
      },
    });

    events.dispatch({ type: "pointermove", cellX: 0, cellY: 0 });
    events.dispatch({ type: "pointermove", cellX: 7, cellY: 0 });
    events.dispatch({ type: "pointermove", cellX: 0, cellY: 5 });

    expect(calls).toEqual(["parent-enter", "child-enter", "child-leave", "parent-leave"]);
    events.dispose();
  });

  it("EventManager does not bubble through equal hitboxes from stale remount nodes", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerup: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerup: () => calls.push("current"),
      },
    });

    el.dispatchEvent(new MouseEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));
    el.dispatchEvent(new MouseEvent("pointerup", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["current"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager does not bubble through equal hitboxes from stale remount nodes", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerup: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerup: () => calls.push("current"),
      },
    });

    events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
    events.dispatch({ type: "pointerup", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["current"]);
    events.dispose();
  });

  it("EventManager lets later registration win when rect and zIndex match", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["current"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager lets later registration win when rect and zIndex match", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["current"]);
    events.dispose();
  });

  it("EventManager keeps zIndex priority over later same-rect registration", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: (e: any) => {
          calls.push("top");
          e.stopPropagation();
        },
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 5,
      focusable: true,
      handlers: {
        click: () => calls.push("lower"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["top"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager keeps zIndex priority over later same-rect registration", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: (e: any) => {
          calls.push("top");
          e.stopPropagation();
        },
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 5,
      focusable: true,
      handlers: {
        click: () => calls.push("lower"),
      },
    });

    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["top"]);
    events.dispose();
  });

  it("EventManager preserves non-focusable same-rect siblings while filtering stale focusable nodes", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      handlers: {
        click: () => calls.push("container"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["current", "container"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager preserves non-focusable same-rect siblings while filtering stale focusable nodes", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("stale"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      handlers: {
        click: () => calls.push("container"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["current", "container"]);
    events.dispose();
  });

  it("EventManager does not treat overlapping non-identical rects as stale", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 5 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("outer"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 4 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("inner"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["inner", "outer"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager does not treat overlapping non-identical rects as stale", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 5 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("outer"),
      },
    });
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 4 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("inner"),
      },
    });

    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["inner", "outer"]);
    events.dispose();
  });

  it("EventManager restores an older same-rect node after unregistering the newer node", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("old"),
      },
    });
    const current = events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));
    events.unregister(current.id);
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["current", "old"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager restores an older same-rect node after unregistering the newer node", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("old"),
      },
    });
    const current = events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        click: () => calls.push("current"),
      },
    });

    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });
    events.unregister(current.id);
    events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });

    expect(calls).toEqual(["current", "old"]);
    events.dispose();
  });

  it("EventManager replaces stale same-rect focus before key dispatch", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    const stale = events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        keydown: () => calls.push("stale"),
      },
    });
    events.focus(stale.id);
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerdown: () => calls.push("current-pointerdown"),
        keydown: () => calls.push("current-keydown"),
      },
    });

    el.dispatchEvent(new MouseEvent("pointerdown", { clientX: 0, clientY: 0, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

    expect(calls).toEqual(["current-pointerdown", "current-keydown"]);
    events.dispose();
    el.remove();
  });

  it("CliEventManager replaces stale same-rect focus before key dispatch", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    const stale = events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        keydown: () => calls.push("stale"),
      },
    });
    events.focus(stale.id);
    events.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        pointerdown: () => calls.push("current-pointerdown"),
        keydown: () => calls.push("current-keydown"),
      },
    });

    events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
    events.dispatch({
      type: "keydown",
      key: "Enter",
      code: "Enter",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
    });

    expect(calls).toEqual(["current-pointerdown", "current-keydown"]);
    events.dispose();
  });

  it("EventManager prevents click-through via bubble ordering across zIndex", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();

    const calls: string[] = [];

    // Underlay: a 1-row hitbox behind the modal (e.g. a transcript line action).
    events.register({
      rect: { x: 0, y: 0, w: 20, h: 1 },
      zIndex: 10,
      handlers: {
        click: () => calls.push("underlay"),
      },
    });

    // Modal/dialog container: larger rect but higher zIndex; should stop propagation
    // before the underlay sees the bubble event.
    events.register({
      rect: { x: 0, y: 0, w: 20, h: 5 },
      zIndex: 1000,
      handlers: {
        click: (e: any) => {
          calls.push("modal");
          e.stopPropagation();
        },
      },
    });

    // A 1-row target inside the modal (e.g. a button/input).
    events.register({
      rect: { x: 1, y: 0, w: 5, h: 1 },
      zIndex: 1001,
      handlers: {
        click: () => calls.push("target"),
      },
    });

    el.dispatchEvent(new MouseEvent("click", { clientX: 2, clientY: 0, bubbles: true }));
    expect(calls).toEqual(["target", "modal"]);

    events.dispose();
    el.remove();
  });

  it("EventManager still allows clicking a modal backdrop while focus is locked to the dialog", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();

    const calls: string[] = [];

    events.register({
      rect: { x: 0, y: 0, w: 20, h: 10 },
      zIndex: 10,
      handlers: {
        click: () => calls.push("underlay"),
      },
    });

    events.register({
      rect: { x: 0, y: 0, w: 20, h: 10 },
      zIndex: 1000,
      handlers: {
        click: () => calls.push("backdrop"),
      },
    });

    const modal = events.register({
      rect: { x: 5, y: 2, w: 10, h: 5 },
      zIndex: 1001,
      focusable: true,
      handlers: {
        click: () => calls.push("modal"),
      },
    });

    events.focus(modal.id);
    el.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true }));

    expect(calls).toEqual(["backdrop"]);

    events.dispose();
    el.remove();
  });

  it("Keyboard event includes combo and bubbles via ancestors", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const combos: string[] = [];

    const parent = events.register({
      rect: { x: 0, y: 0, w: 10, h: 10 },
      zIndex: 0,
      handlers: {
        keydownCapture: (e: any) => combos.push(`parent-capture:${e.combo}`),
        keydown: (e: any) => combos.push(`parent-bubble:${e.combo}`),
      },
    });
    const child = events.register({
      rect: { x: 1, y: 1, w: 3, h: 1 },
      zIndex: 10,
      focusable: true,
      handlers: {
        keydownCapture: (e: any) => combos.push(`child-capture:${e.combo}`),
        keydown: (e: any) => combos.push(`child-target:${e.combo}`),
      },
    });

    events.focus(child.id);
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        code: "ArrowLeft",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(combos).toEqual([
      "parent-capture:Meta+Shift+ArrowLeft",
      "child-capture:Meta+Shift+ArrowLeft",
      "child-target:Meta+Shift+ArrowLeft",
      "parent-bubble:Meta+Shift+ArrowLeft",
    ]);

    events.unregister(parent.id);
    events.unregister(child.id);
    events.dispose();
    el.remove();
  });

  it("EventManager routes keydown to the top modal layer when focus is behind it", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const events = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    events.attach();
    const calls: string[] = [];

    const underlay = events.register({
      rect: { x: 0, y: 20, w: 30, h: 1 },
      zIndex: 1002,
      focusable: true,
      handlers: {
        keydownCapture: () => calls.push("underlay-capture"),
        keydown: () => calls.push("underlay"),
      },
    });

    const modal = events.register({
      rect: { x: 0, y: 0, w: 30, h: 10 },
      zIndex: 1300,
      focusable: true,
      handlers: {
        keydownCapture: () => calls.push("modal-capture"),
        keydown: () => calls.push("modal"),
      },
    });

    const modalButton = events.register({
      rect: { x: 2, y: 8, w: 10, h: 1 },
      zIndex: 1310,
      focusable: true,
      handlers: {
        keydown: () => calls.push("modal-button"),
      },
    });

    // Simulate stale focus on a lower dialog button.
    events.focus(underlay.id);
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        code: "ArrowRight",
        bubbles: true,
      }),
    );

    expect(calls).toEqual(["modal-capture", "modal-button", "modal"]);

    events.unregister(modalButton.id);
    events.unregister(modal.id);
    events.unregister(underlay.id);
    events.dispose();
    el.remove();
  });

  it("CliEventManager routes keydown to the top modal layer when focus is behind it", async () => {
    const events = createCliEventManager();
    const calls: string[] = [];

    const underlay = events.register({
      rect: { x: 0, y: 20, w: 30, h: 1 },
      zIndex: 1002,
      focusable: true,
      handlers: {
        keydownCapture: () => calls.push("underlay-capture"),
        keydown: () => calls.push("underlay"),
      },
    });

    const modal = events.register({
      rect: { x: 0, y: 0, w: 30, h: 10 },
      zIndex: 1300,
      focusable: true,
      handlers: {
        keydownCapture: () => calls.push("modal-capture"),
        keydown: () => calls.push("modal"),
      },
    });

    const modalButton = events.register({
      rect: { x: 2, y: 8, w: 10, h: 1 },
      zIndex: 1310,
      focusable: true,
      handlers: {
        keydown: () => calls.push("modal-button"),
      },
    });

    events.focus(underlay.id);
    events.dispatch({
      type: "keydown",
      key: "ArrowRight",
      code: "ArrowRight",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      repeat: false,
    });

    expect(calls).toEqual(["modal-capture", "modal-button", "modal"]);

    events.unregister(modalButton.id);
    events.unregister(modal.id);
    events.unregister(underlay.id);
    events.dispose();
  });

  it("createEventManager attaches DOM listeners by default", () => {
    const clicks: string[] = [];
    const el = document.createElement("div");
    document.body.appendChild(el);

    const manager = createEventManager(el, { cellWidth: 1, cellHeight: 1 });
    manager.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 0,
      focusable: true,
      handlers: {
        click: () => clicks.push("click"),
      },
    });

    // No manual .attach() call — should work because default is auto-attach.
    el.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 0, bubbles: true }));

    expect(clicks).toEqual(["click"]);

    manager.dispose();
    el.remove();
  });

  it("createEventManager can defer DOM listener attachment", () => {
    const clicks: string[] = [];
    const el = document.createElement("div");
    document.body.appendChild(el);

    const manager = createEventManager(el, { cellWidth: 1, cellHeight: 1 }, {
      deferAttach: true,
    });

    manager.register({
      rect: { x: 0, y: 0, w: 10, h: 1 },
      zIndex: 0,
      focusable: true,
      handlers: {
        click: () => clicks.push("click"),
      },
    });

    // Before attach — events should not be dispatched.
    el.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 0, bubbles: true }));
    expect(clicks).toEqual([]);

    // After attach — events should be dispatched.
    manager.attach();

    el.dispatchEvent(new MouseEvent("click", { clientX: 1, clientY: 0, bubbles: true }));
    expect(clicks).toEqual(["click"]);

    manager.dispose();
    el.remove();
  });
});
