import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, vShow, withDirectives } from "vue";
import { TList, TText, TView } from "../src/index.js";
import { TRenderPlane, useTerminal } from "../src/vue.js";
import { createTerminalApp } from "../src/cli.js";
import { normalizeCellRect } from "../src/vue/utils/rect.js";
import { disableRaf, installRaf, rowText } from "./helpers/list.js";

describe("TList clipping", () => {
  it("normalizes fractional cell rects by flooring start and end edges", () => {
    expect(normalizeCellRect({ x: 0.2, y: 1.2, w: 0.7, h: 0.7 })).toEqual({
      x: 0,
      y: 1,
      w: 0,
      h: 0,
    });
    expect(normalizeCellRect({ x: 0.2, y: 0.2, w: 0.9, h: 1.9 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 2,
    });
  });

  it("uses clipped viewport height for wheel scroll range", async () => {
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedWheelViewportApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");
    } finally {
      app.dispose();
    }
  });

  it("click and wheel stay aligned with rows after clipped viewport height changes", async () => {
    const onUpdateModelValue = vi.fn();
    let setHeight!: (value: number) => void;
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "ClippedViewportInteractionApp",
      setup() {
        const height = ref(4);
        setHeight = (value) => {
          height.value = value;
        };
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: height.value },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 20,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 24, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      setHeight(20);
      await nextTick();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: -100, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-79");

      app.events.dispatch({ type: "click", cellX: 0, cellY: 2, time: 1_020 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(81);
      expect(rowText(app, 2)).toBe("item-81");
    } finally {
      app.dispose();
    }
  });

  it("keeps paint, wheel, and click aligned when TList is clipped from the top", async () => {
    const onUpdateModelValue = vi.fn();
    const items = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    const App = defineComponent({
      name: "TopClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4, scrollY: 2 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("item-2");

      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 990 });
      app.scheduler.flushNow();
      await nextTick();

      expect(rowText(app, 0)).toBe("item-96");

      app.events.dispatch({ type: "click", cellX: 0, cellY: 1, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(97);
      expect(rowText(app, 1)).toBe("item-97");
      expect(app.terminal.getRow(1)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("uses clipped viewport height for detached PageDown anchor", async () => {
    const items = Array.from({ length: 200 }, (_, index) => `item-${index}`);
    const onUpdateModelValue = vi.fn();
    const App = defineComponent({
      name: "ClippedPageDownViewportApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 12, h: 4 },
            {
              default: () =>
                h(TList, {
                  x: 0,
                  y: 0,
                  w: 12,
                  h: 10,
                  items,
                  modelValue: 0,
                  autoFocus: true,
                  "onUpdate:modelValue": onUpdateModelValue,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();
      app.events.dispatch({ type: "wheel", cellX: 0, cellY: 0, deltaY: 10000, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();

      app.events.dispatch({ type: "keydown", key: "PageDown", code: "PageDown", time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();

      expect(onUpdateModelValue).toHaveBeenLastCalledWith(107);
      expect(rowText(app, 0)).toBe("item-104");
    } finally {
      app.dispose();
    }
  });

  it("clips list content from the left without rebasing visible text", () => {
    const App = defineComponent({
      name: "LeftClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 7, h: 3 },
            {
              default: () =>
                h(TList, {
                  x: -3,
                  y: 0,
                  w: 10,
                  h: 3,
                  items: ["0123456789", "abcdefghij", "klmnopqrst"],
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(rowText(app, 0)).toBe("3456789");
      expect(app.terminal.getRow(0)[0]?.style.inverse).toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("does not split wide characters incorrectly when horizontally clipped", () => {
    const App = defineComponent({
      name: "WideCharClippedTListApp",
      setup() {
        return () =>
          h(
            TView,
            { x: 0, y: 0, w: 2, h: 2 },
            {
              default: () =>
                h(TList, {
                  x: -1,
                  y: 0,
                  w: 3,
                  h: 2,
                  items: ["你a", "b"],
                  modelValue: 0,
                  autoFocus: true,
                }),
            },
          );
      },
    });
    const app = createTerminalApp({ cols: 20, rows: 8, component: App });

    try {
      app.mount();
      app.scheduler.flushNow();

      expect(app.terminal.getRow(0)[0]?.ch).toBe(" ");
      expect(app.terminal.getRow(0)[1]?.ch).toBe("a");
      expect(app.terminal.getRow(0)[0]?.continuation).not.toBe(true);
      expect(app.terminal.getRow(0)[1]?.continuation).not.toBe(true);
    } finally {
      app.dispose();
    }
  });

  it("uses the normalized painted rect for fractional hit testing", async () => {
    const onUpdateModelValue = vi.fn();
    const app = createTerminalApp({
      cols: 20,
      rows: 8,
      component: TList,
      props: {
        x: 0.5,
        y: 0.5,
        w: 12,
        h: 4,
        items: Array.from({ length: 10 }, (_, index) => `item-${index}`),
        modelValue: 0,
        autoFocus: true,
        "onUpdate:modelValue": onUpdateModelValue,
      },
    });

    try {
      app.mount();
      app.scheduler.flushNow();

      app.events.dispatch({ type: "click", cellX: 0, cellY: 3, time: 1_000 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onUpdateModelValue).toHaveBeenLastCalledWith(3);

      app.events.dispatch({ type: "click", cellX: 0, cellY: 4, time: 1_010 });
      app.scheduler.flushNow();
      await nextTick();
      expect(onUpdateModelValue).toHaveBeenCalledTimes(1);
    } finally {
      app.dispose();
    }
  });
});
